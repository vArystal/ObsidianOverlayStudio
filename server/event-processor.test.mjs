import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createEventBus } from './event-bus.mjs'
import { createEventProcessor, normalizeKickEvent } from './event-processor.mjs'
import { createIntegrationStore } from './store.mjs'

const encryptionKey = 'event-test-encryption-key-that-is-over-thirty-two-characters'

function signedFixture(privateKey, payload, id = 'evt-1', type = 'channel.followed') {
  const rawBody = Buffer.from(JSON.stringify(payload)); const timestamp = new Date().toISOString()
  const signature = sign('RSA-SHA256', Buffer.from(`${id}.${timestamp}.${rawBody}`), privateKey).toString('base64')
  return { rawBody, headers: { 'kick-event-message-id': id, 'kick-event-message-timestamp': timestamp, 'kick-event-signature': signature, 'kick-event-type': type, 'kick-event-version': '1' } }
}

test('normalization marks fixtures and preserves only widget fields', () => {
  const event = normalizeKickEvent({ id: 'test-1', type: 'chat.message.sent', test: true, payload: { message_id: 'm', content: 'TEST', created_at: 'now', sender: { user_id: 1, username: 'tester', identity: { badges: [{ type: 'test' }] } }, broadcaster: { user_id: 2 } } })
  assert.equal(event.test, true)
  assert.equal(event.data.content, 'TEST')
  assert.equal(event.data.sender.username, 'tester')
  assert.equal('email' in event.data.sender, false)
})

test('signed follow is published once and updates session metrics', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const store = createIntegrationStore({ filePath: '/unused/event-test.json', encryptionKey, persist: false }); await store.init()
  const { connection } = await store.saveConnection({ account: { userId: 9, username: 'owner' }, channel: { slug: 'owner' }, scopes: [], subscriptions: [] }, { access_token: 'x' })
  const bus = createEventBus(); const delivered = []; bus.subscribe(connection.runtimeKey, (event) => delivered.push(event))
  let keyRequests = 0
  const processor = createEventProcessor({ store, bus, getPublicKey: async () => { keyRequests += 1; return publicKey.export({ type: 'spki', format: 'pem' }) } })
  const fixture = signedFixture(privateKey, { broadcaster: { user_id: 9 }, follower: { user_id: 4, username: 'new-follower' } })
  const first = await processor.process(fixture.headers, fixture.rawBody)
  const duplicate = await processor.process(fixture.headers, fixture.rawBody)
  assert.equal(first.status, 204)
  assert.equal(duplicate.duplicate, true)
  assert.equal(delivered.length, 1)
  assert.equal((await store.getConnection(connection.id)).sessionFollowerCount, 1)
  assert.equal((await store.getConnection(connection.id)).lastFollower.username, 'new-follower')
  assert.equal(keyRequests, 2)
})

test('invalid signature retries with rotated public key then rejects', async () => {
  const one = generateKeyPairSync('rsa', { modulusLength: 2048 }); const two = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const store = createIntegrationStore({ filePath: '/unused/event-test.json', encryptionKey, persist: false }); await store.init()
  const bus = createEventBus(); let requests = 0
  const processor = createEventProcessor({ store, bus, getPublicKey: async () => { requests += 1; return two.publicKey.export({ type: 'spki', format: 'pem' }) } })
  const fixture = signedFixture(one.privateKey, { broadcaster: { user_id: 9 }, follower: { user_id: 4 } })
  const result = await processor.process(fixture.headers, fixture.rawBody)
  assert.equal(result.status, 401)
  assert.equal(result.reason, 'invalid_signature')
  assert.equal(requests, 2)
})

test('valid signature with malformed JSON is rejected without marking processed', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); const timestamp = new Date().toISOString(); const rawBody = Buffer.from('{')
  const signature = sign('RSA-SHA256', Buffer.from(`bad-json.${timestamp}.${rawBody}`), privateKey).toString('base64')
  const headers = { 'kick-event-message-id': 'bad-json', 'kick-event-message-timestamp': timestamp, 'kick-event-signature': signature, 'kick-event-type': 'channel.followed', 'kick-event-version': '1' }
  const store = createIntegrationStore({ filePath: '/unused/event-test.json', encryptionKey, persist: false }); await store.init()
  const processor = createEventProcessor({ store, bus: createEventBus(), getPublicKey: async () => publicKey.export({ type: 'spki', format: 'pem' }) })
  const result = await processor.process(headers, rawBody)
  assert.equal(result.status, 400)
  assert.equal(await store.isProcessed('bad-json'), false)
})
