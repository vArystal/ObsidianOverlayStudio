import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker, { handleRequest, normalizeEvent, verifyKickSignature, viewerMetric, refreshViewerIfStale, configProblems, resetPublicKeyCache, REQUIRED_SCOPES, SUBSCRIBED_EVENTS } from './index.mjs'

const ORIGIN = 'https://varystal.github.io'
const API = 'https://obsidian-overlay-api.test.workers.dev'

/* ------------------------------------------------------------ D1 shim */
function makeEnv(overrides = {}) {
  resetPublicKeyCache()
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  const wrap = (sql) => {
    let params = []
    return {
      bind(...values) { params = values.map((v) => (typeof v === 'boolean' ? Number(v) : v ?? null)); return this },
      first() { return sqlite.prepare(sql).get(...params) ?? null },
      all() { const rows = sqlite.prepare(sql).all(...params); return { results: rows } },
      run() { const info = sqlite.prepare(sql).run(...params); return { success: true, meta: info } },
    }
  }
  return {
    sqlite,
    env: {
      KICK_CLIENT_ID: 'client-id', KICK_CLIENT_SECRET: 'client-secret', ENCRYPTION_KEY: 'unit-test-encryption-key',
      PUBLIC_API_URL: API, APP_ORIGINS: ORIGIN,
      DB: { prepare: wrap },
      ...overrides,
    },
  }
}

/* ------------------------------------------------- RSA keypair for webhooks */
async function keypair() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const der = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const b64 = btoa(String.fromCharCode(...der)).match(/.{1,64}/g).join('\n')
  return { privateKey: pair.privateKey, pem: `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n` }
}

const sign = async (privateKey, messageId, timestamp, body) => {
  const raw = new TextEncoder().encode(`${messageId}.${timestamp}.${body}`)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, raw)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

const req = (path, init = {}) => new Request(`${API}${path}`, { ...init, headers: { origin: ORIGIN, ...(init.headers || {}) } })

/* -------------------------------------------------------------- fixtures */
async function connect(env, keys) {
  const start = await handleRequest(req('/api/auth/kick/start?return_to=' + encodeURIComponent(`${ORIGIN}/#/integrations`)), env)
  assert.equal(start.status, 302)
  const authorize = new URL(start.headers.get('location'))
  const state = authorize.searchParams.get('state')
  const challenge = authorize.searchParams.get('code_challenge')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorize.searchParams.get('redirect_uri'), `${API}/api/auth/kick/callback`)
  assert.equal(authorize.searchParams.get('scope'), REQUIRED_SCOPES.join(' '))

  env.fetchImpl = async (url, options = {}) => {
    const u = String(url)
    if (u.startsWith('https://id.kick.com/oauth/token')) {
      const body = new URLSearchParams(String(options.body))
      if (body.get('grant_type') === 'authorization_code') {
        assert.ok(body.get('code_verifier'), 'PKCE verifier must be sent to the token endpoint')
        return Response.json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: REQUIRED_SCOPES.join(' ') })
      }
      return Response.json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 })
    }
    if (u === 'https://api.kick.com/public/v1/users') return Response.json({ data: [{ user_id: 42, name: 'varystal', profile_picture: 'https://a/avatar.png' }] })
    if (u.startsWith('https://api.kick.com/public/v1/channels?')) return Response.json({ data: [{ slug: 'varystal', channel_description: 'Persian overlays', active_subscribers_count: 12, stream: { is_live: true, viewer_count: 137 } }] })
    if (u === 'https://api.kick.com/public/v1/events/subscriptions' && options.method === 'POST') {
      return Response.json({ data: SUBSCRIBED_EVENTS.map((name, index) => ({ name, version: 1, subscription_id: `sub_${index}` })) })
    }
    if (u === 'https://api.kick.com/public/v1/public-key') return Response.json({ data: { public_key: keys.pem } })
    throw new Error(`unexpected fetch ${options.method || 'GET'} ${u}`)
  }

  const callback = await handleRequest(req(`/api/auth/kick/callback?code=auth-code&state=${state}`), env)
  assert.equal(callback.status, 302)
  const back = new URL(callback.headers.get('location'))
  const exchange = back.searchParams.get('exchange')
  assert.ok(exchange, 'callback must redirect back with a one-time exchange code')

  const session = await handleRequest(req('/api/auth/session', { method: 'POST', body: JSON.stringify({ code: exchange }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(session.status, 200)
  const body = await session.json()
  assert.ok(body.managementToken)
  assert.equal(challenge.length > 20, true)

  const statusResponse = await handleRequest(req('/api/integrations/kick', { headers: { authorization: `Bearer ${body.managementToken}` } }), env)
  assert.equal(statusResponse.status, 200)
  const status = await statusResponse.json()
  return { managementToken: body.managementToken, connection: body.connection, status }
}

/* ------------------------------------------------------------------ tests */
test('setup endpoint reports missing secrets without leaking values', async () => {
  const { env } = makeEnv({ KICK_CLIENT_SECRET: '', PUBLIC_API_URL: '' })
  const response = await handleRequest(req('/api/setup'), env)
  const body = await response.json()
  assert.equal(body.state, 'SETUP_REQUIRED')
  assert.deepEqual(body.missing.sort(), ['KICK_CLIENT_SECRET', 'PUBLIC_API_URL'])
  assert.match(body.webhookUrl, /\/api\/webhooks\/kick$/)
  assert.equal(body.followerTotal.supported, false)
  assert.doesNotMatch(JSON.stringify(body), /client-secret/)
})

test('oauth start rejects an origin outside the allow-list', async () => {
  const { env } = makeEnv()
  const response = await handleRequest(req('/api/auth/kick/start?return_to=' + encodeURIComponent('https://evil.example/#/integrations')), env)
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid_return_origin')
})

test('oauth callback stores sealed tokens, subscribes to every event and issues a management token', async () => {
  const keys = await keypair()
  const { env, sqlite } = makeEnv()
  const { managementToken, connection, status } = await connect(env, keys)

  assert.equal(status.state, 'CONNECTED')
  assert.equal(status.webhook.state, 'CONNECTED')
  assert.equal(connection.channel.slug, 'varystal')
  assert.equal(connection.subscriptions.length, SUBSCRIBED_EVENTS.length)
  assert.equal(connection.viewer.status, 'live')
  assert.equal(connection.viewer.count, 137)
  assert.ok(connection.runtimeKey && connection.runtimeKey.length > 20, 'connection exposes a stable runtime key')
  assert.equal(status.followerTotal.supported, false, 'a follower total is never fabricated')
  assert.doesNotMatch(JSON.stringify(connection), /access-1|refresh-1|management_token/)
  assert.doesNotMatch(JSON.stringify(status), /access-1|refresh-1/)

  const row = sqlite.prepare('SELECT tokens, management_hash FROM connections').get()
  assert.doesNotMatch(row.tokens, /access-1/)
  assert.equal(row.management_hash, [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(managementToken)))].map((b) => b.toString(16).padStart(2, '0')).join(''))
})

test('webhook signature, replay and dedupe rules', async () => {
  const keys = await keypair()
  const { env, sqlite } = makeEnv()
  await connect(env, keys)

  const body = JSON.stringify({ follower: { user_id: 7, username: 'new_follower', profile_picture: null }, broadcaster: { user_id: 42 } })
  const messageId = '01JABCDEF0123456789'
  const timestamp = new Date().toISOString()
  const signature = await sign(keys.privateKey, messageId, timestamp, body)
  const headers = { 'Kick-Event-Message-Id': messageId, 'Kick-Event-Message-Timestamp': timestamp, 'Kick-Event-Signature': signature, 'Kick-Event-Type': 'channel.followed', 'Kick-Event-Version': '1', 'content-type': 'application/json' }

  assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: { ...headers, 'Kick-Event-Signature': 'AAAA' } }), env)).status, 401)
  assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: { ...headers, 'Kick-Event-Signature': undefined } }), env)).status, 401)
  assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: { ...headers, 'Kick-Event-Message-Timestamp': '2020-01-01T00:00:00Z' } }), env)).status, 401)

  const accepted = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers }), env)
  assert.equal(accepted.status, 204)
  assert.equal(accepted.body, null, '204 must not carry a body')
  const duplicate = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers }), env)
  assert.equal(duplicate.status, 204)
  const queued = sqlite.prepare('SELECT type, payload FROM events').all()
  assert.equal(queued.length, 1, 'the connection runtime key queues every accepted event')
  assert.equal(queued[0].type, 'channel.followed')
  assert.equal(JSON.parse(queued[0].payload).data.follower.username, 'new_follower')

  const row = sqlite.prepare('SELECT session_follower_count, last_follower FROM connections').get()
  assert.equal(row.session_follower_count, 1, 'duplicates must not double count')
  assert.equal(JSON.parse(row.last_follower).username, 'new_follower')
})

test('webhook verification accepts a real RSA signature and rejects tampering', async () => {
  const keys = await keypair()
  const body = '{"a":1}'
  const timestamp = new Date().toISOString()
  const signature = await sign(keys.privateKey, 'msg-1', timestamp, body)
  assert.equal(await verifyKickSignature({ signature, messageId: 'msg-1', timestamp, rawBody: body, publicKeyPem: keys.pem }), true)
  assert.equal(await verifyKickSignature({ signature, messageId: 'msg-1', timestamp, rawBody: '{"a":2}', publicKeyPem: keys.pem }), false)
  assert.equal(await verifyKickSignature({ signature: 'not-base64', messageId: 'msg-1', timestamp, rawBody: body, publicKeyPem: keys.pem }), false)
  assert.equal(await verifyKickSignature({ signature, messageId: 'msg-1', timestamp, rawBody: body, publicKeyPem: 'garbage' }), false)
})

test('publish returns a stable runtime key per overlay and runtime state stays secret-free', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const { managementToken } = await connect(env, keys)
  const auth = { authorization: `Bearer ${managementToken}` }

  assert.equal((await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'overlay_abc12345' }) }), env)).status, 401)
  assert.equal((await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'bad id!' }), headers: auth }), env)).status, 400)

  const first = await (await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'overlay_abc12345' }), headers: auth }), env)).json()
  const second = await (await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'overlay_abc12345' }), headers: auth }), env)).json()
  assert.equal(first.runtimeKey, second.runtimeKey)
  assert.match(first.runtimeKey, /^[A-Za-z0-9_-]{20,}$/)

  const state = await (await handleRequest(req(`/api/runtime/${first.runtimeKey}/state`), env)).json()
  assert.equal(state.connected, true)
  assert.deepEqual(state.viewer, { status: 'live', count: 137, updatedAt: state.viewer.updatedAt })
  assert.equal(state.sessionFollowerCount, 0)
  assert.equal(state.followerTotal.supported, false)
  assert.doesNotMatch(JSON.stringify(state), /access-1|management|token/i)

  assert.equal((await handleRequest(req('/api/runtime/does-not-exist/state'), env)).status, 404)
})

test('test-event delivers a clearly marked synthetic alert to the runtime queue', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const { managementToken } = await connect(env, keys)
  const auth = { authorization: `Bearer ${managementToken}` }
  const publication = await (await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'overlay_test1234' }), headers: auth }), env)).json()

  const delivered = await (await handleRequest(req('/api/integrations/test-event', { method: 'POST', body: JSON.stringify({ type: 'chat.message.sent', message: 'سلام' }), headers: auth }), env)).json()
  assert.equal(delivered.test, true)
  assert.equal(delivered.event.test, true)

  const response = await handleRequest(req(`/api/runtime/${publication.runtimeKey}/events`), env)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let frame = ''
  for (let i = 0; i < 4 && !frame.includes('event: ready'); i += 1) {
    const { value } = await reader.read()
    frame += decoder.decode(value ?? new Uint8Array())
  }
  assert.match(frame, /retry: 2000/)
  assert.match(frame, /event: ready/)
  await reader.cancel()
})

test('the connection runtime key streams state before any overlay is published', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const { connection } = await connect(env, keys)
  const state = await handleRequest(req(`/api/runtime/${connection.runtimeKey}/state`), env)
  assert.equal(state.status, 200)
  const body = await state.json()
  assert.equal(body.connected, true)
  assert.equal(body.viewer.count, 137)
  assert.equal(body.followerTotal.supported, false)
  assert.equal((await handleRequest(req(`/api/runtime/${connection.runtimeKey}/events`), env)).status, 200)
})

test('live viewer metric never invents numbers', () => {
  assert.deepEqual(viewerMetric(null).status, 'offline')
  assert.deepEqual(viewerMetric({ stream: { is_live: false, viewer_count: 0 } }).count, null)
  assert.equal(viewerMetric({ stream: { is_live: true, viewer_count: 88 } }).count, 88)
  assert.equal(viewerMetric({ stream: { is_live: true, viewer_count: null } }).count, null)
})

test('chat events normalise to the shape the overlay runtime consumes', () => {
  const event = normalizeEvent({ id: 'm1', type: 'chat.message.sent', payload: { message_id: 'k1', content: 'hi', created_at: '2026-01-01T00:00:00Z', sender: { user_id: 5, username: 'ali', identity: { username_color: '#d8ad55', badges: [{ type: 'sub', text: '3' }] } }, broadcaster: { user_id: 42 } } })
  assert.equal(event.data.content, 'hi')
  assert.equal(event.data.sender.username, 'ali')
  assert.equal(event.data.sender.usernameColor, '#d8ad55')
  assert.deepEqual(event.data.sender.badges, [{ type: 'sub', text: '3' }])
  assert.equal(event.data.broadcaster.userId, 42)
})

test('a stale viewer number is refreshed lazily (Pages has no cron) and a failure never fabricates one', async () => {
  const keys = await keypair()
  const { env, sqlite } = makeEnv()
  const { connection } = await connect(env, keys)
  const staleConnection = { ...sqlite.prepare('SELECT * FROM connections').get(), viewer: JSON.stringify({ status: 'live', count: 137, updatedAt: new Date(Date.now() - 10 * 60_000).toISOString() }) }

  env.fetchImpl = async (url) => {
    assert.match(String(url), /broadcaster_user_id=42/)
    return Response.json({ data: [{ slug: 'varystal', stream: { is_live: true, viewer_count: 555 } }] })
  }
  const refreshed = await refreshViewerIfStale(env, staleConnection, env.fetchImpl)
  assert.equal(JSON.parse(refreshed.viewer).count, 555)
  assert.equal(JSON.parse(sqlite.prepare('SELECT viewer FROM connections').get().viewer).count, 555)

  // fresh data must not trigger another Kick call
  let calls = 0
  env.fetchImpl = async () => { calls += 1; return Response.json({ data: [] }) }
  await refreshViewerIfStale(env, { ...refreshed, viewer: refreshed.viewer }, env.fetchImpl)
  assert.equal(calls, 0)

  // a failing Kick call degrades to "stale" and keeps the last real number
  env.fetchImpl = async () => { throw new Error('kick down') }
  const degraded = await refreshViewerIfStale(env, staleConnection, env.fetchImpl)
  const metric = JSON.parse(degraded.viewer)
  assert.equal(metric.status, 'stale')
  assert.equal(metric.count, 137)
  assert.ok(connection.runtimeKey)
})

test('a secret that is really the client ID is reported as misconfiguration, and the callback says so instead of a bare 401', async () => {
  assert.deepEqual(configProblems({ KICK_CLIENT_ID: 'abc123', KICK_CLIENT_SECRET: 'abc123' }), ['KICK_CLIENT_ID_EQUALS_KICK_CLIENT_SECRET'])
  assert.deepEqual(configProblems({ KICK_CLIENT_ID: 'abc123', KICK_CLIENT_SECRET: 'realsecret' }), [])

  const { env } = makeEnv()
  env.KICK_CLIENT_ID = '01M6SAMEVALUE'
  env.KICK_CLIENT_SECRET = '01M6SAMEVALUE'
  assert.equal(env.KICK_CLIENT_SECRET === env.KICK_CLIENT_ID, true)
  const setup = await (await handleRequest(new Request('https://api.test/api/setup'), env)).json()
  assert.equal(setup.state, 'MISCONFIGURED')
  assert.deepEqual(setup.problems, ['KICK_CLIENT_ID_EQUALS_KICK_CLIENT_SECRET'])
  assert.ok(setup.callbackUrl.endsWith('/api/auth/kick/callback'))

  // callback with a Kick 401 for /oauth/token must explain the real cause
  const start = await handleRequest(new Request(`https://api.test/api/auth/kick/start?return_to=${encodeURIComponent(`${ORIGIN}/#/integrations`)}`), env)
  assert.equal(start.status, 302)
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  env.fetchImpl = async () => new Response(JSON.stringify({ error: 'invalid_client', error_description: 'Client authentication failed' }), { status: 401, headers: { 'content-type': 'application/json' } })
  const cb = await handleRequest(new Request(`https://api.test/api/auth/kick/callback?code=abc&state=${state}`), env)
  const page = await cb.text()
  assert.equal(cb.status, 400)
  assert.match(page, /invalid_client/)
  assert.match(page, /Client ID saved as the Client Secret/)
})

test('an origin-only return_to is repaired from the referer so the user is not dropped on the Pages 404 root', async () => {
  const { env, sqlite } = makeEnv()
  const originOnly = `${ORIGIN}/#/integrations`
  const res = await handleRequest(new Request(`https://api.test/api/auth/kick/start?return_to=${encodeURIComponent(originOnly)}`,
    { headers: { referer: `${ORIGIN}/jubilant-octo-lamp/#/integrations` } }), env)
  assert.equal(res.status, 302)
  const stored = sqlite.prepare('SELECT return_to FROM oauth_states').all().map((row) => row.return_to)
  assert.equal(stored.at(-1), `${ORIGIN}/jubilant-octo-lamp/#/integrations`)

  // a full path from a caller that sends it correctly is preserved untouched
  const good = `${ORIGIN}/jubilant-octo-lamp/#/integrations`
  const res2 = await handleRequest(new Request(`https://api.test/api/auth/kick/start?return_to=${encodeURIComponent(good)}`,
    { headers: { referer: `${ORIGIN}/jubilant-octo-lamp/#/integrations` } }), env)
  assert.equal(res2.status, 302)
  assert.equal(sqlite.prepare('SELECT return_to FROM oauth_states').all().at(-1).return_to, good)

  // a referer on a foreign origin must not smuggle the user anywhere else
  const res3 = await handleRequest(new Request(`https://api.test/api/auth/kick/start?return_to=${encodeURIComponent(originOnly)}`,
    { headers: { referer: 'https://evil.test/steal' } }), env)
  assert.equal(res3.status, 302)
  assert.equal(sqlite.prepare('SELECT return_to FROM oauth_states').all().at(-1).return_to, originOnly)
})

test('reconnecting clears the old subscriptions first and never erases a working set on a failed re-subscribe', async () => {
  const keys = await keypair()
  const { env, sqlite } = makeEnv()
  const { connection } = await connect(env, keys)
  const before = JSON.parse(sqlite.prepare('SELECT subscriptions FROM connections').get().subscriptions)
  assert.equal(before.length, 8)

  const calls = []
  env.fetchImpl = async (url, options = {}) => {
    const u = String(url)
    calls.push(`${options.method || 'GET'} ${u}`)
    if (u.startsWith('https://id.kick.com/oauth/token')) return Response.json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: REQUIRED_SCOPES.join(' ') })
    if (u.startsWith('https://api.kick.com/public/v1/users')) return Response.json({ data: [{ user_id: 42, name: 'varystal' }] })
    if (u.startsWith('https://api.kick.com/public/v1/channels?')) return Response.json({ data: [{ slug: 'varystal', active_subscribers_count: 12, stream: { is_live: false, viewer_count: 7 } }] })
    if (u.startsWith('https://api.kick.com/public/v1/events/subscriptions') && options.method === 'DELETE') return Response.json({ data: [] })
    if (u.startsWith('https://api.kick.com/public/v1/events/subscriptions') && options.method === 'POST') {
      return new Response(JSON.stringify({ error: 'already subscribed' }), { status: 409, headers: { 'content-type': 'application/json' } })
    }
    return Response.json({ data: [] })
  }

  const start = await handleRequest(req('/api/auth/kick/start?return_to=' + encodeURIComponent(`${ORIGIN}/#/integrations`)), env)
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  const cb = await handleRequest(req(`/api/auth/kick/callback?code=second-code&state=${state}`), env)
  assert.equal(cb.status, 302)

  const deleted = calls.find((call) => call.startsWith('DELETE') && call.includes('/events/subscriptions'))
  assert.ok(deleted, 'old subscriptions must be removed before re-subscribing')
  assert.ok(deleted.includes('sub_0'), 'the stored subscription ids are the ones removed')
  const after = JSON.parse(sqlite.prepare('SELECT subscriptions FROM connections').get().subscriptions)
  assert.equal(after.length, 8, 'a failed re-subscribe keeps the eight that were already delivering')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM connections').get().n, 1, 'reconnect updates the existing connection instead of adding one')
  assert.equal(connection.channel?.slug ?? sqlite.prepare('SELECT channel_slug FROM connections').get().channel_slug, 'varystal')
})

test('cron refreshes viewer count from the official channels endpoint', async () => {
  const keys = await keypair()
  const { env, sqlite } = makeEnv()
  await connect(env, keys)
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/public\/v1\/channels\?broadcaster_user_id=42/)
    return Response.json({ data: [{ slug: 'varystal', active_subscribers_count: 13, stream: { is_live: true, viewer_count: 201 } }] })
  }
  await worker.scheduled({}, env)
  const row = sqlite.prepare('SELECT viewer, active_subscribers FROM connections').get()
  assert.equal(JSON.parse(row.viewer).count, 201)
  assert.equal(row.active_subscribers, 13)
})

test('CORS allows only the configured editor origin', async () => {
  const { env } = makeEnv()
  const allowed = await handleRequest(req('/api/health'), env)
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN)
  const other = await handleRequest(new Request(`${API}/api/health`, { headers: { origin: 'https://attacker.example' } }), env)
  assert.equal(other.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(other.status, 200)
})
