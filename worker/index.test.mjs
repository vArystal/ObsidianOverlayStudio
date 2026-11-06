import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker, { handleRequest, normalizeEvent, verifyKickSignature, viewerMetric, refreshViewerIfStale, configProblems, resetPublicKeyCache, streamInfoFromChannel, mergeStreamInfo, crossedMilestones, pruneAlertState, REQUIRED_SCOPES, SUBSCRIBED_EVENTS } from './index.mjs'

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
// The studio is a hash router, so the callback puts the exchange code inside the hash route.
function exchangeFrom(location) {
  const url = new URL(location)
  const fromSearch = url.searchParams.get('exchange')
  if (fromSearch) return fromSearch
  const cut = url.hash.indexOf('?')
  return cut === -1 ? null : new URLSearchParams(url.hash.slice(cut + 1)).get('exchange')
}

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
  const exchange = exchangeFrom(callback.headers.get('location'))
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

  const row = sqlite.prepare('SELECT session_follower_count, last_follower, event_counts FROM connections').get()
  assert.equal(row.session_follower_count, 1, 'duplicates must not double count')
  assert.equal(JSON.parse(row.last_follower).username, 'new_follower')
  assert.deepEqual(JSON.parse(row.event_counts), { 'channel.followed': 1 }, 'a redelivery must not inflate the durable counter')

  // A second type proves the counter is per-type, not a single shared number.
  const chatBody = JSON.stringify({ message_id: 'km_1', content: 'salam', created_at: new Date().toISOString(), sender: { user_id: 9, username: 'chatter' }, broadcaster: { user_id: 42 } })
  const chatId = '01JCHAT0000000000001'
  const chatTs = new Date().toISOString()
  const chatHeaders = { 'Kick-Event-Message-Id': chatId, 'Kick-Event-Message-Timestamp': chatTs, 'Kick-Event-Signature': await sign(keys.privateKey, chatId, chatTs, chatBody), 'Kick-Event-Type': 'chat.message.sent', 'Kick-Event-Version': '1', 'content-type': 'application/json' }
  assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body: chatBody, headers: chatHeaders }), env)).status, 204)
  const after = JSON.parse(sqlite.prepare('SELECT event_counts FROM connections').get().event_counts)
  assert.deepEqual(after, { 'channel.followed': 1, 'chat.message.sent': 1 })
  assert.equal(sqlite.prepare('SELECT last_event_type FROM connections').get().last_event_type, 'chat.message.sent')
})

test('webhook hardening: byte cap, version, clock skew and the key-refresh budget', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  await connect(env, keys)
  const inner = env.fetchImpl
  let keyFetches = 0
  env.fetchImpl = async (url, options) => {
    if (String(url).endsWith('/public/v1/public-key')) keyFetches += 1
    return inner(url, options)
  }
  const headersFor = async (body, overrides = {}) => {
    const messageId = `msg_${Math.random().toString(36).slice(2)}`
    const timestamp = new Date().toISOString()
    const signature = await sign(keys.privateKey, messageId, timestamp, body)
    return { 'Kick-Event-Message-Id': messageId, 'Kick-Event-Message-Timestamp': timestamp, 'Kick-Event-Signature': signature, 'Kick-Event-Type': 'channel.followed', 'Kick-Event-Version': '1', 'content-type': 'application/json', ...overrides }
  }

  // 200k accented characters = ~400 KB of UTF-8 while staying under 300k UTF-16 units, so a cap
  // measured in string length lets it through while a byte cap stops it.
  const oversized = JSON.stringify({ broadcaster: { user_id: 42 }, note: 'é'.repeat(200_000) })
  assert.ok(oversized.length < 300_000)
  assert.ok(oversized.length > 200_000)
  const tooBig = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body: oversized, headers: await headersFor(oversized) }), env)
  assert.equal(tooBig.status, 413)

  const body = JSON.stringify({ follower: { user_id: 7, username: 'x' }, broadcaster: { user_id: 42 } })
  const wrongVersion = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: await headersFor(body, { 'Kick-Event-Version': '2' }) }), env)
  assert.equal(wrongVersion.status, 400)
  assert.equal((await wrongVersion.json()).error, 'unsupported_version')

  const future = new Date(Date.now() + 5 * 60_000).toISOString()
  const preplayed = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: await headersFor(body, { 'Kick-Event-Message-Timestamp': future }) }), env)
  assert.equal(preplayed.status, 401, 'a timestamp far in the future must be refused')

  // Warm the key cache with one genuine delivery, then measure what junk costs.
  const genuine = await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: await headersFor(body) }), env)
  assert.equal(genuine.status, 204)
  const warm = keyFetches
  assert.equal(warm, 1, 'the first delivery fills the key cache exactly once')

  // A sender with a bad signature may force at most one public-key refetch per cooldown; without
  // the budget every junk delivery spent an outbound Kick request.
  for (let i = 0; i < 3; i += 1) {
    const h = await headersFor(body, { 'Kick-Event-Signature': 'AAAA' })
    assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: h }), env)).status, 401)
  }
  assert.equal(keyFetches - warm, 1, 'three junk deliveries may force only one refetch')
  const afterBudget = keyFetches
  for (let i = 0; i < 2; i += 1) {
    const h = await headersFor(body, { 'Kick-Event-Signature': 'BBBB' })
    assert.equal((await handleRequest(req('/api/webhooks/kick', { method: 'POST', body, headers: h }), env)).status, 401)
  }
  assert.equal(keyFetches, afterBudget, 'the cooldown must hold for every later junk delivery')
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

test('test-event delivers a clearly marked synthetic alert without touching production rows', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const { managementToken } = await connect(env, keys)
  const auth = { authorization: `Bearer ${managementToken}` }
  const publication = await (await handleRequest(req('/api/overlays/publish', { method: 'POST', body: JSON.stringify({ overlayId: 'overlay_test1234' }), headers: auth }), env)).json()

  const delivered = await (await handleRequest(req('/api/integrations/test-event', { method: 'POST', body: JSON.stringify({ type: 'channel.followed', username: 'TEST VIEWER' }), headers: auth }), env)).json()
  assert.equal(delivered.test, true)
  assert.equal(delivered.event.test, true)
  // CP25: a test goes to its own ephemeral table, so the production event table stays clean.
  assert.equal(delivered.stored, 'alert_test_frames')
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS n FROM events').bind().first().n, 0)
  // One frame per runtime key the connection can be watched through, and none of them a production row.
  const frames = env.DB.prepare('SELECT COUNT(*) AS n FROM alert_test_frames').bind().first().n
  assert.ok(frames >= 1)

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

test('an idle stream emits a heartbeat event the client can actually observe', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const { connection } = await connect(env, keys)
  const response = await handleRequest(req(`/api/runtime/${connection.runtimeKey}/events`), env)
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  // Read until at least one heartbeat arrives, or the window closes.
  for (let i = 0; i < 40 && !text.includes('event: heartbeat'); i += 1) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  // A comment-only keepalive is invisible to EventSource; the runtime needs a real named event to
  // distinguish a quiet channel from a dead one.
  assert.match(text, /event: ready/, 'the stream still announces itself first')
  assert.match(text, /event: heartbeat\ndata: \{"at":/, 'a named heartbeat event must be sent when idle')
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

test('the callback puts the exchange code inside the hash route, where the hash router reads it', async () => {
  const keys = await keypair()
  const { env } = makeEnv()
  const hashTarget = `${ORIGIN}/jubilant-octo-lamp/#/integrations`
  const start = await handleRequest(req('/api/auth/kick/start?return_to=' + encodeURIComponent(hashTarget)), env)
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  env.fetchImpl = async (url, options = {}) => {
    const u = String(url)
    if (u.startsWith('https://id.kick.com/oauth/token')) return Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: REQUIRED_SCOPES.join(' ') })
    if (u.startsWith('https://api.kick.com/public/v1/users')) return Response.json({ data: [{ user_id: 42, name: 'varystal' }] })
    if (u.startsWith('https://api.kick.com/public/v1/channels?')) return Response.json({ data: [{ slug: 'varystal', stream: { is_live: false, viewer_count: 3 } }] })
    if (u.startsWith('https://api.kick.com/public/v1/events/subscriptions')) return Response.json({ data: SUBSCRIBED_EVENTS.map((name, index) => ({ name, version: 1, subscription_id: `sub_${index}` })) })
    return Response.json({ data: [] })
  }
  const cb = await handleRequest(req(`/api/auth/kick/callback?code=c&state=${state}`), env)
  assert.equal(cb.status, 302)
  const back = new URL(cb.headers.get('location'))
  assert.equal(back.pathname, '/jubilant-octo-lamp/')
  assert.match(back.hash, /^#\/integrations\?exchange=/, 'the hash router must be able to see the code')
  assert.match(back.search, /exchange=/, 'a cached pre-fix bundle only reads the plain query, so mirror it there too')
  const code = new URLSearchParams(back.hash.slice(back.hash.indexOf('?') + 1)).get('exchange')
  assert.ok(code)

  // the code it handed back is redeemable and yields the management session
  const session = await handleRequest(req('/api/auth/session', { method: 'POST', body: JSON.stringify({ code }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(session.status, 200)
  assert.ok((await session.json()).managementToken)

  // a plain (non-hash) destination keeps the classic query placement
  const start2 = await handleRequest(req('/api/auth/kick/start?return_to=' + encodeURIComponent(`${ORIGIN}/plain`)), env)
  const state2 = new URL(start2.headers.get('location')).searchParams.get('state')
  const cb2 = await handleRequest(req(`/api/auth/kick/callback?code=c&state=${state2}`), env)
  assert.match(new URL(cb2.headers.get('location')).search, /exchange=/)
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

test('a crash answers with a bare error and keeps the detail server-side', async () => {
  const { env } = makeEnv()
  const broken = { ...env, DB: { prepare() { throw new Error('D1_ERROR: no such table: connections at offset 1') } } }
  const logged = []
  const originalError = console.error
  console.error = (...args) => logged.push(args.join(' '))
  try {
    const response = await worker.fetch(new Request(`${API}/api/runtime/abc/state`), broken, {})
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'internal_error' })
    assert.ok(logged.some((line) => line.includes('no such table')), 'the detail must still be logged')
  } finally { console.error = originalError }
})

test('CORS names the caller origin only when it is on the allowlist', async () => {
  const { env } = makeEnv()
  const allowed = await handleRequest(req('/api/health'), env)
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(allowed.headers.get('vary'), 'Origin')

  const other = await handleRequest(new Request(`${API}/api/health`, { headers: { origin: 'https://attacker.example' } }), env)
  assert.equal(other.status, 200)
  assert.equal(other.headers.get('access-control-allow-origin'), null, 'a foreign origin gets no allowance at all')

  const none = await handleRequest(new Request(`${API}/api/health`), env)
  assert.equal(none.headers.get('access-control-allow-origin'), null, 'a server-to-server call needs no allowance')
})


/* ------------------------------------------------ CP24 stream description */

test('stream info is read from the official channel payload and omits what Kick omits', () => {
  const channel = {
    stream_title: 'Late night ranked',
    category: { id: 15, name: 'Valorant' },
    stream: { is_live: true, start_time: '2026-11-05T08:00:00Z', viewer_count: 41 },
  }
  const info = streamInfoFromChannel(channel, '2026-11-05T09:00:00.000Z')
  assert.deepEqual(info, {
    title: 'Late night ranked', category: 'Valorant', isLive: true, startedAt: '2026-11-05T08:00:00Z', updatedAt: '2026-11-05T09:00:00.000Z',
  })
  // An offline channel reports no stream block at all: that must never become "live: false with a duration".
  const offline = streamInfoFromChannel({ stream_title: '', stream: null })
  assert.equal(offline, null)
  assert.equal(streamInfoFromChannel(null), null)
})

test('a livestream event merges into stored stream info without erasing fields it did not carry', () => {
  const previous = { title: 'Late night ranked', category: 'Valorant', isLive: true, startedAt: '2026-11-05T08:00:00Z', updatedAt: 'x' }
  const ended = mergeStreamInfo(previous, { isLive: false, title: null, startedAt: null }, '2026-11-05T12:00:00.000Z')
  assert.equal(ended.isLive, false, 'the status event owns the live flag')
  assert.equal(ended.title, 'Late night ranked', 'a status event carries no title, so the stored title stays')
  assert.equal(ended.startedAt, '2026-11-05T08:00:00Z')
  const metadata = mergeStreamInfo(ended, { title: 'Ranked grind', category: 'Just Chatting' }, '2026-11-05T12:05:00.000Z')
  assert.equal(metadata.title, 'Ranked grind')
  assert.equal(metadata.category, 'Just Chatting')
  assert.equal(metadata.isLive, false)
})

test('the runtime state route exposes the stored stream description and active subscribers', async () => {
  const { env } = makeEnv()
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO connections (id, channel_slug, tokens, subscriptions, connected, viewer, stream_info, active_subscribers, updated_at)
    VALUES ('con_stream', 'arystal', '{}', '[]', 1, '{"status":"offline","count":null,"updatedAt":null}', ?, 7, ?)`)
    .bind(JSON.stringify({ title: 'Late night ranked', category: 'Valorant', isLive: false, startedAt: '2026-11-05T08:00:00Z', updatedAt: '2026-11-05T09:00:00.000Z' }), now).run()
  // A runtime key belongs to a publication row, not to the connection: publishing is what mints it.
  await env.DB.prepare(`INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at)
    VALUES ('pub_stream', 'con_stream', 'ovl_1', 'rt_stream', ?, ?)`).bind(now, now).run()
  const response = await handleRequest(new Request(`${API}/api/runtime/rt_stream/state`), env)
  const body = await response.json()
  assert.equal(body.connected, true)
  assert.deepEqual(body.stream, { title: 'Late night ranked', category: 'Valorant', isLive: false, startedAt: '2026-11-05T08:00:00Z', updatedAt: '2026-11-05T09:00:00.000Z' })
  assert.equal(body.channel.activeSubscribers, 7)
})

test('an overlay with no stored description reports null rather than a blank title', async () => {
  const { env } = makeEnv()
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO connections (id, channel_slug, tokens, subscriptions, connected, viewer, updated_at)
    VALUES ('con_bare', 'arystal', '{}', '[]', 1, '{"status":"offline","count":null,"updatedAt":null}', ?)`)
    .bind(now).run()
  await env.DB.prepare(`INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at)
    VALUES ('pub_bare', 'con_bare', 'ovl_2', 'rt_bare', ?, ?)`).bind(now, now).run()
  const response = await handleRequest(new Request(`${API}/api/runtime/rt_bare/state`), env)
  const body = await response.json()
  assert.equal(body.stream, null)
  assert.equal(body.channel.activeSubscribers, null)
})

/* --------------------------------------------------------------- CP25 alerts */

const sha256hex = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** A connection plus the publication that mints its runtime key, and the management token that owns it. */
async function alertFixture({ connected = 1 } = {}) {
  const { env, sqlite } = makeEnv()
  const now = new Date().toISOString()
  const token = 'mgmt-token-alerts'
  await env.DB.prepare(`INSERT INTO connections (id, account_user_id, channel_slug, tokens, subscriptions, connected, viewer, event_counts, updated_at)
    VALUES ('con_alert', 90124079, 'arystal', '{}', '[]', ?, '{"status":"offline","count":null,"updatedAt":null}', '{}', ?)`)
    .bind(connected, now).run()
  await env.DB.prepare(`UPDATE connections SET management_hash = ? WHERE id = 'con_alert'`).bind(await sha256hex(token)).run()
  await env.DB.prepare(`INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at)
    VALUES ('pub_alert', 'con_alert', 'ovl_alert', 'rt_alert', ?, ?)`).bind(now, now).run()
  const insertEvent = (id, type, payload, receivedAt = now) => env.DB.prepare('INSERT INTO events (connection_id, runtime_key, message_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('con_alert', 'rt_alert', id, type, JSON.stringify({ id, type, receivedAt, test: false, data: payload }), receivedAt).run()
  return { env, sqlite, token, now, insertEvent }
}

test('the alert feed returns only alert-capable events and skips chat and metrics', async () => {
  const { env, insertEvent } = await alertFixture()
  await insertEvent('msg_follow', 'channel.followed', { follower: { username: 'Aria' } })
  await insertEvent('msg_chat', 'chat.message.sent', { content: 'hello' })
  await insertEvent('msg_viewer', 'metric.viewer.updated', { status: 'offline', count: null })
  const body = await (await handleRequest(req('/api/runtime/rt_alert/alerts'), env)).json()
  assert.deepEqual(body.alerts.map((item) => item.event.id), ['msg_follow'])
  assert.equal(body.alerts[0].event.data.follower.username, 'Aria')
  assert.equal(body.cursor, body.alerts[0].seq)
})

test('an acknowledged alert is never offered again, so a reload cannot replay it', async () => {
  const { env, insertEvent, now } = await alertFixture()
  await insertEvent('msg_a', 'channel.followed', { follower: { username: 'Aria' } })
  const first = await (await handleRequest(req('/api/runtime/rt_alert/alerts'), env)).json()
  assert.equal(first.alerts.length, 1)
  const ack = await (await handleRequest(req('/api/runtime/rt_alert/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['msg_a'] }), headers: { 'content-type': 'application/json' } }), env)).json()
  assert.equal(ack.acked, 1)
  // Same cursor as a fresh OBS source would use: the ack, not the cursor, is what stops the replay.
  const again = await (await handleRequest(req('/api/runtime/rt_alert/alerts?after=0'), env)).json()
  assert.deepEqual(again.alerts, [])
  // A second ack is idempotent rather than an error or a double count.
  const repeat = await (await handleRequest(req('/api/runtime/rt_alert/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['msg_a'] }), headers: { 'content-type': 'application/json' } }), env)).json()
  assert.equal(repeat.acked, 0)
  void now
})

test('the ack route rejects an empty or malformed body', async () => {
  const { env } = await alertFixture()
  const empty = await handleRequest(req('/api/runtime/rt_alert/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: [] }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(empty.status, 400)
  const junk = await handleRequest(req('/api/runtime/rt_alert/alerts/ack', { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } }), env)
  assert.equal(junk.status, 400)
  const unknown = await handleRequest(req('/api/runtime/rt_does_not_exist/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['x'] }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(unknown.status, 404)
})

test('test frames are isolated from the production feed and only appear when test mode asks', async () => {
  const { env } = await alertFixture()
  const sent = await (await handleRequest(req('/api/integrations/test-event', {
    method: 'POST', body: JSON.stringify({ type: 'channel.followed', username: 'TEST VIEWER' }),
    headers: { 'content-type': 'application/json', authorization: 'Bearer mgmt-token-alerts' },
  }), env)).json()
  assert.equal(sent.test, true)
  assert.equal(sent.stored, 'alert_test_frames')
  // No production row, and no counter moved.
  const rows = env.DB.prepare('SELECT COUNT(*) AS n FROM events').bind().first()
  assert.equal(rows.n, 0)
  const connection = env.DB.prepare("SELECT event_counts FROM connections WHERE id = 'con_alert'").bind().first()
  assert.equal(connection.event_counts, '{}')
  const production = await (await handleRequest(req('/api/runtime/rt_alert/alerts'), env)).json()
  assert.deepEqual(production.alerts, [])
  const testing = await (await handleRequest(req('/api/runtime/rt_alert/alerts?test=1'), env)).json()
  assert.equal(testing.alerts.length, 1)
  assert.equal(testing.alerts[0].event.test, true)
})

test('the test-event route requires the owner management token', async () => {
  const { env } = await alertFixture()
  const response = await handleRequest(req('/api/integrations/test-event', { method: 'POST', body: JSON.stringify({ type: 'channel.followed' }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(response.status, 401)
  const row = env.DB.prepare('SELECT COUNT(*) AS n FROM alert_test_frames').bind().first()
  assert.equal(row.n, 0)
})

test('milestone targets are stored only for a runtime the caller owns', async () => {
  const { env, sqlite } = await alertFixture()
  const auth = { 'content-type': 'application/json', authorization: 'Bearer mgmt-token-alerts' }
  const saved = await handleRequest(req('/api/runtime/rt_alert/alert-settings', { method: 'POST', body: JSON.stringify({ milestones: [{ metric: 'followers', target: 100, enabled: true }, { metric: 'bogus', target: 5, enabled: true }] }), headers: auth }), env)
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.milestones, 1)
  const row = sqlite.prepare("SELECT settings FROM alert_settings WHERE runtime_key = 'rt_alert'").get()
  assert.deepEqual(JSON.parse(row.settings).milestones, [{ metric: 'followers', target: 100, enabled: true }])
  const anonymous = await handleRequest(req('/api/runtime/rt_alert/alert-settings', { method: 'POST', body: JSON.stringify({ milestones: [] }), headers: { 'content-type': 'application/json' } }), env)
  assert.equal(anonymous.status, 401)
  // A different runtime key belonging to someone else is refused even with a valid token.
  const foreign = await handleRequest(req('/api/runtime/rt_someone_else/alert-settings', { method: 'POST', body: JSON.stringify({ milestones: [] }), headers: auth }), env)
  assert.equal(foreign.status, 403)
})

test('milestones are derived from durable counters, never from a guess', async () => {
  const settings = { milestones: [{ metric: 'followers', target: 100, enabled: true }, { metric: 'subscribers', target: 25, enabled: false }] }
  assert.deepEqual(crossedMilestones(settings, { 'channel.followed': 40 }), [])
  const crossed = crossedMilestones(settings, { 'channel.followed': 140, 'channel.subscription.new': 400 })
  assert.deepEqual(crossed.map((item) => item.id), ['milestone:followers:100'])
  assert.deepEqual(crossedMilestones(settings, { 'channel.followed': 140 }, new Set(['milestone:followers:100'])), [])
  assert.deepEqual(crossedMilestones({ milestones: [{ metric: 'followers', target: 0, enabled: true }] }, { 'channel.followed': 10 }), [])
  assert.deepEqual(crossedMilestones(null, { 'channel.followed': 10 }), [])
})

test('pruning removes expired test frames and leaves acknowledged alert state alone', async () => {
  const { env, sqlite } = await alertFixture()
  const old = new Date(Date.now() - 20 * 60_000).toISOString()
  await env.DB.prepare('INSERT INTO alert_test_frames (id, runtime_key, payload, created_at) VALUES (?, ?, ?, ?)').bind('t_old', 'rt_alert', '{}', old).run()
  await env.DB.prepare('INSERT INTO alert_acks (runtime_key, message_id, acked_at) VALUES (?, ?, ?)').bind('rt_alert', 'msg_recent', new Date().toISOString()).run()
  await pruneAlertState(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM alert_test_frames').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM alert_acks').get().n, 1)
})

test('an acknowledgement may only name an event the runtime actually received', async () => {
  const { env } = makeEnv()
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO connections (id, channel_slug, tokens, subscriptions, connected, viewer, updated_at)
    VALUES ('con_ack', 'arystal', '{}', '[]', 1, '{}', ?)`).bind(now).run()
  await env.DB.prepare(`INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at)
    VALUES ('pub_ack', 'con_ack', 'ovl_ack', 'rt_ack', ?, ?)`).bind(now, now).run()
  const event = normalizeEvent({ id: 'evt_real', type: 'channel.followed', payload: { follower: { username: 'real' } }, receivedAt: now })
  await env.DB.prepare(`INSERT INTO events (connection_id, runtime_key, message_id, type, payload, received_at)
    VALUES ('con_ack', 'rt_ack', 'evt_real', 'channel.followed', ?, ?)`).bind(JSON.stringify(event), now).run()

  const junk = await (await handleRequest(req('/api/runtime/rt_ack/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['made_up'] }) }), env)).json()
  assert.equal(junk.acked, 0)
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS n FROM alert_acks').bind().first().n, 0)

  const real = await (await handleRequest(req('/api/runtime/rt_ack/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['evt_real'] }) }), env)).json()
  assert.equal(real.acked, 1)
  const again = await (await handleRequest(req('/api/runtime/rt_ack/alerts/ack', { method: 'POST', body: JSON.stringify({ ids: ['evt_real'] }) }), env)).json()
  assert.equal(again.acked, 0)
})
