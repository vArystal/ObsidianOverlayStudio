import { createServer } from 'node:http'
import { URL } from 'node:url'
import { createPkce, randomToken } from './security.mjs'
import { createEventBus } from './event-bus.mjs'
import { createKickClient, validAccessToken } from './kick-client.mjs'
import { createIntegrationStore } from './store.mjs'
import { createEventProcessor, normalizeKickEvent } from './event-processor.mjs'
import { createDonationRegistry } from './donations.mjs'
import { KICK_EVENT_TYPES, REQUIRED_KICK_SCOPES } from './config.mjs'

function sendJson(response, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), ...extraHeaders })
  response.end(body)
}

function sendText(response, status, text, headers = {}) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers }); response.end(text)
}

async function readBody(request, limit = 1024 * 1024) {
  const chunks = []; let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

function bearer(request) {
  const value = request.headers.authorization || ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

function appendExchange(returnTo, code) {
  const url = new URL(returnTo)
  const route = url.hash.slice(1) || '/integrations'
  url.hash = `${route}${route.includes('?') ? '&' : '?'}exchange=${encodeURIComponent(code)}`
  return url.toString()
}

function publicStatus(store, connection, config) {
  if (!connection) return { state: config.missing.length ? 'SETUP_REQUIRED' : 'DISCONNECTED', missing: config.missing }
  const safe = store.redact(connection)
  const missingScopes = REQUIRED_KICK_SCOPES.filter((scope) => !connection.scopes?.includes(scope))
  const state = !connection.connected
    ? 'DISCONNECTED'
    : missingScopes.length
      ? 'PERMISSION_MISSING'
      : connection.syncError
        ? connection.viewer?.updatedAt ? 'STALE_DATA' : 'ERROR'
        : 'CONNECTED'
  return {
    state,
    connection: safe,
    missingScopes,
    requiredScopes: REQUIRED_KICK_SCOPES,
    webhook: {
      state: connection.webhookError ? 'ERROR' : connection.subscriptions?.length ? 'CONNECTED' : 'SETUP_REQUIRED',
      endpoint: `${config.publicApiUrl}/api/webhooks/kick`,
      subscriptions: connection.subscriptions ?? [],
      error: connection.webhookError ?? null,
    },
  }
}

export async function createApp({ config, fetchImpl = fetch, persist = true } = {}) {
  const bus = createEventBus()
  const store = createIntegrationStore({ filePath: config.dataFile, encryptionKey: config.tokenEncryptionKey || 'development-only-encryption-key-32', persist })
  await store.init()
  const kick = createKickClient({ clientId: config.kickClientId, clientSecret: config.kickClientSecret, redirectUri: config.kickRedirectUri, fetchImpl })
  const donations = createDonationRegistry()
  let cachedKey = null; let keyFetchedAt = 0
  async function getPublicKey(force = false) {
    if (!force && cachedKey && Date.now() - keyFetchedAt < 60 * 60_000) return cachedKey
    cachedKey = await kick.getPublicKey(); keyFetchedAt = Date.now(); return cachedKey
  }
  const processor = createEventProcessor({ store, bus, getPublicKey })

  async function managedConnection(request) { return store.authenticate(bearer(request)) }

  async function pollViewerCounts() {
    for (const connection of await store.listConnected()) {
      try {
        const token = await validAccessToken({ connection, store, client: kick })
        const live = await kick.getLivestream(token, connection.account.userId)
        const viewer = live ? { status: 'live', count: Number(live.viewer_count ?? 0), updatedAt: new Date().toISOString() } : { status: 'offline', count: 0, updatedAt: new Date().toISOString() }
        await store.updateConnection(connection.id, { viewer, lastSyncAt: new Date().toISOString(), syncError: null })
        const event = { id: randomToken(10), type: 'metric.viewer.updated', receivedAt: viewer.updatedAt, test: false, data: viewer }
        ;(await store.runtimeKeysForConnection(connection.id)).forEach((runtimeKey) => bus.publish(runtimeKey, event))
      } catch (error) {
        const previous = connection.viewer ?? { count: null, updatedAt: null }
        const viewer = { ...previous, status: previous.updatedAt ? 'stale' : 'unavailable' }
        await store.updateConnection(connection.id, { viewer, syncError: error.message })
        const event = { id: randomToken(10), type: 'metric.viewer.updated', receivedAt: new Date().toISOString(), test: false, data: viewer }
        ;(await store.runtimeKeysForConnection(connection.id)).forEach((runtimeKey) => bus.publish(runtimeKey, event))
      }
    }
  }

  async function handler(request, response) {
    const origin = request.headers.origin
    const corsOrigin = origin && config.appOrigins.includes(origin) ? origin : config.appOrigins[0]
    const cors = { 'access-control-allow-origin': corsOrigin, vary: 'Origin', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'cache-control': 'no-store' }
    Object.entries(cors).forEach(([key, value]) => response.setHeader(key, value))
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'no-referrer')
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end() }
    const url = new URL(request.url, config.publicApiUrl)

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true, service: 'overlay-integration-api', time: new Date().toISOString() })
      if (request.method === 'GET' && url.pathname === '/api/setup') return sendJson(response, 200, { state: config.missing.length ? 'SETUP_REQUIRED' : 'DISCONNECTED', missing: config.missing, requiredScopes: REQUIRED_KICK_SCOPES, events: KICK_EVENT_TYPES, callbackUrl: config.kickRedirectUri, webhookUrl: `${config.publicApiUrl}/api/webhooks/kick`, donation: await donations.status() })

      if (request.method === 'GET' && url.pathname === '/api/auth/kick/start') {
        if (config.missing.length) return sendJson(response, 503, { error: 'setup_required', missing: config.missing })
        const returnTo = url.searchParams.get('return_to') || `${config.appOrigins[0]}/#/integrations`
        const target = new URL(returnTo)
        if (!config.appOrigins.includes(target.origin)) return sendJson(response, 400, { error: 'invalid_return_origin' })
        const pkce = createPkce()
        await store.createOAuth({ state: pkce.state, verifier: pkce.verifier, returnTo, expiresAt: Date.now() + 10 * 60_000 })
        response.writeHead(302, { location: kick.authorizationUrl({ state: pkce.state, challenge: pkce.challenge, scopes: REQUIRED_KICK_SCOPES }), ...cors }); return response.end()
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/kick/callback') {
        const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); const oauthError = url.searchParams.get('error')
        if (oauthError) return sendText(response, 400, `Kick authorization failed: ${oauthError}`)
        if (!code || !state) return sendText(response, 400, 'Missing OAuth code or state')
        const pending = await store.consumeOAuth(state)
        if (!pending || pending.expiresAt < Date.now()) return sendText(response, 400, 'OAuth state is invalid or expired')
        const tokenResponse = await kick.exchangeCode(code, pending.verifier)
        const tokens = { ...tokenResponse, expiresAt: Date.now() + Number(tokenResponse.expires_in || 3600) * 1000 }
        const user = await kick.getCurrentUser(tokens.access_token)
        const channel = await kick.getCurrentChannel(tokens.access_token)
        if (!user?.user_id) return sendText(response, 502, 'Kick did not return an authorized user identity')
        let subscriptions = []; let webhookError = null
        try { subscriptions = await kick.subscribe(tokens.access_token, KICK_EVENT_TYPES) } catch (error) { webhookError = error.message }
        const result = await store.saveConnection({ account: { userId: user.user_id, username: user.name, avatar: user.profile_picture ?? null }, channel: { slug: channel?.slug ?? '', description: channel?.channel_description ?? '', activeSubscribers: channel?.active_subscribers_count ?? null }, scopes: String(tokenResponse.scope || '').split(/\s+/).filter(Boolean), subscriptions, webhookError }, tokens)
        const exchange = await store.createExchange(result.connection.id, result.managementToken)
        response.writeHead(302, { location: appendExchange(pending.returnTo, exchange), ...cors }); return response.end()
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/session') {
        const body = JSON.parse((await readBody(request)).toString('utf8') || '{}')
        const exchange = await store.consumeExchange(body.code)
        if (!exchange) return sendJson(response, 401, { error: 'invalid_or_expired_exchange' })
        const connection = await store.getConnection(exchange.connectionId)
        return sendJson(response, 200, { managementToken: exchange.managementToken, connection: store.redact(connection) })
      }

      if (request.method === 'GET' && url.pathname === '/api/integrations/kick') {
        const connection = await managedConnection(request)
        if (!connection) return sendJson(response, 401, { error: 'unauthorized' })
        return sendJson(response, 200, { ...publicStatus(store, connection, config), donation: await donations.status() })
      }

      if (request.method === 'POST' && url.pathname === '/api/overlays/publish') {
        const connection = await managedConnection(request); if (!connection) return sendJson(response, 401, { error: 'unauthorized' })
        const body = JSON.parse((await readBody(request)).toString('utf8') || '{}')
        const overlayId = String(body.overlayId || '')
        if (!/^[A-Za-z0-9_-]{8,120}$/.test(overlayId)) return sendJson(response, 400, { error: 'invalid_overlay_id' })
        const publication = await store.createPublication(connection.id, overlayId)
        return sendJson(response, 200, { publicationId: publication.id, overlayId: publication.overlayId, runtimeKey: publication.runtimeKey, createdAt: publication.createdAt, updatedAt: publication.updatedAt })
      }

      if (request.method === 'POST' && url.pathname === '/api/integrations/kick/resubscribe') {
        const connection = await managedConnection(request); if (!connection) return sendJson(response, 401, { error: 'unauthorized' })
        const token = await validAccessToken({ connection, store, client: kick })
        const existingIds = (connection.subscriptions ?? []).map((item) => item.subscription_id ?? item.id).filter(Boolean)
        if (existingIds.length) await kick.unsubscribe(token, existingIds)
        const subscriptions = await kick.subscribe(token, KICK_EVENT_TYPES)
        const updated = await store.updateConnection(connection.id, { subscriptions, webhookError: null, lastSyncAt: new Date().toISOString() })
        return sendJson(response, 200, publicStatus(store, updated, config))
      }

      if (request.method === 'POST' && url.pathname === '/api/integrations/kick/disconnect') {
        const connection = await managedConnection(request); if (!connection) return sendJson(response, 401, { error: 'unauthorized' })
        try { const token = await validAccessToken({ connection, store, client: kick }); if (connection.subscriptions?.length) await kick.unsubscribe(token, connection.subscriptions.map((item) => item.subscription_id ?? item.id).filter(Boolean)); await kick.revoke(token) } catch { /* Local disconnect still clears stored credentials. */ }
        await store.disconnect(connection.id)
        return sendJson(response, 200, { state: 'DISCONNECTED' })
      }

      if (request.method === 'POST' && url.pathname === '/api/integrations/test-event') {
        const connection = await managedConnection(request); if (!connection) return sendJson(response, 401, { error: 'unauthorized' })
        const body = JSON.parse((await readBody(request)).toString('utf8') || '{}')
        const type = ['chat.message.sent', 'channel.followed', 'channel.subscription.new', 'kicks.gifted'].includes(body.type) ? body.type : 'channel.followed'
        const samplePerson = { user_id: 0, username: 'TEST EVENT', profile_picture: null, channel_slug: 'local-test', is_verified: false, identity: { username_color: '#d8ad55', badges: [{ type: 'test', text: 'TEST' }] } }
        const payload = type === 'chat.message.sent' ? { message_id: randomToken(8), content: body.message || 'پیام آزمایشی — رویداد واقعی Kick نیست', created_at: new Date().toISOString(), sender: samplePerson, broadcaster: { user_id: connection.account.userId } } : type === 'channel.followed' ? { follower: samplePerson, broadcaster: { user_id: connection.account.userId } } : type === 'channel.subscription.new' ? { subscriber: samplePerson, broadcaster: { user_id: connection.account.userId }, duration: 1, created_at: new Date().toISOString() } : { sender: samplePerson, broadcaster: { user_id: connection.account.userId }, gift: { amount: 1, name: 'TEST KICK', type: 'TEST', tier: 'TEST', message: 'Local test only' }, created_at: new Date().toISOString() }
        const event = normalizeKickEvent({ id: `test_${randomToken(8)}`, type, payload, test: true })
        ;(await store.runtimeKeysForConnection(connection.id)).forEach((runtimeKey) => bus.publish(runtimeKey, event))
        return sendJson(response, 200, { delivered: true, test: true, event })
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/runtime/') && url.pathname.endsWith('/state')) {
        const runtimeKey = url.pathname.split('/')[3]
        const connection = await store.findByRuntimeKey(runtimeKey)
        if (!connection) return sendJson(response, 404, { error: 'runtime_not_found' })
        return sendJson(response, 200, { connected: connection.connected, viewer: connection.viewer, latestFollower: connection.lastFollower ?? null, sessionFollowerCount: connection.sessionFollowerCount ?? 0, channel: connection.channel, lastEventAt: connection.lastEventAt ?? null })
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/runtime/') && url.pathname.endsWith('/events')) {
        const runtimeKey = url.pathname.split('/')[3]
        const connection = await store.findByRuntimeKey(runtimeKey)
        if (!connection) return sendJson(response, 404, { error: 'runtime_not_found' })
        if (!connection.connected) return sendJson(response, 409, { error: 'integration_disconnected' })
        response.writeHead(200, { ...cors, 'content-type': 'text/event-stream', connection: 'keep-alive', 'x-accel-buffering': 'no', 'cache-control': 'no-cache, no-transform' })
        const write = (event) => { response.write(`id: ${event.id}\nevent: overlay-event\ndata: ${JSON.stringify(event)}\n\n`) }
        write({ id: randomToken(8), type: 'runtime.connected', receivedAt: new Date().toISOString(), test: false, data: { connected: connection.connected } })
        const unsubscribe = bus.subscribe(runtimeKey, write)
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20_000)
        request.on('close', () => { clearInterval(heartbeat); unsubscribe() })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/webhooks/kick') {
        const result = await processor.process(request.headers, await readBody(request))
        response.writeHead(result.status); return response.end()
      }

      return sendJson(response, 404, { error: 'not_found' })
    } catch (error) {
      const status = error.status || 500
      const message = status >= 500 ? 'Internal integration service error' : error.message
      if (config.nodeEnv !== 'test') console.error('[integration-api]', { status, name: error.name, message: error.message })
      return sendJson(response, status, { error: message })
    }
  }

  const server = createServer(handler)
  const pollTimer = setInterval(() => void pollViewerCounts(), config.viewerPollMs); pollTimer.unref()
  return { server, handler, store, bus, kick, processor, pollViewerCounts, close: () => { clearInterval(pollTimer); return new Promise((resolve) => server.close(resolve)) } }
}
