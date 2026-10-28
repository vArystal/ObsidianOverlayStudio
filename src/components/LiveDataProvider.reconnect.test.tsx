import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveDataProvider, useLiveData } from './LiveDataProvider'

// Self-repair of the live event stream. An OBS browser source runs for hours unattended, so these cover
// the two ways it used to die silently: a fatal close (EventSource never retries those) and a channel
// that stays open while delivering nothing.
class StreamMock {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static instances: StreamMock[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, (message: MessageEvent) => void>()
  closed = false
  constructor(public url: string) { StreamMock.instances.push(this) }
  addEventListener(name: string, listener: EventListenerOrEventListenerObject) { this.listeners.set(name, listener as (message: MessageEvent) => void) }
  emit(event: unknown) { this.listeners.get('overlay-event')?.({ data: JSON.stringify(event) } as MessageEvent) }
  close() { this.closed = true; this.readyState = StreamMock.CLOSED }
  open() { this.readyState = StreamMock.OPEN; this.onopen?.() }
  failTransient() { this.readyState = StreamMock.OPEN; this.onerror?.() }
  failFatal() { this.readyState = StreamMock.CLOSED; this.onerror?.() }
  static get latest() { return StreamMock.instances[StreamMock.instances.length - 1] }
}

function Probe() {
  const live = useLiveData()
  return <pre data-testid="state">{JSON.stringify({ state: live.state, messages: live.messages.length })}</pre>
}
const read = () => JSON.parse(document.querySelector('[data-testid="state"]')!.textContent || '{}')
const config = { backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'c', channelName: 'ch' }

beforeEach(() => {
  vi.useFakeTimers()
  StreamMock.instances = []
  vi.stubGlobal('EventSource', StreamMock)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewer: { status: 'offline', count: null, updatedAt: null }, sessionFollowerCount: 0 }) }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('live stream self-repair', () => {
  it('reconnects after a fatal close instead of leaving a dead overlay', async () => {
    render(<LiveDataProvider config={config}><Probe /></LiveDataProvider>)
    expect(StreamMock.instances).toHaveLength(1)
    act(() => StreamMock.latest.open())
    expect(read().state).toBe('connected')

    act(() => StreamMock.latest.failFatal())
    expect(read().state).toBe('reconnecting')

    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(StreamMock.instances).toHaveLength(2)
    expect(StreamMock.latest.url).toContain('/api/runtime/runtime/events')

    act(() => StreamMock.latest.open())
    expect(read().state).toBe('connected')
  })

  it('backs off on repeated failures so a restarting backend is not hammered', async () => {
    render(<LiveDataProvider config={config}><Probe /></LiveDataProvider>)
    expect(StreamMock.instances).toHaveLength(1)
    act(() => StreamMock.latest.open())
    act(() => StreamMock.latest.failFatal())
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(StreamMock.instances).toHaveLength(2)

    act(() => StreamMock.latest.failFatal())
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(StreamMock.instances, 'second attempt waits 2s, not 1s').toHaveLength(2)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(StreamMock.instances).toHaveLength(3)
  })

  it('keeps retrying but admits an error once five attempts have failed', async () => {
    render(<LiveDataProvider config={config}><Probe /></LiveDataProvider>)
    expect(StreamMock.instances).toHaveLength(1)
    act(() => StreamMock.latest.open())
    act(() => StreamMock.latest.failFatal())
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await act(async () => { vi.advanceTimersByTime(30_000) })
      act(() => StreamMock.latest.failFatal())
    }
    expect(read().state).toBe('error')
    // Even in the error state the next attempt is scheduled: a source that is already broken can still
    // recover on its own, and a streamer should not have to reload the page to find out.
    const attempts = StreamMock.instances.length
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(StreamMock.instances.length).toBe(attempts + 1)
  })

  it('treats a silent channel as dead once nothing arrives for 150s', async () => {
    render(<LiveDataProvider config={config}><Probe /></LiveDataProvider>)
    expect(StreamMock.instances).toHaveLength(1)
    act(() => StreamMock.latest.open())
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(StreamMock.instances).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(90_000) })
    expect(StreamMock.instances.length).toBeGreaterThanOrEqual(2)
    expect(read().state).toBe('reconnecting')
  })

  it('does not reconnect after unmount', async () => {
    const view = render(<LiveDataProvider config={config}><Probe /></LiveDataProvider>)
    expect(StreamMock.instances).toHaveLength(1)
    act(() => StreamMock.latest.open())
    view.unmount()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(StreamMock.instances).toHaveLength(1)
  })
})
