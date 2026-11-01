import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { after, describe, it } from 'node:test'
import { createApp } from './app.mjs'
import { createEventProcessor } from './event-processor.mjs'
import { createIntegrationStore } from './store.mjs'
import { createEventBus } from './event-bus.mjs'
import { KICK_EVENT_TYPES } from './config.mjs'

const dirs = []
after(async () => { await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))) })
async function tempDir() { const dir = await mkdtemp(join(tmpdir(), 'overlay-app-')); dirs.push(dir); return dir }

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })

function signed(body, messageId, type = 'channel.followed', timestamp = new Date().toISOString()) {
  const signer = createSign('RSA-SHA256')
  signer.update(`${messageId}.${timestamp}.${body}`)
  signer.end()
  return {
    'kick-event-message-id': messageId,
    'kick-event-type': type,
    'kick-event-version': '1',
    'kick-event-message-timestamp': timestamp,
    'kick-event-signature': signer.sign(privateKey, 'base64'),
  }
}

async function processorWithConnection(store) {
  const bus = createEventBus()
  const { connection } = await store.saveConnection(
    { account: { userId: 90124079, username: 'arystal' }, channel: { slug: 'arystal' }, scopes: [], subscriptions: [] },
    { access_token: 'a', refresh_token: 'r', expiresAt: Date.now() + 3_600_000 },
  )
  return { processor: createEventProcessor({ store, bus, getPublicKey: async () => publicKey }), bus, connection }
}

describe('item 7: encryption key fails closed in production', () => {
  const baseConfig = { dataFile: join(tmpdir(), 'unused.json'), kickClientId: 'id', kickClientSecret: 'secret', kickRedirectUri: 'https://example/cb', publicApiUrl: 'https://api.example', appOrigins: ['https://example'], viewerPollMs: 60_000, missing: [], events: KICK_EVENT_TYPES }

  it('throws at startup without a key in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await assert.rejects(() => createApp({ config: baseConfig, persist: false }), /TOKEN_ENCRYPTION_KEY/)
      await assert.rejects(() => createApp({ config: { ...baseConfig, tokenEncryptionKey: 'short' }, persist: false }), /TOKEN_ENCRYPTION_KEY/)
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('still starts in development so local work is not blocked', async () => {
    const app = await createApp({ config: { ...baseConfig, dataFile: join(await tempDir(), 'state.json') }, persist: false })
    assert.ok(app.handler)
    await app.close()
  })
})

describe('item 11: status table completeness', () => {
  it('answers 202 for an unknown broadcaster so Kick does not retry', async () => {
    const store = await createIntegrationStore({ filePath: join(await tempDir(), 'state.json'), encryptionKey: 'k'.padEnd(32, 'k') }).init()
    const processor = createEventProcessor({ store, bus: createEventBus(), getPublicKey: async () => publicKey })
    const body = JSON.stringify({ broadcaster: { user_id: 42 }, follower: { user_id: 1 } })
    const result = await processor.process(signed(body, 'unknown_1'), Buffer.from(body))
    assert.equal(result.status, 202)
    assert.equal(result.reason, 'unknown_broadcaster')
  })

  it('answers 204 on a successful delivery and 401 on a bad signature', async () => {
    const store = await createIntegrationStore({ filePath: join(await tempDir(), 'state.json'), encryptionKey: 'k'.padEnd(32, 'k') }).init()
    const { processor } = await processorWithConnection(store)
    const body = JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 9 } })
    assert.equal((await processor.process(signed(body, 'ok_1'), Buffer.from(body))).status, 204)

    const tampered = Buffer.from(JSON.stringify({ broadcaster: { user_id: 90124079 }, follower: { user_id: 10 } }))
    const headers = signed(body, 'bad_1')
    assert.equal((await processor.process(headers, tampered)).status, 401)
  })
})

describe('item 12: viewer polling never overlaps', () => {
  it('skips a tick while the previous poll is still running', async () => {
    const dir = await tempDir()
    let resolveFirst
    let calls = 0
    const slowFetch = async (url) => {
      if (String(url).includes('/public/v1/users/livestreams')) {
        calls += 1
        if (calls === 1) await new Promise((resolve) => { resolveFirst = resolve })
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ data: [] }) }
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ data: [] }) }
    }
    const app = await createApp({
      config: { dataFile: join(dir, 'state.json'), tokenEncryptionKey: 'k'.padEnd(32, 'k'), kickClientId: 'id', kickClientSecret: 'secret', kickRedirectUri: 'https://example/cb', publicApiUrl: 'https://api.example', appOrigins: ['https://example'], viewerPollMs: 60_000, missing: [], events: KICK_EVENT_TYPES },
      fetchImpl: slowFetch,
    })
    const { connection } = await app.store.saveConnection(
      { account: { userId: 90124079, username: 'arystal' }, channel: { slug: 'arystal' }, scopes: [], subscriptions: [] },
      { access_token: 'a', refresh_token: 'r', expiresAt: Date.now() + 3_600_000 },
    )
    assert.ok(connection)

    const first = app.pollViewerCounts()
    // The second tick arrives while the first is blocked on Kick.
    const second = await app.pollViewerCounts()
    assert.deepEqual(second, { skipped: true })
    // Wait until the first poll is actually parked inside the Kick request before releasing it.
    for (let spin = 0; spin < 200 && !resolveFirst; spin += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    assert.ok(resolveFirst, 'the first poll should be in flight')
    resolveFirst()
    await first
    assert.equal(calls, 1, 'only one poll may be in flight')
    await app.close()
  })
})
