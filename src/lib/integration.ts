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

export function startKickOAuth() {
  const returnTo = `${window.location.origin}${window.location.pathname}#/integrations`
  window.location.assign(`${getBackendUrl()}/api/auth/kick/start?return_to=${encodeURIComponent(returnTo)}`)
}
