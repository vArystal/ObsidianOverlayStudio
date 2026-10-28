import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearExchangeFromUrl, clearIntegrationSession, getBackendUrl, getIntegrationSession, getPublicIntegrationConfig, integrationRequest, readExchangeCode, saveIntegrationSession, setBackendUrl } from './integration'

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

describe('browser integration boundary', () => {
  it('keeps opaque management session in tab storage and returns token-free runtime config', () => {
    setBackendUrl('https://api.example/')
    saveIntegrationSession({ managementToken: 'opaque-management', connectionId: 'connection', runtimeKey: 'runtime-key', channelName: 'channel' })
    expect(getBackendUrl()).toBe('https://api.example')
    expect(getIntegrationSession()?.managementToken).toBe('opaque-management')
    expect(localStorage.getItem('obsidian-integration-session-v1')).toBeNull()
    expect(JSON.stringify(getPublicIntegrationConfig())).not.toContain('opaque-management')
    expect(getPublicIntegrationConfig()?.runtimeKey).toBe('runtime-key')
    clearIntegrationSession()
    expect(getIntegrationSession()).toBeNull()
  })

  it('sends management bearer only for authenticated API requests', async () => {
    setBackendUrl('https://api.example')
    saveIntegrationSession({ managementToken: 'opaque-management', connectionId: 'connection', runtimeKey: 'runtime-key', channelName: 'channel' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await integrationRequest('/api/integrations/kick')
    await integrationRequest('/api/setup', {}, false)
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer opaque-management')
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBeUndefined()
  })

  it('surfaces backend failures without fabricating a connected state', async () => {
    setBackendUrl('https://api.example')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'setup_required' }) }))
    await expect(integrationRequest('/api/setup', {}, false)).rejects.toThrow('setup_required')
  })
})

describe('reading the OAuth exchange code', () => {
  it('finds a code the hash router can see', () => {
    expect(readExchangeCode('/integrations?exchange=abc', '#/integrations?exchange=abc', '')).toBe('abc')
  })

  it('still finds one that a redirect left outside the hash', () => {
    expect(readExchangeCode('', '#/integrations', '?exchange=outside')).toBe('outside')
  })

  it('finds a raw code appended straight to the hash', () => {
    expect(readExchangeCode('', '#/integrations?x=1&exchange=hashonly', '')).toBe('hashonly')
  })

  it('returns null when the callback carried no code', () => {
    expect(readExchangeCode('', '#/integrations', '')).toBeNull()
  })

  it('clears a redeemed code from the address bar without touching the route', () => {
    window.history.replaceState({}, '', '/jubilant-octo-lamp/?exchange=spent#/integrations')
    clearExchangeFromUrl()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/integrations')
  })
})
