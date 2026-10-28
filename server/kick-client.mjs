const ID_BASE = 'https://id.kick.com'
const API_BASE = 'https://api.kick.com'

export class KickApiError extends Error {
  constructor(message, status, details = null) { super(message); this.name = 'KickApiError'; this.status = status; this.details = details }
}

export function createKickClient({ clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  async function request(url, options = {}) {
    const response = await fetchImpl(url, options)
    const type = response.headers?.get?.('content-type') || ''
    const body = type.includes('json') ? await response.json() : await response.text()
    if (!response.ok) throw new KickApiError(`Kick API request failed (${response.status})`, response.status, typeof body === 'string' ? body.slice(0, 300) : body)
    return body
  }

  const tokenRequest = (params) => request(`${ID_BASE}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
  })
  const authorized = (path, token, options = {}) => request(`${API_BASE}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  })

  return {
    authorizationUrl({ state, challenge, scopes }) {
      const url = new URL(`${ID_BASE}/oauth/authorize`)
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state }).toString()
      return url.toString()
    },
    exchangeCode(code, verifier) { return tokenRequest({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: verifier, code }) },
    refresh(refreshToken) { return tokenRequest({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }) },
    revoke(token) { return request(`${ID_BASE}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_hint_type: 'access_token' }) }) },
    getCurrentUser(token) { return authorized('/public/v1/users', token).then((body) => body.data?.[0] ?? body.data ?? null) },
    getCurrentChannel(token) { return authorized('/public/v1/channels', token).then((body) => body.data?.[0] ?? null) },
    getSubscriptions(token, broadcasterId) { return authorized(`/public/v1/events/subscriptions?${new URLSearchParams({ broadcaster_user_id: String(broadcasterId) })}`, token).then((body) => body.data ?? []) },
    subscribe(token, events) { return authorized('/public/v1/events/subscriptions', token, { method: 'POST', body: JSON.stringify({ method: 'webhook', events: events.map((name) => ({ name, version: 1 })) }) }).then((body) => body.data ?? []) },
    unsubscribe(token, ids) {
      const query = new URLSearchParams(); ids.forEach((id) => query.append('id', id))
      return authorized(`/public/v1/events/subscriptions?${query}`, token, { method: 'DELETE' })
    },
    getLivestream(token, userId) {
      const query = new URLSearchParams(); query.append('user_id', String(userId))
      return authorized(`/public/v1/users/livestreams?${query}`, token).then((body) => body.data?.[0] ?? null)
    },
    getPublicKey() { return request(`${API_BASE}/public/v1/public-key`).then((body) => body.data?.public_key ?? body.public_key) },
  }
}

export async function validAccessToken({ connection, store, client, now = Date.now() }) {
  const tokens = await store.getTokens(connection.id)
  if (!tokens) throw new KickApiError('Kick connection has no stored token', 401)
  if (!tokens.expiresAt || tokens.expiresAt > now + 60_000) return tokens.access_token
  const refreshed = await client.refresh(tokens.refresh_token)
  const next = { ...refreshed, expiresAt: now + Number(refreshed.expires_in || 3600) * 1000 }
  await store.setTokens(connection.id, next)
  return next.access_token
}
