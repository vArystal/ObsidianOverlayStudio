import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveDataProvider, useLiveData } from './LiveDataProvider'

class EventSourceMock {
  static latest: EventSourceMock | undefined
  static CLOSED = 2
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, (message: MessageEvent) => void>()
  closed = false
  constructor(public url: string) { EventSourceMock.latest = this }
  addEventListener(name: string, listener: EventListenerOrEventListenerObject) { this.listeners.set(name, listener as (message: MessageEvent) => void) }
  emit(event: unknown) { this.listeners.get('overlay-event')?.({ data: JSON.stringify(event) } as MessageEvent) }
  close() { this.closed = true }
}

function Probe() {
  const live = useLiveData()
  return <pre data-testid="state">{JSON.stringify(live)}</pre>
}

beforeEach(() => {
  vi.stubGlobal('EventSource', EventSourceMock)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: true, viewer: { status: 'offline', count: 0, updatedAt: 'now' }, latestFollower: null, sessionFollowerCount: 2, lastEventAt: null }) }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('live runtime transport', () => {
  it('bootstraps honest metrics, normalizes SSE events, and deduplicates retries', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example/', runtimeKey: 'runtime', connectionId: 'connection', channelName: 'channel' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('"status":"offline"'))
    expect(EventSourceMock.latest!.url).toBe('https://api.example/api/runtime/runtime/events')
    act(() => EventSourceMock.latest!.onopen?.())
    const chat = { id: 'event-1', type: 'chat.message.sent', receivedAt: '2026-10-28T00:00:00Z', test: true, data: { messageId: 'message-1', content: 'TEST', sender: { username: 'fixture', badges: [{ type: 'test', text: 'TEST' }] } } }
    act(() => { EventSourceMock.latest!.emit(chat); EventSourceMock.latest!.emit(chat) })
    await waitFor(() => expect(JSON.parse(screen.getByTestId('state').textContent || '{}').messages).toHaveLength(1))
    const state = JSON.parse(screen.getByTestId('state').textContent || '{}')
    expect(state.state).toBe('connected')
    expect(state.messages[0]).toMatchObject({ content: 'TEST', test: true })
  })

  it('reports reconnecting/error rather than retaining a false connected label', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'connection', channelName: 'channel' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest).toBeTruthy())
    act(() => { EventSourceMock.latest!.readyState = 1; EventSourceMock.latest!.onerror?.() })
    expect(screen.getByTestId('state').textContent).toContain('"state":"reconnecting"')
    act(() => { EventSourceMock.latest!.readyState = EventSourceMock.CLOSED; EventSourceMock.latest!.onerror?.() })
    expect(screen.getByTestId('state').textContent).toContain('"state":"error"')
  })

  it('supports the same-origin /api development proxy without browser localhost calls', async () => {
    render(<LiveDataProvider config={{ backendUrl: '', runtimeKey: 'runtime', connectionId: 'connection', channelName: 'channel' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest?.url).toBe('/api/runtime/runtime/events'))
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/runtime/runtime/state')
  })

  it('stays disconnected and does not open EventSource without runtime configuration', () => {
    EventSourceMock.latest = undefined
    render(<LiveDataProvider config={null}><Probe /></LiveDataProvider>)
    expect(screen.getByTestId('state').textContent).toContain('"state":"disconnected"')
    expect(EventSourceMock.latest).toBeUndefined()
  })
})

describe('long-run stability for an all-day OBS source', () => {
  const chatEvent = (n: number) => ({
    id: `evt_${n}`, type: 'chat.message.sent', receivedAt: new Date().toISOString(),
    data: { messageId: `msg_${n}`, content: `message ${n}`, createdAt: new Date().toISOString(), sender: { username: `user${n}`, badges: [] } },
  })
  const read = () => JSON.parse(screen.getByTestId('state').textContent || '{}')

  it('keeps the newest 50 chat messages so an overnight stream cannot grow without bound', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'c', channelName: 'ch' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest).toBeTruthy())
    await act(async () => {
      for (let i = 0; i < 60; i += 1) EventSourceMock.latest!.emit(chatEvent(i))
    })
    const state = read()
    expect(state.messages).toHaveLength(50)
    expect(state.messages[49].content).toBe('message 59')
    expect(state.messages[0].content).toBe('message 10')
  })

  it('ignores a redelivered message instead of showing it twice', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'c', channelName: 'ch' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest).toBeTruthy())
    await act(async () => {
      EventSourceMock.latest!.emit(chatEvent(1))
      EventSourceMock.latest!.emit(chatEvent(1))
    })
    expect(read().messages).toHaveLength(1)
  })

  it('caps queued alerts as well', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'c', channelName: 'ch' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest).toBeTruthy())
    await act(async () => {
      for (let i = 0; i < 25; i += 1) {
        EventSourceMock.latest!.emit({ id: `follow_${i}`, type: 'channel.followed', receivedAt: new Date().toISOString(), data: { follower: { username: `f${i}` } } })
      }
    })
    expect(read().alerts).toHaveLength(20)
  })

  it('reports a dropped stream as reconnecting and a closed one as an error', async () => {
    render(<LiveDataProvider config={{ backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'c', channelName: 'ch' }}><Probe /></LiveDataProvider>)
    await waitFor(() => expect(EventSourceMock.latest).toBeTruthy())
    await act(async () => {
      EventSourceMock.latest!.emit({ ...chatEvent(1) })
    })
    expect(read().state).toBe('connected')
    await act(async () => {
      EventSourceMock.latest!.readyState = 0
      EventSourceMock.latest!.onerror?.()
    })
    expect(read().state).toBe('reconnecting')
    await act(async () => {
      EventSourceMock.latest!.readyState = 2
      EventSourceMock.latest!.onerror?.()
    })
    expect(read().state).toBe('error')
  })
})
