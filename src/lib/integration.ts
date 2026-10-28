import type { LiveIntegrationConfig } from '../types'

const BACKEND_KEY = 'obsidian-integration-backend-v1'
const SESSION_KEY = 'obsidian-integration-session-v1'
const DEFAULT_BACKEND = (import.meta.env.VITE_INTEGRATION_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export interface IntegrationSession {
  managementToken: string
  connectionId: string
  runtimeKey: string
  channelName: string
}

export function getBackendUrl() { return localStorage.getItem(BACKEND_KEY) || DEFAULT_BACKEND }
export function setBackendUrl(url: string) { localStorage.setItem(BACKEND_KEY, url.replace(/\/$/, '')) }
export function getIntegrationSession(): IntegrationSession | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
export function saveIntegrationSession(value: IntegrationSession) {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
}
export function clearIntegrationSession() {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}
export function getPublicIntegrationConfig(): LiveIntegrationConfig | null {
  const session = getIntegrationSession()
  return session ? { backendUrl: getBackendUrl(), runtimeKey: session.runtimeKey, connectionId: session.connectionId, channelName: session.channelName } : null
}

export async function integrationRequest<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const session = getIntegrationSession()
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(authenticated && session ? { authorization: `Bearer ${session.managementToken}` } : {}), ...options.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Integration service returned ${response.status}`)
  return body as T
}

/**
 * The OAuth callback hands back a one-time exchange code. Depending on who built the redirect it
 * can sit in the router's hash query, the hash itself, or the browser query, so accept all three
 * instead of trusting one placement.
 */
export function readExchangeCode(routerSearch: string, rawHash: string, rawSearch: string): string | null {
  const fromRouter = new URLSearchParams(routerSearch).get('exchange')
  if (fromRouter) return fromRouter
  const cut = rawHash.indexOf('?')
  if (cut !== -1) {
    const fromHash = new URLSearchParams(rawHash.slice(cut + 1)).get('exchange')
    if (fromHash) return fromHash
  }
  return new URLSearchParams(rawSearch).get('exchange')
}

/** Drop a redeemed code from the address bar so a refresh cannot replay it. */
export function clearExchangeFromUrl() {
  const { pathname, hash, search } = window.location
  if (!search.includes('exchange=')) return
  window.history.replaceState({}, '', `${pathname}${hash}`)
}

export function startKickOAuth() {
  // Keep the full mount path (project pages live under /<repo>/) and drop any stale query,
  // otherwise the OAuth round-trip lands on the Pages root, which is a 404.
  const here = new URL(window.location.href)
  here.search = ''
  const returnTo = here.toString()
  window.location.assign(`${getBackendUrl()}/api/auth/kick/start?return_to=${encodeURIComponent(returnTo)}`)
}
