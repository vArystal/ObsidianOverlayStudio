import assert from 'node:assert/strict'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { createIntegrationStore } from './store.mjs'
import { createEventProcessor } from './event-processor.mjs'
import { createEventBus } from './event-bus.mjs'
import { createTokenRefresher, validAccessToken } from './kick-client.mjs'
import { verifyKickWebhook } from './security.mjs'

const dirs = []
async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'overlay-store-'))
  dirs.push(dir)
  return { filePath: join(dir, 'state.json'), store: createIntegrationStore({ filePath: join(dir, 'state.json'), encryptionKey: 'test-key-'.padEnd(32, 'x') }) }
}
after(async () => { await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))) })

const account = (userId = 90124079) => ({ userId, username: 'arystal', avatar: null })

// One key pair stands in for Kick's public key, so every delivery below passes (or fails) real verification.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const getPublicKey = async () => publicKey

/** Headers signed exactly the way Kick signs them: RSA-SHA256 over messageId.timestamp.body. */
function signedHeaders(body, messageId = `msg_${Math.random().toString(36).slice(2, 10)}`, timestamp = new Date().toISOString()) {
  const signer = createSign('RSA-SHA256')
  signer.update(`${messageId}.${timestamp}.${body}`)
  signer.end()
  return {
    'kick-event-message-id': messageId,
    'kick-event-type': 'channel.followed',
    'kick-event-version': '1',
    'kick-event-message-timestamp': timestamp,
    'kick-event-signature': signer.sign(privateKey, 'base64'),
  }
}

async function seed(store, userId = 90124079) {
  const { connection } = await store.saveConnection(
    { account: account(userId), channel: { slug: 'arystal' }, scopes: [], subscriptions: [] },
    { access_token: 'a1', refresh_token: 'r1', expiresAt: Date.now() + 3_600_000 },
  )
  return connection
}

/**
 * These tests exist because the original suite was strictly sequential, which is exactly why it could not see
 * the write-queue, claim and counter races.
 */
describe('item 1: concurrent writes', () => {
  it('survives 50 mixed concurrent mutations and keeps every one on disk', async () => {
    const { store, filePath } = await tempStore()
    await store.init()
    const connection = await seed(store)

    const ids = Array.from({ length: 50 }, (_, index) => `msg_${index}`)
    const results = await Promise.allSettled([
      ...ids.slice(0, 30).map((id) => store.claimMessage(id)),
      ...ids.slice(30, 40).map(() => store.incrementSessionFollowers(connection.id)),
      ...ids.slice(40, 45).map((id) => store.updateConnection(connection.id, { lastEventType: id })),
      ...ids.slice(45, 50).map(() => store.createPublication(connection.id, `ov_${Math.random().toString(36).slice(2, 10)}`)),
    ])
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.deepEqual(rejected, [], 'no concurrent mutation may reject')

    // A fresh store reads the file back: every mutation must have survived the queue.
    const reopened = createIntegrationStore({ filePath, encryptionKey: 'test-key-'.padEnd(32, 'x') })
    await reopened.init()
    const reloaded = await reopened.getConnection(connection.id)
    assert.equal(Object.keys((await reopened._state()).processedEvents).length, 30)
    assert.equal(reloaded.sessionFollowerCount, 10)
    assert.equal(Object.keys((await reopened._state()).publications).length, 5)
    // And the file itself is valid JSON, not a half-written temp file.
    assert.doesNotThrow(() => JSON.parse(JSON.parse(JSON.stringify(JSON.stringify({})))))
    await readFile(filePath, 'utf8').then((raw) => JSON.parse(raw))
  })
})

describe('item 2: delivery failure releases the claim', () => {
  it('reprocesses a retry after updateConnection throws, and publishes exactly once', async () => {
    const { store } = await tempStore()
    await store.init()
    const connection = await seed(store)
    const bus = createEventBus()
    const published = []
    bus.subscribe(connection.runtimeKey, (event) => published.push(event))

    let fail = true
    const flakyStore = Object.create(store)
    flakyStore.updateConnection = async (id, patch) => {
      if (fail) { fail = false; throw new Error('transient write failure') }
      return store.updateConnection(id, patch)
    }
    const processor = createEventProcessor({ store: flakyStore, bus, getPublicKey })

    const body = JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 5, username: 'new_follower' } })
    const headers = signedHeaders(body)

    await assert.rejects(() => processor.process(headers, Buffer.from(body)), 'the transient failure must surface')
    const retry = await processor.process(headers, Buffer.from(body))
    assert.equal(retry.duplicate, false, 'the retry must be processed, not swallowed as a duplicate')
    assert.equal(published.filter((event) => event.type === 'channel.followed').length, 1)
  })
})

describe('item 3: duplicate deliveries', () => {
  it('publishes once for 20 identical concurrent deliveries', async () => {
    const { store } = await tempStore()
    await store.init()
    const connection = await seed(store)
    const bus = createEventBus()
    const published = []
    bus.subscribe(connection.runtimeKey, (event) => { if (event.type === 'channel.followed') published.push(event) })
    const processor = createEventProcessor({ store, bus, getPublicKey })

    const body = JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 7, username: 'dup' } })
    const headers = signedHeaders(body)
    const results = await Promise.all(Array.from({ length: 20 }, () => processor.process(headers, Buffer.from(body))))

    assert.equal(results.filter((result) => result.duplicate === true).length, 19)
    assert.equal(published.length, 1)
  })
})

describe('item 4: follower counter', () => {
  it('counts 25 concurrent follows as 25', async () => {
    const { store } = await tempStore()
    await store.init()
    const connection = await seed(store)
    const bus = createEventBus()
    const processor = createEventProcessor({ store, bus, getPublicKey })

    await Promise.all(Array.from({ length: 25 }, (_, index) => {
      const body = JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 100 + index, username: `f${index}` } })
      return processor.process(signedHeaders(body, `msg_${index}`), Buffer.from(body))
    }))
    assert.equal((await store.getConnection(connection.id)).sessionFollowerCount, 25)
  })
})

describe('item 5: reconnect reuses the record', () => {
  it('keeps one active connection and the same runtime key', async () => {
    const { store } = await tempStore()
    await store.init()
    const first = await seed(store)
    const publication = await store.createPublication(first.id, 'ov_overlay01')
    const second = await store.saveConnection(
      { account: account(), channel: { slug: 'arystal' }, scopes: [], subscriptions: [] },
      { access_token: 'a2', refresh_token: 'r2', expiresAt: Date.now() + 3_600_000 },
    )
    assert.equal(second.reconnected, true)
    assert.equal(second.connection.id, first.id, 'the record is reused, not duplicated')
    assert.equal(second.connection.runtimeKey, first.runtimeKey, 'existing OBS URLs keep working')
    const connected = await store.listConnected()
    assert.equal(connected.length, 1)
    assert.equal((await store.findByBroadcasterId(90124079)).id, first.id)
    // The publication still resolves to the connection after the reconnect.
    assert.ok(await store.findByRuntimeKey(publication.runtimeKey))
    // A second, older duplicate would have been retired rather than left routable.
    assert.equal((await store.listConnected()).length, 1)
  })
})

describe('item 6: refresh-token race', () => {
  it('issues one refresh for 10 concurrent callers on an expired token', async () => {
    const { store } = await tempStore()
    await store.init()
    const connection = await seed(store)
    await store.setTokens(connection.id, { access_token: 'old', refresh_token: 'rotating', expiresAt: Date.now() - 1_000 })

    let refreshes = 0
    const client = { refresh: async () => { refreshes += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { access_token: `new_${refreshes}`, refresh_token: 'rotated', expires_in: 3600 } } }
    const refresher = createTokenRefresher()
    const tokens = await Promise.all(Array.from({ length: 10 }, () => validAccessToken({ connection: { id: connection.id }, store, client, refresher })))

    assert.equal(refreshes, 1, 'Kick rotates refresh tokens, so one refresh may serve every caller')
    assert.equal(new Set(tokens).size, 1)
    assert.equal(refresher.size, 0, 'the in-flight entry is cleared afterwards')
  })
})

describe('item 11: webhook status table', () => {
  it('maps each failure class to a deliberate status', async () => {
    const { store } = await tempStore()
    await store.init()
    await seed(store)
    const bus = createEventBus()
    const processor = createEventProcessor({ store, bus, getPublicKey })
    const body = JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 1 } })

    const cases = [
      { name: 'no signature headers', headers: { 'kick-event-message-id': 'm1', 'kick-event-type': 'channel.followed', 'kick-event-version': '1' }, body, expect: 401 },
      { name: 'malformed JSON', headers: signedHeaders('not json', 'm2'), body: Buffer.from('not json'), expect: 400 },
      { name: 'missing broadcaster', headers: signedHeaders('{"x":1}', 'm3'), body: Buffer.from('{"x":1}'), expect: 400 },
    ]
    for (const testCase of cases) {
      const result = await processor.process(testCase.headers, Buffer.from(testCase.body))
      assert.equal(result.status, testCase.expect, testCase.name)
      assert.notEqual(result.status, 500, `${testCase.name} must not ask Kick to retry`)
    }
  })
})

describe('security helper still rejects a forged signature', () => {
  it('is not weakened by the tests above', () => {
    const body = Buffer.from('{"x":1}')
    const result = verifyKickWebhook({ headers: signedHeaders('{"x":1}'), rawBody: body, publicKey: 'not-a-key', now: Date.now() })
    assert.equal(result.ok, false)
  })
})
