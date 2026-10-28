import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from './app.mjs'

function config(overrides = {}) {
  return {
    port: 0, host: '127.0.0.1', appOrigins: ['https://studio.example'],
    kickClientId: 'client-id', kickClientSecret: 'client-secret', kickRedirectUri: 'https://api.example/api/auth/kick/callback',
    tokenEncryptionKey: 'app-test-encryption-key-that-is-long-enough-for-aes', dataFile: '/unused/app-test.json',
    viewerPollMs: 999_999, publicApiUrl: 'https://api.example', nodeEnv: 'test', missing: [], ...overrides,
  }
}

async function running(t, options = {}) {
  const app = await createApp({ config: options.config ?? config(), fetchImpl: options.fetchImpl ?? (async () => { throw new Error('unexpected external request') }), persist: false })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  t.after(() => app.close())
  const address = app.server.address()
  return { app, base: `http://127.0.0.1:${address.port}` }
}

test('health and setup expose requirements but never server secrets', async (t) => {
  const { base } = await running(t)
  const health = await (await fetch(`${base}/api/health`)).json()
  assert.equal(health.ok, true)
  const response = await fetch(`${base}/api/setup`); const setup = await response.json()
  assert.equal(setup.state, 'DISCONNECTED')
  assert.deepEqual(setup.requiredScopes, ['user:read', 'channel:read', 'events:subscribe'])
  assert.ok(setup.events.includes('chat.message.sent'))
  assert.equal(setup.donation.state, 'SETUP_REQUIRED')
  assert.equal(JSON.stringify(setup).includes('client-secret'), false)
})

test('setup-required state blocks OAuth before redirect', async (t) => {
  const cfg = config({ kickClientId: '', kickClientSecret: '', missing: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'] })
  const { base } = await running(t, { config: cfg })
  const response = await fetch(`${base}/api/auth/kick/start`, { redirect: 'manual' })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'setup_required')
})

test('OAuth start validates return origin and creates PKCE redirect', async (t) => {
  const { base } = await running(t)
  const denied = await fetch(`${base}/api/auth/kick/start?return_to=${encodeURIComponent('https://evil.example/#/integrations')}`, { redirect: 'manual' })
  assert.equal(denied.status, 400)
  const response = await fetch(`${base}/api/auth/kick/start?return_to=${encodeURIComponent('https://studio.example/#/integrations')}`, { redirect: 'manual' })
  assert.equal(response.status, 302)
  const target = new URL(response.headers.get('location'))
  assert.equal(target.origin, 'https://id.kick.com')
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(target.searchParams.get('state'))
  assert.equal(target.toString().includes('client-secret'), false)
})

test('callback rejects provider errors, missing code, and unknown state', async (t) => {
  const { base } = await running(t)
  assert.equal((await fetch(`${base}/api/auth/kick/callback?error=access_denied`)).status, 400)
  assert.equal((await fetch(`${base}/api/auth/kick/callback`)).status, 400)
  assert.equal((await fetch(`${base}/api/auth/kick/callback?code=x&state=unknown`)).status, 400)
})

test('management authorization protects status and test events with explicit provenance', async (t) => {
  const { app, base } = await running(t)
  const unauthorized = await fetch(`${base}/api/integrations/kick`)
  assert.equal(unauthorized.status, 401)
  const { connection, managementToken } = await app.store.saveConnection({ account: { userId: 20, username: 'owner' }, channel: { slug: 'owner' }, scopes: ['user:read', 'channel:read', 'events:subscribe'], subscriptions: [{ id: 'sub' }] }, { access_token: 'access', refresh_token: 'refresh', expiresAt: Date.now() + 100_000 })
  const delivered = []; app.bus.subscribe(connection.runtimeKey, (event) => delivered.push(event))
  const response = await fetch(`${base}/api/integrations/test-event`, { method: 'POST', headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'channel.followed' }) })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.test, true)
  assert.equal(body.event.test, true)
  assert.equal(delivered[0].test, true)
  assert.equal(delivered[0].data.follower.username, 'TEST EVENT')
})

test('overlay publication is authenticated, stable, and resolves to sanitized runtime state', async (t) => {
  const { app, base } = await running(t)
  const { managementToken } = await app.store.saveConnection({ account: { userId: 24, username: 'owner' }, channel: { slug: 'owner' }, scopes: [], subscriptions: [] }, { access_token: 'access', expiresAt: Date.now() + 100_000 })
  const options = { method: 'POST', headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ overlayId: 'pub_stable_overlay' }) }
  const first = await (await fetch(`${base}/api/overlays/publish`, options)).json()
  const second = await (await fetch(`${base}/api/overlays/publish`, options)).json()
  assert.equal(first.publicationId, second.publicationId)
  assert.equal(first.runtimeKey, second.runtimeKey)
  const state = await (await fetch(`${base}/api/runtime/${first.runtimeKey}/state`)).json()
  assert.equal(state.connected, true)
  assert.equal(JSON.stringify(state).includes('access'), false)
  const delivered = []; app.bus.subscribe(first.runtimeKey, (event) => delivered.push(event))
  await fetch(`${base}/api/integrations/test-event`, { method: 'POST', headers: options.headers, body: JSON.stringify({ type: 'channel.followed' }) })
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].test, true)
  assert.equal((await fetch(`${base}/api/overlays/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: options.body })).status, 401)
})

test('public runtime state is key-scoped and distinguishes unavailable metrics', async (t) => {
  const { app, base } = await running(t)
  const { connection } = await app.store.saveConnection({ account: { userId: 21, username: 'owner' }, channel: { slug: 'owner' }, scopes: [], subscriptions: [] }, { access_token: 'access', expiresAt: Date.now() + 100_000 })
  const response = await fetch(`${base}/api/runtime/${connection.runtimeKey}/state`); const state = await response.json()
  assert.equal(state.connected, true)
  assert.equal(state.viewer.status, 'unavailable')
  assert.equal(state.sessionFollowerCount, 0)
  assert.equal(JSON.stringify(state).includes('access'), false)
  assert.equal((await fetch(`${base}/api/runtime/not-a-key/state`)).status, 404)
})

test('resubscribe replaces tracked subscriptions and disconnect clears credentials', async (t) => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' })
    const body = String(url).includes('/events/subscriptions') && options.method === 'POST' ? { data: [{ id: 'new-subscription' }] } : { data: [] }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) }
  }
  const { app, base } = await running(t, { fetchImpl })
  const { connection, managementToken } = await app.store.saveConnection({ account: { userId: 23, username: 'owner' }, channel: { slug: 'owner' }, scopes: ['user:read', 'channel:read', 'events:subscribe'], subscriptions: [{ id: 'old-subscription' }] }, { access_token: 'access', refresh_token: 'refresh', expiresAt: Date.now() + 100_000 })
  const headers = { authorization: `Bearer ${managementToken}` }
  const renewed = await fetch(`${base}/api/integrations/kick/resubscribe`, { method: 'POST', headers })
  assert.equal(renewed.status, 200)
  assert.equal((await renewed.json()).webhook.state, 'CONNECTED')
  assert.ok(calls.some((call) => call.method === 'DELETE' && call.url.includes('old-subscription')))
  const disconnected = await fetch(`${base}/api/integrations/kick/disconnect`, { method: 'POST', headers })
  assert.deepEqual(await disconnected.json(), { state: 'DISCONNECTED' })
  assert.equal(await app.store.getTokens(connection.id), null)
  assert.equal((await app.store.getConnection(connection.id)).connected, false)
})

test('unsigned webhook fails closed without requesting an external key', async (t) => {
  let externalCalls = 0
  const { base } = await running(t, { fetchImpl: async () => { externalCalls += 1; throw new Error('must not be called') } })
  const response = await fetch(`${base}/api/webhooks/kick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(response.status, 401)
  assert.equal(externalCalls, 0)
})

test('viewer backend failure yields unavailable/error rather than fabricated zero', async (t) => {
  const { app, base } = await running(t, { fetchImpl: async () => { throw new Error('provider offline') } })
  const { connection, managementToken } = await app.store.saveConnection({ account: { userId: 22, username: 'owner' }, channel: { slug: 'owner' }, scopes: ['user:read', 'channel:read', 'events:subscribe'], subscriptions: [] }, { access_token: 'access', expiresAt: Date.now() + 100_000 })
  await app.pollViewerCounts()
  const updated = await app.store.getConnection(connection.id)
  assert.equal(updated.viewer.status, 'unavailable')
  assert.equal(updated.viewer.count, null)
  const status = await (await fetch(`${base}/api/integrations/kick`, { headers: { authorization: `Bearer ${managementToken}` } })).json()
  assert.equal(status.state, 'ERROR')
  await app.store.updateConnection(connection.id, { viewer: { status: 'stale', count: 19, updatedAt: new Date().toISOString() } })
  const stale = await (await fetch(`${base}/api/integrations/kick`, { headers: { authorization: `Bearer ${managementToken}` } })).json()
  assert.equal(stale.state, 'STALE_DATA')
})
