/**
 * Obsidian Overlay Studio — Kick integration backend for Cloudflare Workers (free tier).
 *
 * Runs entirely on Workers + D1. No Durable Objects, no Queues, no paid resources.
 * The route surface is identical to server/app.mjs so the GitHub Pages frontend
 * (src/lib/integration.ts + LiveDataProvider) works unchanged.
 *
 * Official Kick API only:
 *   OAuth 2.1 + PKCE  https://id.kick.com/oauth/authorize | /oauth/token
 *   Webhooks          RSA-SHA256 signature over "<messageId>.<timestamp>.<rawBody>"
 *                     verified with the PEM from /public/v1/public-key (never hardcoded)
 *   Viewer/live data  GET /public/v1/channels → data[].stream.viewer_count / is_live
 *   Total followers   NOT exposed by the Kick API (see docs/cloudflare-deployment.md)
 */

const ID_BASE = 'https://id.kick.com'
const API_BASE = 'https://api.kick.com'
export const REQUIRED_SCOPES = ['user:read', 'channel:read', 'events:subscribe']
export const SUBSCRIBED_EVENTS = [
  'chat.message.sent',
  'channel.followed',
  'channel.subscription.new',
  'channel.subscription.renewal',
  'channel.subscription.gifts',
  'kicks.gifted',
  'livestream.status.updated',
  'livestream.metadata.updated',
]
const MAX_BODY_BYTES = 256 * 1024
const WEBHOOK_MAX_AGE_MS = 10 * 60_000
const SSE_WINDOW_MS = 25_000
const SSE_POLL_MS = 2_000

/* ---------------------------------------------------------------- encoding */

const enc = new TextEncoder()
export const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const unb64url = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))
export const sha256Hex = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function pkcePair() {
  const verifier = randomToken(48)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))
  return { verifier, challenge, state: randomToken(24) }
}

/* ------------------------------------------------------- secret-at-rest box */

async function boxKey(secretText) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(String(secretText)))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function sealJson(value, secretText) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await boxKey(secretText), enc.encode(JSON.stringify(value)))
  return JSON.stringify({ v: 1, iv: b64url(iv), data: b64url(cipher) })
}

export async function openJson(payload, secretText) {
  const parsed = JSON.parse(payload)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(parsed.iv) }, await boxKey(secretText), unb64url(parsed.data))
  return JSON.parse(new TextDecoder().decode(plain))
}

/* ------------------------------------------------------------ Kick helpers */

export function authorizationUrl({ clientId, redirectUri, state, challenge, scopes = REQUIRED_SCOPES }) {
  const url = new URL(`${ID_BASE}/oauth/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state,
  }).toString()
  return url.toString()
}

function kickProblem(status, body) {
  const detail = typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)
  return new Error(`Kick API ${status}: ${detail}`)
}

async function kickFetch(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options)
  const type = response.headers?.get?.('content-type') || ''
  const body = type.includes('json') ? await response.json().catch(() => ({})) : await response.text()
  if (!response.ok) throw kickProblem(response.status, body)
  return body
}

export function tokenRequest(fetchImpl, { clientId, clientSecret, redirectUri }, params) {
  return kickFetch(fetchImpl, `${ID_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...(redirectUri ? { redirect_uri: redirectUri } : {}), ...params }),
  })
}

export async function kickApi(fetchImpl, token, path, options = {}) {
  return kickFetch(fetchImpl, `${API_BASE}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
  })
}

export const subscribeToEvents = async (fetchImpl, token, events = SUBSCRIBED_EVENTS) =>
  kickApi(fetchImpl, token, '/public/v1/events/subscriptions', { method: 'POST', body: JSON.stringify({ method: 'webhook', events: events.map((name) => ({ name, version: 1 })) }) }).then((b) => b.data ?? [])

export const unsubscribeFromEvents = async (fetchImpl, token, ids) => {
  const query = new URLSearchParams()
  ids.forEach((id) => query.append('id', id))
  return kickApi(fetchImpl, token, `/public/v1/events/subscriptions?${query}`, { method: 'DELETE' })
}

/** Live status + viewer count from the official channels endpoint. */
export const fetchChannelState = async (fetchImpl, token, broadcasterUserId) =>
  kickApi(fetchImpl, token, `/public/v1/channels?${new URLSearchParams({ broadcaster_user_id: String(broadcasterUserId) })}`).then((b) => (b.data ?? [])[0] ?? null)

export function viewerMetric(channel, updatedAt = new Date().toISOString()) {
  const stream = channel?.stream
  if (!stream) return { status: 'offline', count: null, updatedAt }
  if (!stream.is_live) return { status: 'offline', count: null, updatedAt }
  // Kick occasionally omits viewer_count; Number(null) would fabricate "0 viewers".
  const raw = stream.viewer_count
  const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  return { status: 'live', count, updatedAt }
}

/* --------------------------------------------------- webhook signature check */

function pemToBuffer(pem) {
  const body = String(pem).replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
}

export async function verifyKickSignature({ signature, messageId, timestamp, rawBody, publicKeyPem }) {
  if (!signature || !messageId || !timestamp || !publicKeyPem) return false
  try {
    const key = await crypto.subtle.importKey('spki', pemToBuffer(publicKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const signed = enc.encode(`${messageId}.${timestamp}.${rawBody}`)
    const raw = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0))
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, raw, signed)
  } catch {
    return false
  }
}

export function headerValue(headers, name) {
  const target = name.toLowerCase()
  for (const [key, value] of headers.entries()) if (key.toLowerCase() === target) return value
  return null
}

/* ------------------------------------------------------- event normalisation */

const person = (value) => value ? {
  userId: value.user_id ?? null,
  username: value.username ?? null,
  avatar: value.profile_picture ?? null,
  verified: Boolean(value.is_verified),
  channelSlug: value.channel_slug ?? null,
} : null

export function normalizeEvent({ id, type, payload, receivedAt = new Date().toISOString(), test = false }) {
  const base = { id, type, receivedAt, test, data: {} }
  switch (type) {
    case 'chat.message.sent':
      return { ...base, data: { messageId: payload.message_id, content: payload.content, createdAt: payload.created_at, sender: { ...person(payload.sender), usernameColor: payload.sender?.identity?.username_color ?? null, badges: payload.sender?.identity?.badges ?? [] }, broadcaster: person(payload.broadcaster) } }
    case 'channel.followed':
      return { ...base, data: { follower: person(payload.follower), broadcaster: person(payload.broadcaster) } }
    case 'channel.subscription.new':
    case 'channel.subscription.renewal':
      return { ...base, data: { subscriber: person(payload.subscriber), broadcaster: person(payload.broadcaster), duration: payload.duration, createdAt: payload.created_at, expiresAt: payload.expires_at } }
    case 'channel.subscription.gifts':
      return { ...base, data: { gifter: person(payload.gifter), giftees: (payload.giftees ?? []).map(person), broadcaster: person(payload.broadcaster), createdAt: payload.created_at } }
    case 'kicks.gifted':
      return { ...base, data: { sender: person(payload.sender), broadcaster: person(payload.broadcaster), gift: payload.gift ?? null, createdAt: payload.created_at } }
    case 'livestream.status.updated':
      return { ...base, data: { broadcaster: person(payload.broadcaster), isLive: Boolean(payload.is_live), title: payload.title ?? '', startedAt: payload.started_at ?? null, endedAt: payload.ended_at ?? null } }
    case 'livestream.metadata.updated':
      return { ...base, data: { broadcaster: person(payload.broadcaster), metadata: payload.metadata ?? {} } }
    default:
      return { ...base, data: { broadcaster: person(payload.broadcaster), unsupported: true } }
  }
}

/* --------------------------------------------------------------- D1 helpers */

const db = (env) => {
  if (!env?.DB) throw new Error('D1 binding DB is missing')
  return env.DB
}
const one = async (env, sql, ...params) => db(env).prepare(sql).bind(...params).first()
const all = async (env, sql, ...params) => (await db(env).prepare(sql).bind(...params).all()).results ?? []
const run = async (env, sql, ...params) => db(env).prepare(sql).bind(...params).run()

/* ------------------------------------------------------------ HTTP plumbing */

export function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || ''
  const allowed = String(env.APP_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null')
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  }
}

const json = (request, env, status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request, env) } })
const text = (request, env, status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(request, env) } })
// 204 must not carry a body: `new Response(body, { status: 204 })` throws, which would break every accepted webhook.
const noContent = (request, env) => new Response(null, { status: 204, headers: corsHeaders(request, env) })

function missingConfig(env) {
  const missing = []
  if (!env.KICK_CLIENT_ID) missing.push('KICK_CLIENT_ID')
  if (!env.KICK_CLIENT_SECRET) missing.push('KICK_CLIENT_SECRET')
  if (!env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY')
  if (!env.PUBLIC_API_URL) missing.push('PUBLIC_API_URL')
  if (!env.APP_ORIGINS) missing.push('APP_ORIGINS')
  return missing
}

/**
 * Mistakes that are not "missing" but still guarantee a failed token exchange.
 * The one that actually bit us: the Client Secret was pasted as the Client ID, so
 * Kick answered `invalid_client` and the cause looked like a generic Kick rejection.
 */
export function configProblems(env) {
  const problems = []
  const id = String(env.KICK_CLIENT_ID || '').trim()
  const secret = String(env.KICK_CLIENT_SECRET || '').trim()
  if (id && secret && id.toLowerCase() === secret.toLowerCase()) problems.push('KICK_CLIENT_ID_EQUALS_KICK_CLIENT_SECRET')
  return problems
}

const escapeHtml = (value) => String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const htmlPage = (request, env, status, title, body) => new Response(
  `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:system-ui;padding:32px;max-width:680px;margin:auto;background:#1b0b0f;color:#f5e9df;line-height:1.6"><h1 style="font-size:19px;color:#e8c37a">${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(body)}</pre></body>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', ...corsHeaders(request, env) } })

const redirectUri = (env) => `${String(env.PUBLIC_API_URL).replace(/\/$/, '')}/api/auth/kick/callback`
export const webhookUrl = (env) => `${String(env.PUBLIC_API_URL).replace(/\/$/, '')}/api/webhooks/kick`

const appOrigin = (env) => String(env.APP_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean)[0] || 'null'

function appendQuery(target, params) {
  const url = new URL(target)
  // The studio is a hash router (createHashRouter), so its routes read their query from inside
  // the hash. ?exchange= left outside the hash is invisible to useSearchParams and the callback
  // silently does nothing, so put the value where the router actually looks.
  if (url.hash.startsWith('#/')) {
    const hash = url.hash
    const cut = hash.indexOf('?')
    const route = cut === -1 ? hash : hash.slice(0, cut)
    const inner = new URLSearchParams(cut === -1 ? '' : hash.slice(cut + 1))
    Object.entries(params).forEach(([key, value]) => inner.set(key, value))
    url.hash = `${route}?${inner.toString()}`
    // Also mirror it outside the hash: a browser still running a cached pre-fix bundle only looks
    // at window.location.search, and this must not depend on the user hard-refreshing at the right
    // moment. The redeem step strips both.
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    return url.toString()
  }
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

export function connectionPayload(connection) {
  return {
    id: connection.id,
    connected: Boolean(connection.connected),
    runtimeKey: connection.runtime_key,
    account: { userId: connection.account_user_id, username: connection.account_username, avatar: connection.account_avatar },
    channel: { slug: connection.channel_slug, description: connection.channel_description, activeSubscribers: connection.active_subscribers },
    scopes: JSON.parse(connection.scopes || '[]'),
    subscriptions: JSON.parse(connection.subscriptions || '[]'),
    viewer: JSON.parse(connection.viewer || '{"status":"unavailable","count":null,"updatedAt":null}'),
    lastFollower: connection.last_follower ? JSON.parse(connection.last_follower) : null,
    sessionFollowerCount: Number(connection.session_follower_count || 0),
    lastEventAt: connection.last_event_at || null,
    lastEventType: connection.last_event_type || null,
    updatedAt: connection.updated_at || null,
    webhookError: connection.webhook_error || null,
  }
}

/**
 * Total followers: the Kick public API exposes no follower total (GET /public/v1/channels returns
 * subscriber counts and stream data only; GET /public/v1/users returns identity only). We surface a
 * real count only for follows received on this connection, and say so instead of inventing a total.
 */
export const FOLLOWER_TOTAL = { supported: false, reason: 'Kick public API exposes no total follower count' }

export function publicStatus(connection, env) {
  if (!connection) return { state: 'DISCONNECTED', missingScopes: [], requiredScopes: REQUIRED_SCOPES, followerTotal: FOLLOWER_TOTAL }
  const connectionBody = connectionPayload(connection)
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !connectionBody.scopes.includes(scope))
  const viewer = connectionBody.viewer
  const state = !connectionBody.connected
    ? 'DISCONNECTED'
    : missingScopes.length
      ? 'PERMISSION_MISSING'
      : viewer.status === 'stale' || viewer.status === 'unavailable'
        ? 'STALE_DATA'
        : 'CONNECTED'
  return {
    state,
    connection: connectionBody,
    missingScopes,
    requiredScopes: REQUIRED_SCOPES,
    followerTotal: FOLLOWER_TOTAL,
    webhook: {
      state: connectionBody.webhookError ? 'ERROR' : connectionBody.subscriptions.length ? 'CONNECTED' : 'SETUP_REQUIRED',
      endpoint: webhookUrl(env),
      subscriptions: connectionBody.subscriptions,
      error: connectionBody.webhookError,
    },
    donation: { state: 'SETUP_REQUIRED', message: 'No donation provider connected. Kick subscriptions, gifts and kicks are official; tips/donations need a separate provider.' },
  }
}

async function managedConnection(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const hash = await sha256Hex(token)
  const row = await one(env, 'SELECT * FROM connections WHERE management_hash = ? AND connected = 1', hash)
  return row ?? null
}

async function runtimeConnection(env, runtimeKey) {
  return one(env, `SELECT c.* FROM connections c JOIN publications p ON p.connection_id = c.id WHERE p.runtime_key = ?`, runtimeKey)
}

async function runtimeKeysFor(env, connectionId) {
  return (await all(env, 'SELECT runtime_key FROM publications WHERE connection_id = ?', connectionId)).map((row) => row.runtime_key)
}

/* ------------------------------------------------------- token refresh path */

export async function validAccessToken(env, connection, fetchImpl = fetch, now = Date.now()) {
  const stored = await openJson(connection.tokens, env.ENCRYPTION_KEY)
  if (stored.access_token && Number(stored.expires_at || 0) - 60_000 > now) return stored.access_token
  if (!stored.refresh_token) throw new Error('Kick refresh token is missing; reconnect the channel')
  const refreshed = await tokenRequest(fetchImpl, {
    clientId: env.KICK_CLIENT_ID, clientSecret: env.KICK_CLIENT_SECRET, redirectUri: redirectUri(env),
  }, { grant_type: 'refresh_token', refresh_token: stored.refresh_token })
  const next = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || stored.refresh_token,
    scope: refreshed.scope || stored.scope,
    expires_at: now + Number(refreshed.expires_in || 3600) * 1000,
  }
  await run(env, 'UPDATE connections SET tokens = ?, updated_at = ? WHERE id = ?', await sealJson(next, env.ENCRYPTION_KEY), new Date(now).toISOString(), connection.id)
  return next.access_token
}

/* ------------------------------------------------ viewer freshness (cron-free)
 * Workers deployments use the cron sweep above; Pages Functions have no cron, so the
 * same refresh runs lazily when a runtime asks for state and the number is stale.
 * One Kick call per connection per 45s at most, and a failure degrades to "stale"
 * instead of inventing a count. */
const VIEWER_MAX_AGE_MS = 45_000

export async function refreshViewerIfStale(env, connection, fetchImpl = fetch) {
  if (!connection?.connected) return connection
  const viewer = JSON.parse(connection.viewer || '{"status":"unavailable","count":null,"updatedAt":null}')
  const age = viewer.updatedAt ? Date.now() - Date.parse(viewer.updatedAt) : Number.POSITIVE_INFINITY
  if (age < VIEWER_MAX_AGE_MS) return connection
  try {
    const token = await validAccessToken(env, connection, fetchImpl)
    const channel = await fetchChannelState(fetchImpl, token, connection.account_user_id)
    const now = new Date().toISOString()
    const next = viewerMetric(channel, now)
    await run(env, 'UPDATE connections SET viewer = ?, active_subscribers = COALESCE(?, active_subscribers), updated_at = ? WHERE id = ?',
      JSON.stringify(next), channel?.active_subscribers_count ?? null, now, connection.id)
    return { ...connection, viewer: JSON.stringify(next), updated_at: now, active_subscribers: channel?.active_subscribers_count ?? connection.active_subscribers }
  } catch {
    const degraded = { ...viewer, status: viewer.updatedAt ? 'stale' : 'unavailable' }
    return { ...connection, viewer: JSON.stringify(degraded) }
  }
}

/* ------------------------------------------------------------ runtime stream */

function sseStream(env, runtimeKey, connection) {
  const started = Date.now()
  // Replay a short tail after a reconnect so nothing is lost, then stream live rows.
  const cutoff = new Date(started - 90_000).toISOString()
  let cursor = 0
  let closed = false
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => { if (!closed) controller.enqueue(encoder.encode(chunk)) }
      send(`retry: 2000\n\n`)
      await refreshViewerIfStale(env, connection).catch(() => null)
      send(`event: ready\ndata: ${JSON.stringify({ runtimeKey, at: new Date().toISOString() })}\n\n`)
      try {
        while (Date.now() - started < SSE_WINDOW_MS) {
          const rows = await all(env, 'SELECT seq, payload FROM events WHERE runtime_key = ? AND seq > ? AND received_at > ? ORDER BY seq ASC LIMIT 100', runtimeKey, cursor, cutoff)
          for (const row of rows) {
            cursor = Number(row.seq)
            send(`id: ${row.seq}\nevent: overlay-event\ndata: ${row.payload}\n\n`)
          }
          if (!rows.length) send(`: keepalive ${Date.now()}\n\n`)
          await new Promise((resolve) => setTimeout(resolve, SSE_POLL_MS))
        }
      } catch {
        send(`event: stream-error\ndata: ${JSON.stringify({ reason: 'runtime_unavailable' })}\n\n`)
      } finally {
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }
    },
    cancel() { closed = true },
  })
  return stream
}

/* ------------------------------------------------------------------- routes */

async function handleWebhook(request, env) {
  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) return json(request, env, 413, { error: 'payload_too_large' })
  const messageId = headerValue(request.headers, 'Kick-Event-Message-Id')
  const timestamp = headerValue(request.headers, 'Kick-Event-Message-Timestamp')
  const signature = headerValue(request.headers, 'Kick-Event-Signature')
  const eventType = headerValue(request.headers, 'Kick-Event-Type')
  const version = headerValue(request.headers, 'Kick-Event-Version')
  if (!messageId || !timestamp || !signature || !eventType || !version) return json(request, env, 401, { error: 'missing_headers' })
  const sentAt = Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > WEBHOOK_MAX_AGE_MS) return json(request, env, 401, { error: 'stale_timestamp' })

  const fetchImpl = env.fetchImpl || fetch
  let publicKeyPem = await cachedPublicKey(env, false, fetchImpl)
  let valid = await verifyKickSignature({ signature, messageId, timestamp, rawBody, publicKeyPem })
  if (!valid) {
    publicKeyPem = await cachedPublicKey(env, true, fetchImpl)
    valid = await verifyKickSignature({ signature, messageId, timestamp, rawBody, publicKeyPem })
  }
  if (!valid) return json(request, env, 401, { error: 'invalid_signature' })

  const seen = await one(env, 'SELECT message_id FROM processed WHERE message_id = ?', messageId)
  if (seen) return noContent(request, env)

  let payload
  try { payload = JSON.parse(rawBody) } catch { return json(request, env, 400, { error: 'malformed_json' }) }
  const broadcasterId = payload.broadcaster?.user_id
  if (!broadcasterId) return json(request, env, 400, { error: 'missing_broadcaster' })

  const connection = await one(env, 'SELECT * FROM connections WHERE account_user_id = ?', Number(broadcasterId))
  if (!connection) {
    await run(env, 'INSERT OR IGNORE INTO processed (message_id, at) VALUES (?, ?)', messageId, new Date().toISOString())
    return json(request, env, 202, { accepted: true, reason: 'unknown_broadcaster' })
  }

  const now = new Date().toISOString()
  const event = normalizeEvent({ id: messageId, type: eventType, payload, receivedAt: now })
  await run(env, 'INSERT OR IGNORE INTO processed (message_id, at) VALUES (?, ?)', messageId, now)

  const keys = await runtimeKeysFor(env, connection.id)
  for (const key of keys) {
    await run(env, 'INSERT INTO events (connection_id, runtime_key, message_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
      connection.id, key, messageId, eventType, JSON.stringify(event), now)
  }

  const patch = { last_event_at: now, last_event_type: eventType }
  if (eventType === 'chat.message.sent') patch.last_chat_user = payload.sender?.username ?? null
  if (eventType === 'channel.followed') {
    patch.last_follower = JSON.stringify(person(payload.follower))
    patch.session_follower_count = Number(connection.session_follower_count || 0) + 1
  }
  if (eventType === 'livestream.status.updated') {
    patch.viewer = JSON.stringify({ status: payload.is_live ? 'live' : 'offline', count: payload.is_live ? JSON.parse(connection.viewer || '{}').count ?? null : null, updatedAt: now })
  }
  const fields = Object.keys(patch)
  await run(env, `UPDATE connections SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...fields.map((f) => patch[f]), now, connection.id)

  return noContent(request, env)
}

let publicKeyCache = { pem: null, at: 0 }
export function resetPublicKeyCache() { publicKeyCache = { pem: null, at: 0 } }
export async function cachedPublicKey(env, force = false, fetchImpl = fetch) {
  if (!force && publicKeyCache.pem && Date.now() - publicKeyCache.at < 60 * 60_000) return publicKeyCache.pem
  const body = await kickFetch(fetchImpl, `${API_BASE}/public/v1/public-key`, { headers: { accept: 'application/json' } })
  const pem = body?.data?.public_key ?? body?.public_key
  if (!pem) throw new Error('Kick public key response was empty')
  publicKeyCache = { pem, at: Date.now() }
  return pem
}

export async function handleRequest(request, env, ctx = {}) {
  const url = new URL(request.url)
  const fetchImpl = env.fetchImpl || fetch
  const path = url.pathname
  const missing = missingConfig(env)

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })

  if (request.method === 'GET' && path === '/api/health') return json(request, env, 200, { ok: true, service: 'overlay-integration-api', runtime: 'cloudflare-workers', time: new Date().toISOString() })

  if (request.method === 'GET' && path === '/api/setup') {
    const problems = configProblems(env)
    return json(request, env, 200, {
      state: missing.length ? 'SETUP_REQUIRED' : problems.length ? 'MISCONFIGURED' : 'DISCONNECTED',
      missing,
      problems,
      requiredScopes: REQUIRED_SCOPES,
      events: SUBSCRIBED_EVENTS,
      callbackUrl: redirectUri(env),
      webhookUrl: webhookUrl(env),
      missingScopes: REQUIRED_SCOPES,
      followerTotal: FOLLOWER_TOTAL,
      webhook: { state: 'SETUP_REQUIRED', endpoint: webhookUrl(env), subscriptions: [], error: null },
      donation: { state: 'SETUP_REQUIRED', message: 'No donation provider connected.' },
      runtime: 'cloudflare-workers',
    })
  }

  if (request.method === 'GET' && path === '/api/auth/kick/start') {
    if (missing.length) return json(request, env, 503, { error: 'setup_required', missing })
    let returnTo = url.searchParams.get('return_to') || `${appOrigin(env)}/#/integrations`
    let target
    try { target = new URL(returnTo) } catch { return json(request, env, 400, { error: 'invalid_return_origin' }) }
    const allowed = String(env.APP_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
    if (!allowed.includes(target.origin)) return json(request, env, 400, { error: 'invalid_return_origin' })

    // A caller that sends only the origin (older builds did) would send the user to the Pages
    // root, which 404s for project sites. The page that started the flow knows the real mount
    // path, so recover it from the referer before falling back to the bare origin.
    if (target.pathname === '/' || target.pathname === '') {
      const referer = request.headers.get('referer')
      if (referer) {
        try {
          const from = new URL(referer)
          if (allowed.includes(from.origin) && from.pathname !== '/') {
            const repaired = new URL(from.origin + from.pathname)
            repaired.hash = target.hash || '/integrations'
            returnTo = repaired.toString()
            target = repaired
          }
        } catch { /* keep the origin-only target */ }
      }
    }
    const pkce = await pkcePair()
    await run(env, 'INSERT INTO oauth_states (state, verifier, return_to, expires_at) VALUES (?, ?, ?, ?)',
      pkce.state, pkce.verifier, returnTo, Date.now() + 10 * 60_000)
    return new Response(null, { status: 302, headers: { location: authorizationUrl({ clientId: env.KICK_CLIENT_ID, redirectUri: redirectUri(env), state: pkce.state, challenge: pkce.challenge }), ...corsHeaders(request, env) } })
  }

  if (request.method === 'GET' && path === '/api/auth/kick/callback') {
    const oauthError = url.searchParams.get('error')
    if (oauthError) return text(request, env, 400, `Kick authorization failed: ${oauthError}`)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return text(request, env, 400, 'Missing OAuth code or state')
    const pending = await one(env, 'SELECT * FROM oauth_states WHERE state = ?', state)
    if (!pending) return text(request, env, 400, 'OAuth state is invalid or expired')
    if (Number(pending.expires_at) < Date.now()) {
      await run(env, 'DELETE FROM oauth_states WHERE state = ?', state)
      return text(request, env, 400, 'OAuth state is invalid or expired')
    }
    await run(env, 'DELETE FROM oauth_states WHERE state = ?', state)

    let tokens
    try {
      tokens = await tokenRequest(fetchImpl, { clientId: env.KICK_CLIENT_ID, clientSecret: env.KICK_CLIENT_SECRET, redirectUri: redirectUri(env) },
        { grant_type: 'authorization_code', code, code_verifier: pending.verifier })
    } catch (error) {
      const reason = String(error?.message || error)
      const hint = configProblems(env).includes('KICK_CLIENT_ID_EQUALS_KICK_CLIENT_SECRET')
        ? 'This deployment has the Client ID saved as the Client Secret, so Kick cannot authenticate the app. Paste the real Client Secret from the Kick developer page as KICK_CLIENT_SECRET, then redeploy.'
        : /invalid_client/.test(reason)
          ? 'Kick rejected the app credentials. Re-copy the Client Secret from the Kick developer page. Regenerating a secret invalidates the previous one.'
          : 'Kick rejected the token exchange. Confirm the Redirect URL registered in the Kick app matches this exact callback URL.'
      return htmlPage(request, env, 400, 'Kick token exchange failed', `${reason}\n\n${hint}`)
    }
    const accessToken = tokens.access_token
    if (!accessToken) return text(request, env, 502, 'Kick did not return an access token')
    const user = await kickApi(fetchImpl, accessToken, '/public/v1/users').then((b) => (b.data ?? [])[0] ?? null).catch(() => null)
    const channel = await fetchChannelState(fetchImpl, accessToken, user?.user_id).catch(() => null)
      ?? await kickApi(fetchImpl, accessToken, '/public/v1/channels').then((b) => (b.data ?? [])[0] ?? null).catch(() => null)
    if (!user?.user_id) return text(request, env, 502, 'Kick did not return an authorized user identity')

    const previous = await one(env, 'SELECT subscriptions FROM connections WHERE account_user_id = ?', Number(user.user_id))
    const previousSubscriptions = JSON.parse(previous?.subscriptions || '[]')
    // Re-authorizing must not stack a second set of subscriptions on the same app+channel, and a
    // failed re-subscribe must not erase a set that is already delivering. Drop the old ones
    // first, then keep the previous list if the new call does not come back.
    let subscriptions = previousSubscriptions
    let webhookError = null
    try {
      const staleIds = previousSubscriptions.map((item) => item.subscription_id ?? item.id).filter(Boolean)
      if (staleIds.length) await unsubscribeFromEvents(fetchImpl, accessToken, staleIds).catch(() => null)
      subscriptions = await subscribeToEvents(fetchImpl, accessToken)
    } catch (error) { webhookError = error.message }

    const stored = {
      access_token: accessToken,
      refresh_token: tokens.refresh_token ?? null,
      scope: tokens.scope ?? '',
      expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    }
    const managementToken = randomToken(32)
    const connectionId = `con_${randomToken(9)}`
    const connectionRuntimeKey = randomToken(18)
    const now = new Date().toISOString()
    const existing = await one(env, 'SELECT id, runtime_key FROM connections WHERE account_user_id = ?', Number(user.user_id))
    const runtimeKey = existing?.runtime_key || connectionRuntimeKey
    await run(env, `INSERT INTO connections (id, account_user_id, account_username, account_avatar, channel_slug, channel_description, active_subscribers, tokens, management_hash, runtime_key, scopes, subscriptions, webhook_error, connected, viewer, session_follower_count, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)
                    ON CONFLICT(account_user_id) DO UPDATE SET
                      tokens = excluded.tokens, management_hash = excluded.management_hash, scopes = excluded.scopes,
                      subscriptions = excluded.subscriptions, webhook_error = excluded.webhook_error, connected = 1,
                      channel_slug = excluded.channel_slug, channel_description = excluded.channel_description,
                      active_subscribers = excluded.active_subscribers, runtime_key = excluded.runtime_key,
                      updated_at = excluded.updated_at`,
      connectionId, Number(user.user_id), user.name ?? '', user.profile_picture ?? null,
      channel?.slug ?? '', channel?.channel_description ?? '', channel?.active_subscribers_count ?? null,
      await sealJson(stored, env.ENCRYPTION_KEY), await sha256Hex(managementToken), runtimeKey,
      JSON.stringify(String(tokens.scope || '').split(/\s+/).filter(Boolean)), JSON.stringify(subscriptions),
      webhookError, JSON.stringify(viewerMetric(channel, now)), now)

    const row = await one(env, 'SELECT id FROM connections WHERE account_user_id = ?', Number(user.user_id))
    // The connection key is a publication of its own so an overlay can stream before Publish is pressed.
    await run(env, `INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at)
                    VALUES (?, ?, '__connection__', ?, ?, ?)
                    ON CONFLICT(runtime_key) DO NOTHING`, `pub_${randomToken(9)}`, row.id, runtimeKey, now, now)
    const exchangeCode = randomToken(24)
    await run(env, 'INSERT INTO exchanges (code, connection_id, management_token, expires_at) VALUES (?, ?, ?, ?)',
      exchangeCode, row.id, managementToken, Date.now() + 15 * 60_000)
    return new Response(null, { status: 302, headers: { location: appendQuery(pending.return_to, { exchange: exchangeCode }), ...corsHeaders(request, env) } })
  }

  if (request.method === 'POST' && path === '/api/auth/session') {
    const body = await request.json().catch(() => ({}))
    const exchange = await one(env, 'SELECT * FROM exchanges WHERE code = ?', String(body.code || ''))
    if (!exchange || Number(exchange.expires_at) < Date.now()) return json(request, env, 401, { error: 'invalid_or_expired_exchange' })
    await run(env, 'DELETE FROM exchanges WHERE code = ?', exchange.code)
    const connection = await one(env, 'SELECT * FROM connections WHERE id = ?', exchange.connection_id)
    if (!connection) return json(request, env, 401, { error: 'invalid_or_expired_exchange' })
    return json(request, env, 200, { managementToken: exchange.management_token, connection: connectionPayload(connection) })
  }

  if (request.method === 'GET' && path === '/api/integrations/kick') {
    const connection = await managedConnection(request, env)
    if (!connection) return json(request, env, 401, { error: 'unauthorized' })
    return json(request, env, 200, publicStatus(await refreshViewerIfStale(env, connection, fetchImpl), env))
  }

  if (request.method === 'POST' && path === '/api/overlays/publish') {
    const connection = await managedConnection(request, env)
    if (!connection) return json(request, env, 401, { error: 'unauthorized' })
    const body = await request.json().catch(() => ({}))
    const overlayId = String(body.overlayId || '')
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(overlayId)) return json(request, env, 400, { error: 'invalid_overlay_id' })
    const existing = await one(env, 'SELECT * FROM publications WHERE connection_id = ? AND overlay_id = ?', connection.id, overlayId)
    if (existing) return json(request, env, 200, { publicationId: existing.id, overlayId, runtimeKey: existing.runtime_key, createdAt: existing.created_at, updatedAt: existing.updated_at })
    const publication = { id: `pub_${randomToken(9)}`, runtimeKey: randomToken(18), createdAt: new Date().toISOString() }
    await run(env, 'INSERT INTO publications (id, connection_id, overlay_id, runtime_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      publication.id, connection.id, overlayId, publication.runtimeKey, publication.createdAt, publication.createdAt)
    return json(request, env, 200, { publicationId: publication.id, overlayId, runtimeKey: publication.runtimeKey, createdAt: publication.createdAt, updatedAt: publication.createdAt })
  }

  if (request.method === 'POST' && path === '/api/integrations/kick/resubscribe') {
    const connection = await managedConnection(request, env)
    if (!connection) return json(request, env, 401, { error: 'unauthorized' })
    const token = await validAccessToken(env, connection, fetchImpl)
    const ids = JSON.parse(connection.subscriptions || '[]').map((item) => item.subscription_id ?? item.id).filter(Boolean)
    if (ids.length) await unsubscribeFromEvents(fetchImpl, token, ids).catch(() => null)
    const subscriptions = await subscribeToEvents(fetchImpl, token)
    await run(env, 'UPDATE connections SET subscriptions = ?, webhook_error = NULL, updated_at = ? WHERE id = ?', JSON.stringify(subscriptions), new Date().toISOString(), connection.id)
    return json(request, env, 200, publicStatus(await one(env, 'SELECT * FROM connections WHERE id = ?', connection.id), env))
  }

  if (request.method === 'POST' && path === '/api/integrations/kick/disconnect') {
    const connection = await managedConnection(request, env)
    if (!connection) return json(request, env, 401, { error: 'unauthorized' })
    try {
      const token = await validAccessToken(env, connection, fetchImpl)
      const ids = JSON.parse(connection.subscriptions || '[]').map((item) => item.subscription_id ?? item.id).filter(Boolean)
      if (ids.length) await unsubscribeFromEvents(fetchImpl, token, ids)
      await kickFetch(fetchImpl, `${ID_BASE}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_hint_type: 'access_token' }) }).catch(() => null)
    } catch { /* local disconnect still clears credentials */ }
    await run(env, 'UPDATE connections SET connected = 0, tokens = ?, management_hash = NULL, updated_at = ? WHERE id = ?', await sealJson({}, env.ENCRYPTION_KEY), new Date().toISOString(), connection.id)
    return json(request, env, 200, { state: 'DISCONNECTED' })
  }

  if (request.method === 'POST' && path === '/api/integrations/test-event') {
    const connection = await managedConnection(request, env)
    if (!connection) return json(request, env, 401, { error: 'unauthorized' })
    const body = await request.json().catch(() => ({}))
    const type = ['chat.message.sent', 'channel.followed', 'channel.subscription.new', 'kicks.gifted'].includes(body.type) ? body.type : 'channel.followed'
    const sample = { user_id: 0, username: 'TEST EVENT', profile_picture: null, channel_slug: 'test', is_verified: false, identity: { username_color: '#d8ad55', badges: [{ type: 'test', text: 'TEST' }] } }
    const payload = type === 'chat.message.sent'
      ? { message_id: randomToken(8), content: body.message || 'پیام آزمایشی — رویداد واقعی Kick نیست', created_at: new Date().toISOString(), sender: sample, broadcaster: { user_id: connection.account_user_id } }
      : type === 'channel.followed'
        ? { follower: sample, broadcaster: { user_id: connection.account_user_id } }
        : type === 'channel.subscription.new'
          ? { subscriber: sample, broadcaster: { user_id: connection.account_user_id }, duration: 1, created_at: new Date().toISOString() }
          : { sender: sample, broadcaster: { user_id: connection.account_user_id }, gift: { amount: 1, name: 'TEST KICK', type: 'TEST', tier: 'TEST' }, created_at: new Date().toISOString() }
    const now = new Date().toISOString()
    const event = normalizeEvent({ id: `test_${randomToken(8)}`, type, payload, receivedAt: now, test: true })
    for (const key of await runtimeKeysFor(env, connection.id)) {
      await run(env, 'INSERT INTO events (connection_id, runtime_key, message_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
        connection.id, key, event.id, type, JSON.stringify(event), now)
    }
    return json(request, env, 200, { delivered: true, test: true, event })
  }

  if (request.method === 'GET' && path.startsWith('/api/runtime/')) {
    const parts = path.split('/')
    const runtimeKey = parts[3]
    const tail = parts[4]
    const connection = await runtimeConnection(env, runtimeKey)
    if (!connection) return json(request, env, 404, { error: 'runtime_not_found' })
    if (tail === 'state') {
      const fresh = await refreshViewerIfStale(env, connection, env.fetchImpl || fetch)
      return json(request, env, 200, {
        connected: Boolean(fresh.connected),
        viewer: JSON.parse(fresh.viewer || '{"status":"unavailable","count":null,"updatedAt":null}'),
        latestFollower: fresh.last_follower ? JSON.parse(fresh.last_follower) : null,
        sessionFollowerCount: Number(fresh.session_follower_count || 0),
        channel: { slug: fresh.channel_slug, description: fresh.channel_description },
        lastEventAt: connection.last_event_at || null,
        followerTotal: FOLLOWER_TOTAL,
        serverTime: new Date().toISOString(),
      })
    }
    if (tail === 'events') {
      if (!connection.connected) return json(request, env, 409, { error: 'integration_disconnected' })
      return new Response(sseStream(env, runtimeKey, connection), {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', ...corsHeaders(request, env) },
      })
    }
  }

  if (request.method === 'POST' && path === '/api/webhooks/kick') return handleWebhook(request, env)

  return json(request, env, 404, { error: 'not_found' })
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx).catch((error) => json(request, env, 500, { error: 'internal_error', message: String(error?.message || error).slice(0, 200) }))
  },
  /** Cron: refresh live status + viewer count from the official channels endpoint. */
  async scheduled(event, env) {
    // Keep D1 small: the runtime only replays a 90s tail, so older rows are dead weight.
    const stale = new Date(Date.now() - 60 * 60_000).toISOString()
    await run(env, 'DELETE FROM events WHERE received_at < ?', stale).catch(() => null)
    const rows = await all(env, 'SELECT * FROM connections WHERE connected = 1 LIMIT 20')
    for (const connection of rows) {
      try {
        const token = await validAccessToken(env, connection)
        const channel = await fetchChannelState(fetch, token, connection.account_user_id)
        const now = new Date().toISOString()
        const viewer = viewerMetric(channel, now)
        await run(env, 'UPDATE connections SET viewer = ?, active_subscribers = COALESCE(?, active_subscribers), updated_at = ? WHERE id = ?',
          JSON.stringify(viewer), channel?.active_subscribers_count ?? null, now, connection.id)
        const event = { id: `metric_${randomToken(9)}`, type: 'metric.viewer.updated', receivedAt: now, test: false, data: viewer }
        for (const key of await runtimeKeysFor(env, connection.id)) {
          await run(env, 'INSERT INTO events (connection_id, runtime_key, message_id, type, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
            connection.id, key, event.id, event.type, JSON.stringify(event), now)
        }
      } catch { /* one bad connection must not stop the sweep */ }
    }
  },
}
