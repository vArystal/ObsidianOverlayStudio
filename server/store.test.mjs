import test from 'node:test'
import assert from 'node:assert/strict'
import { createIntegrationStore } from './store.mjs'

const encryptionKey = 'test-encryption-key-that-is-longer-than-thirty-two-characters'

async function fixtureStore() {
  const store = createIntegrationStore({ filePath: '/unused/test-store.json', encryptionKey, persist: false })
  await store.init()
  return store
}

const input = {
  account: { userId: 72, username: 'channel-owner', avatar: null },
  channel: { slug: 'channel-owner' },
  scopes: ['user:read', 'channel:read', 'events:subscribe'],
  subscriptions: [{ id: 'sub-1' }],
}

const tokens = { access_token: 'private-access', refresh_token: 'private-refresh', expiresAt: Date.now() + 60_000 }

test('connection stores encrypted tokens and returns only opaque browser credentials', async () => {
  const store = await fixtureStore()
  const { connection, managementToken } = await store.saveConnection(input, tokens)
  const serialized = JSON.stringify(store._state())
  assert.equal(serialized.includes('private-access'), false)
  assert.equal(serialized.includes(managementToken), false)
  assert.deepEqual(await store.getTokens(connection.id), tokens)
  assert.equal((await store.authenticate(managementToken)).id, connection.id)
  assert.equal(await store.authenticate('wrong-token'), null)
  const publicConnection = store.redact(connection)
  assert.equal('encryptedTokens' in publicConnection, false)
  assert.equal('managementTokenHash' in publicConnection, false)
  assert.equal(typeof publicConnection.runtimeKey, 'string')
})

test('OAuth state and browser exchange codes are one time', async () => {
  const store = await fixtureStore()
  await store.createOAuth({ state: 'state-a', verifier: 'verifier-a', returnTo: 'https://example.test/#/integrations', expiresAt: Date.now() + 1000 })
  assert.equal(JSON.stringify(store._state()).includes('verifier-a'), false)
  assert.equal((await store.consumeOAuth('state-a')).verifier, 'verifier-a')
  assert.equal(await store.consumeOAuth('state-a'), undefined)
  const { connection, managementToken } = await store.saveConnection(input, tokens)
  const code = await store.createExchange(connection.id, managementToken)
  assert.equal(JSON.stringify(store._state()).includes(managementToken), false)
  assert.equal((await store.consumeExchange(code)).managementToken, managementToken)
  assert.equal(await store.consumeExchange(code), null)
})

test('disconnect erases token material and disables broadcaster routing', async () => {
  const store = await fixtureStore()
  const { connection } = await store.saveConnection(input, tokens)
  assert.equal((await store.findByBroadcasterId(72)).id, connection.id)
  await store.disconnect(connection.id)
  assert.equal(await store.getTokens(connection.id), null)
  assert.equal(await store.findByBroadcasterId(72), null)
  assert.deepEqual((await store.getConnection(connection.id)).subscriptions, [])
})

test('publication gives each overlay a stable server-backed runtime capability', async () => {
  const store = await fixtureStore()
  const { connection } = await store.saveConnection(input, tokens)
  const first = await store.createPublication(connection.id, 'pub_overlay_one')
  const second = await store.createPublication(connection.id, 'pub_overlay_one')
  const other = await store.createPublication(connection.id, 'pub_overlay_two')
  assert.equal(first.id, second.id)
  assert.equal(first.runtimeKey, second.runtimeKey)
  assert.notEqual(first.runtimeKey, other.runtimeKey)
  assert.equal((await store.findByRuntimeKey(first.runtimeKey)).id, connection.id)
})

test('processed message IDs provide retry idempotency', async () => {
  const store = await fixtureStore()
  assert.equal(await store.isProcessed('event-1'), false)
  await store.markProcessed('event-1')
  assert.equal(await store.isProcessed('event-1'), true)
})
