import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import * as integration from '../lib/integration'
import { Integrations } from './Integrations'

vi.mock('../components/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div> }))

// Mutable module state: each test sets the backend origin and session it needs, because the page reads
// both through the mocked module rather than through props.
const env = vi.hoisted(() => ({
  backend: 'https://backend.example',
  session: { managementToken: 't', connectionId: 'c', runtimeKey: 'r', channelName: 'arystal' } as Record<string, string> | null,
}))

vi.mock('../lib/integration', () => ({
  clearExchangeFromUrl: vi.fn(),
  clearIntegrationSession: vi.fn(),
  getBackendUrl: () => env.backend,
  getIntegrationSession: () => env.session,
  integrationRequest: vi.fn(),
  isBackendConfigured: () => env.backend.length > 0,
  readExchangeCode: () => null,
  saveIntegrationSession: vi.fn(),
  setBackendUrl: vi.fn(),
  startKickOAuth: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }))

const statusWith = (eventCounts: Record<string, number>) => ({
  state: 'CONNECTED',
  connection: {
    account: { username: 'Arystal' },
    channel: { slug: 'arystal' },
    eventCounts,
    viewer: { status: 'offline', count: null, updatedAt: null },
    scopes: [],
  },
  webhook: { state: 'ACTIVE', endpoint: 'https://backend.example/api/integrations/kick/webhook', subscriptions: [] },
})

beforeEach(() => {
  env.backend = 'https://backend.example'
  env.session = { managementToken: 't', connectionId: 'c', runtimeKey: 'r', channelName: 'arystal' }
  vi.mocked(integration.integrationRequest).mockReset()
})

describe('signed event receipts', () => {
  it('shows per-type counts once a signed delivery has been verified', async () => {
    vi.mocked(integration.integrationRequest).mockResolvedValue(statusWith({ 'channel.followed': 2, 'chat.message.sent': 5 }) as never)
    const { container } = render(<Integrations />)
    await waitFor(() => expect(container.querySelector('.receipt-chips')).not.toBeNull())
    const chips = Array.from(container.querySelectorAll('.receipt-chip')).map((chip) => chip.textContent)
    expect(chips).toEqual(['2channel.followed', '5chat.message.sent'])
    expect(container.querySelector('.integration-note')?.textContent).toContain('7 signed events have been verified')
    expect(container.querySelector('.receipts-empty')).toBeNull()
  })

  it('says plainly that nothing has arrived, names the action, and excludes test-button events', async () => {
    vi.mocked(integration.integrationRequest).mockResolvedValue(statusWith({}) as never)
    const { container } = render(<Integrations />)
    await waitFor(() => expect(container.querySelector('.receipts-empty')).not.toBeNull())
    const text = container.querySelector('.receipts-empty')?.textContent || ''
    expect(text).toContain('No signed event has ever reached this server')
    expect(text).toContain('kick.com/arystal')
    expect(text).toContain('Test-button events do not count')
    expect(container.querySelector('.receipt-chips')).toBeNull()
  })
})

describe('missing backend configuration', () => {
  it('does not fetch anything and explains what to do instead of showing ERROR', async () => {
    env.backend = ''
    env.session = null
    const { container } = render(<Integrations />)
    await waitFor(() => expect(container.querySelector('.status-pill')?.textContent).toBe('NOT_CONFIGURED'))
    expect(vi.mocked(integration.integrationRequest)).not.toHaveBeenCalled()
    expect(container.textContent).toContain('no integration server address')
    expect(container.querySelector('.error-banner')).toBeNull()
  })
})
