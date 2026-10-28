import test from 'node:test'
import assert from 'node:assert/strict'
import { createKickClient, KickApiError, validAccessToken } from './kick-client.mjs'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) }
}

test('authorization URL uses official host, PKCE S256, state, and minimum scopes', () => {
  const client = createKickClient({ clientId: 'client-id', clientSecret: 'server-secret', redirectUri: 'https://api.example/callback', fetchImpl: async () => jsonResponse({}) })
  const url = new URL(client.authorizationUrl({ state: 'state-value', challenge: 'challenge-value', scopes: ['user:read', 'channel:read', 'events:subscribe'] }))
  assert.equal(url.origin, 'https://id.kick.com')
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), 'state-value')
  assert.equal(url.searchParams.get('scope'), 'user:read channel:read events:subscribe')
  assert.equal(url.toString().includes('server-secret'), false)
})

test('official subscription and livestream endpoints use bearer token server side', async () => {
  const calls = []
  const client = createKickClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://api.example/callback', fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return jsonResponse({ data: [] }) } })
  await client.subscribe('access-token', ['channel.followed'])
  await client.getLivestream('access-token', 17)
  await client.revoke('access-token')
  assert.equal(calls[0].url, 'https://api.kick.com/public/v1/events/subscriptions')
  assert.equal(calls[0].options.headers.authorization, 'Bearer access-token')
  assert.deepEqual(JSON.parse(calls[0].options.body), { method: 'webhook', events: [{ name: 'channel.followed', version: 1 }] })
  assert.equal(calls[1].url, 'https://api.kick.com/public/v1/users/livestreams?user_id=17')
  assert.equal(calls[2].url, 'https://id.kick.com/oauth/revoke')
  assert.equal(calls[2].url.includes('access-token'), false)
  assert.equal(calls[2].options.body.get('token'), 'access-token')
})

test('expired access token refreshes and is re-encrypted by store boundary', async () => {
  let stored = null
  const store = { getTokens: async () => ({ access_token: 'old', refresh_token: 'refresh', expiresAt: 1 }), setTokens: async (_id, value) => { stored = value } }
  const client = { refresh: async (value) => { assert.equal(value, 'refresh'); return { access_token: 'new', refresh_token: 'next', expires_in: 3600 } } }
  const token = await validAccessToken({ connection: { id: 'connection' }, store, client, now: 10_000 })
  assert.equal(token, 'new')
  assert.equal(stored.access_token, 'new')
  assert.ok(stored.expiresAt > 10_000)
})

test('API failures are typed and do not echo token values in messages', async () => {
  const client = createKickClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://api.example/callback', fetchImpl: async () => jsonResponse({ message: 'denied' }, 403) })
  await assert.rejects(client.getCurrentUser('very-private-token'), (error) => {
    assert.ok(error instanceof KickApiError)
    assert.equal(error.status, 403)
    assert.equal(error.message.includes('very-private-token'), false)
    return true
  })
})
