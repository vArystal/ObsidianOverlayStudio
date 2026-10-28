import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Integrations } from './Integrations'

vi.mock('../components/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div> }))

const session = vi.hoisted(() => ({ current: { managementToken: 't', connectionId: 'c', runtimeKey: 'r', channelName: 'arystal' } }))
vi.mock('../lib/integration', () => ({
  clearExchangeFromUrl: vi.fn(),
  clearIntegrationSession: vi.fn(),
  getBackendUrl: () => 'https://backend.example',
  getIntegrationSession: () => session.current,
  integrationRequest: vi.fn(),
  readExchangeCode: () => null,
  saveIntegrationSession: vi.fn(),
  setBackendUrl: vi.fn(),
  startKickOAuth: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }))
import { waitFor } from '@testing-library/react'
import * as integration from '../lib/integration'

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

async function renderWith(eventCounts: Record<string, number>) {
  vi.mocked(integration.integrationRequest).mockResolvedValue(statusWith(eventCounts) as never)
  return render(<Integrations />)
}

describe('signed event receipts', () => {
  it('shows per-type counts once a signed delivery has been verified', async () => {
    const { container } = await renderWith({ 'channel.followed': 2, 'chat.message.sent': 5 })
    await waitFor(() => expect(container.querySelector('.receipt-chips')).not.toBeNull())
    const chips = Array.from(container.querySelectorAll('.receipt-chip')).map((chip) => chip.textContent)
    expect(chips).toEqual(['2channel.followed', '5chat.message.sent'])
    expect(container.querySelector('.integration-note')?.textContent).toContain('7 signed events have been verified')
    expect(container.querySelector('.receipts-empty')).toBeNull()
  })

  it('says plainly that nothing has arrived, names the action, and excludes test-button events', async () => {
    const { container } = await renderWith({})
    await waitFor(() => expect(container.querySelector('.receipts-empty')).not.toBeNull())
    const text = container.querySelector('.receipts-empty')?.textContent || ''
    expect(text).toContain('No signed event has ever reached this server')
    expect(text).toContain('kick.com/arystal')
    expect(text).toContain('Test-button events do not count')
    expect(container.querySelector('.receipt-chips')).toBeNull()
  })
})
