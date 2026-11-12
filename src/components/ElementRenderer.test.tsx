import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from '../lib/elements'
import { ElementRenderer } from './ElementRenderer'
import type { OverlayElement } from '../types'
import { LiveDataContext } from './LiveDataProvider'

afterEach(cleanup)

describe('widget preview boundaries', () => {
  it('labels sample chat in the editor and does not publish sample messages', () => {
    const chat = createElement('chat')
    const editor = render(<ElementRenderer element={chat} />)
    expect(screen.getByText(/SAMPLE ONLY/)).toBeTruthy()
    expect(screen.getByText(/قاب جدید/)).toBeTruthy()
    editor.unmount()

    const runtime = render(<ElementRenderer element={chat} runtime />)
    expect(runtime.queryByText(/قاب جدید/)).toBeNull()
    expect(runtime.container.textContent).toBe('')
  })

  it('does not render unconnected alerts in output', () => {
    const alert = createElement('alert')
    const { container } = render(<ElementRenderer element={alert} runtime />)
    expect(container.textContent).toBe('')
  })

  it('does not render preview donation totals unless explicitly enabled', () => {
    const goal = createElement('goal')
    const hidden = render(<ElementRenderer element={goal} runtime />)
    expect(hidden.container.textContent).toBe('')
    hidden.unmount()
    goal.props.includePreviewOutput = true
    render(<ElementRenderer element={goal} runtime />)
    expect(screen.getByText(/هدف حمایت/)).toBeTruthy()
  })

  it('renders Persian text with an explicit RTL direction', () => {
    const text = createElement('text')
    text.props.text = 'شروع پخش زنده'
    text.props.direction = 'rtl'
    render(<ElementRenderer element={text} />)
    const content = screen.getByText('شروع پخش زنده')
    expect(content.getAttribute('dir')).toBe('rtl')
  })
})

describe('chat metadata contract', () => {
  const message = {
    id: 'm1', username: 'arystal', content: 'سلام', avatar: null,
    usernameColor: '#f1d89a', createdAt: new Date().toISOString(), test: false,
    badges: [{ type: 'subscriber', text: 'SUB', count: 3 }],
  }
  const state = (overrides: Record<string, unknown> = {}) => ({
    state: 'connected' as const, messages: [message], viewer: { status: 'live' as const, count: 12, updatedAt: null },
    latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null, ...overrides,
  })

  it('renders the sender timestamp only when enabled', () => {
    const chat = createElement('chat')
    chat.props.showTimestamps = true
    const on = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(on.container.querySelector('.chat-time')?.textContent).toMatch(/^\d{2}:\d{2}$/)
    on.unmount()

    chat.props.showTimestamps = false
    const off = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(off.container.querySelector('.chat-time')).toBeNull()
  })

  it('renders Kick identity badges only when enabled', () => {
    const chat = createElement('chat')
    chat.props.showBadges = true
    const on = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(on.container.querySelector('.chat-badge')?.textContent).toBe('SUB ×3')
    on.unmount()

    chat.props.showBadges = false
    const off = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(off.container.querySelector('.chat-badge')).toBeNull()
  })

  it('switches the feed between bottom-pinned and top-stacked', () => {
    const chat = createElement('chat')
    chat.props.scrolling = true
    const pinned = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(pinned.container.querySelector('.chat-widget')?.className).toContain('chat-scroll')
    pinned.unmount()

    chat.props.scrolling = false
    const stacked = render(<LiveDataContext.Provider value={state()}><ElementRenderer element={chat} runtime /></LiveDataContext.Provider>)
    expect(stacked.container.querySelector('.chat-widget')?.className).toContain('chat-stack')
  })
})

describe('countdown target time', () => {
  it('counts to an absolute target so a reload does not restart it', () => {
    const countdown = createElement('countdown')
    countdown.props.targetAt = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 16)
    const { container } = render(<ElementRenderer element={countdown} runtime />)
    const text = container.querySelector('.countdown-widget strong')?.textContent ?? ''
    expect(text).toMatch(/^1:59:\d{2}$|^2:00:00$/)
  })

  it('shows a finished state once the target has passed', () => {
    const countdown = createElement('countdown')
    countdown.props.targetAt = new Date(Date.now() - 60_000).toISOString().slice(0, 16)
    const { container } = render(<ElementRenderer element={countdown} runtime />)
    expect(container.querySelector('.countdown-widget strong')?.textContent).toBe('00:00')
    expect(container.querySelector('.countdown-widget')?.className).toContain('countdown-done')
  })
})

describe('viewer metric honesty', () => {
  const renderViewer = (viewer: { status: 'live' | 'offline' | 'stale' | 'unavailable'; count: number | null; updatedAt: string | null }) => {
    const widget = createElement('viewerCount')
    return render(
      <LiveDataContext.Provider value={{ state: 'connected', messages: [], viewer, latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null }}>
        <ElementRenderer element={widget} runtime />
      </LiveDataContext.Provider>,
    ).container
  }

  it('shows the live count and marks it live', () => {
    const el = renderViewer({ status: 'live', count: 128, updatedAt: new Date().toISOString() })
    expect(el.querySelector('.live-metric strong')?.textContent).toBe('128')
    expect(el.querySelector('.live-metric em')?.textContent).toBe('LIVE')
  })

  it('keeps a stale count visible and labels it stale instead of offline', () => {
    const el = renderViewer({ status: 'stale', count: 42, updatedAt: new Date(Date.now() - 600_000).toISOString() })
    expect(el.querySelector('.live-metric strong')?.textContent).toBe('42')
    expect(el.querySelector('.live-metric em')?.textContent).toBe('CACHED · STALE')
    expect(el.querySelector('.live-metric')?.className).toContain('viewer-stale')
  })

  it('renders offline for an offline channel without inventing a number', () => {
    const el = renderViewer({ status: 'offline', count: null, updatedAt: null })
    expect(el.querySelector('.live-metric strong')?.textContent).toBe('آفلاین')
    expect(el.querySelector('.live-metric strong')?.textContent).not.toBe('0')
  })

  it('never turns an API failure into zero viewers', () => {
    const el = renderViewer({ status: 'unavailable', count: null, updatedAt: null })
    expect(el.querySelector('.live-metric strong')?.textContent).toBe('Unavailable')
    expect(el.querySelector('.live-metric em')?.textContent).toBe('KICK API UNREACHABLE')
  })

  it('says not connected, not unreachable, when no Kick connection is attached at all', () => {
    const el = render(
      <LiveDataContext.Provider value={{ state: 'disconnected', messages: [], viewer: { status: 'unavailable', count: null, updatedAt: null }, latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null, configured: false }}>
        <ElementRenderer element={createElement('viewerCount')} runtime />
      </LiveDataContext.Provider>,
    ).container
    expect(el.querySelector('.live-metric strong')?.textContent).toBe('Not connected')
    expect(el.querySelector('.live-metric em')?.textContent).toBe('KICK NOT CONNECTED')
  })
})

describe('element capability sweep', () => {
  const allTypes = ['text', 'image', 'shape', 'frame', 'webcam', 'capture', 'chat', 'alert', 'goal', 'counter', 'countdown', 'supporter', 'viewerCount', 'sessionFollowers', 'latestFollower'] as const

  it('renders every element type in the editor without throwing', () => {
    for (const type of allTypes) {
      const element = createElement(type)
      const { container, unmount } = render(<ElementRenderer element={element} />)
      // Shapes and frames are decorative and legitimately carry no text, so assert markup instead.
      expect(container.innerHTML.length, `${type} should render editor markup`).toBeGreaterThan(0)
      unmount()
    }
  })

  it('renders every element type at runtime without fabricated content', () => {
    for (const type of allTypes) {
      const element = createElement(type)
      const { container, unmount } = render(
        <LiveDataContext.Provider value={{ state: 'disconnected', messages: [], viewer: { status: 'unavailable', count: null, updatedAt: null }, latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null }}>
          <ElementRenderer element={element} runtime />
        </LiveDataContext.Provider>,
      )
      if (type === 'goal') expect(container.textContent).toBe('')
      unmount()
    }
  })

  it('excludes planning placeholders from the published output by default', () => {
    for (const type of ['webcam', 'capture'] as const) {
      const element = createElement(type)
      expect(element.includeInOutput, `${type} must not publish a placeholder that looks like capture`).toBe(false)
    }
  })
})

describe('production output carries no test data', () => {
  const liveState = (overrides: Partial<React.ContextType<typeof LiveDataContext>>) => ({
    state: 'connected' as const, messages: [], viewer: { status: 'live' as const, count: 5, updatedAt: 'now' },
    latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null, configured: true, testMode: false, ...overrides,
  })
  const withLive = (node: React.ReactNode, overrides: Parameters<typeof liveState>[0]) =>
    render(<LiveDataContext.Provider value={liveState(overrides) as never}>{node}</LiveDataContext.Provider>)

  it('hides the TEST marker on a synthetic chat line unless the source is in test mode', () => {
    const chat = createElement('chat')
    const message = { id: 'm1', username: 'TEST EVENT', content: 'TEST EVENT', avatar: null, usernameColor: null, badges: [], createdAt: new Date().toISOString(), test: true }
    const live = withLive(<ElementRenderer element={chat} runtime />, { messages: [message] })
    expect(live.queryByText('TEST')).toBeNull()
    live.unmount()
    const testMode = withLive(<ElementRenderer element={chat} runtime />, { messages: [message], testMode: true })
    expect(testMode.getByText('TEST')).toBeTruthy()
  })

  it('never renders a synthetic alert on a live source', () => {
    const alert = createElement('alert')
    const synthetic = { id: 'a1', type: 'channel.followed', receivedAt: new Date().toISOString(), test: true, data: { follower: { username: 'TEST EVENT' } } }
    // CP25: the alert element is a queue stage now. A test frame is not data and the provider drops it outside
    // test mode, so the live surface stays empty rather than showing a name nobody followed with.
    const live = withLive(<ElementRenderer element={alert} runtime />, { alerts: [synthetic] })
    expect(live.container.querySelector('.alert-stage')).toBeNull()
    expect(live.container.textContent).not.toMatch(/TEST EVENT/)
  })

  // The queue replaced the old 20-item history cursor. A burst must still play, one at a time, and the same
  // delivery must never be shown twice however often it is re-read from the stream.
  it('keeps a queued alert on screen while a burst arrives, without repeating a delivery', async () => {
    const alert = createElement('alert')
    const make = (index: number) => ({ id: `a${index}`, type: 'channel.followed', receivedAt: new Date().toISOString(), test: false, data: { follower: { username: `follower${index}` } } })
    const first = make(0)
    const view = (alerts: ReturnType<typeof make>[]) => (
      <LiveDataContext.Provider value={liveState({ alerts }) as never}><ElementRenderer element={alert} runtime /></LiveDataContext.Provider>
    )
    const rendered = render(view([first]))
    // The engine starts on its own timer, so the first frame is awaited rather than assumed.
    await waitFor(() => expect(rendered.container.querySelector('.alert-stage')).toBeTruthy())
    const shown = rendered.container.querySelector('.alert-stage')?.getAttribute('data-alert-id')
    // Twenty-six more deliveries, each re-delivered twice, the way a reconnecting stream repeats its tail.
    for (let index = 1; index < 26; index += 1) {
      rendered.rerender(view([first, make(index), make(index)]))
    }
    expect(rendered.container.querySelectorAll('.alert-stage').length).toBe(1)
    expect(rendered.container.querySelector('.alert-stage')?.getAttribute('data-alert-id')).toBe(shown)
  })

  it('does not publish a placeholder box for an image with no source', () => {
    const image = createElement('image')
    const runtime = render(<ElementRenderer element={image} runtime />)
    expect(runtime.container.textContent).toBe('')
    expect(runtime.container.querySelector('img')).toBeNull()
    runtime.unmount()
    const editor = render(<ElementRenderer element={image} />)
    expect(editor.getByText(/Upload an image/)).toBeTruthy()
  })

  it('publishes capture placeholders as transparent frames so they cannot cover a real OBS source', () => {
    for (const type of ['webcam', 'capture'] as const) {
      const element = createElement(type)
      const { container, unmount } = render(<ElementRenderer element={element} runtime />)
      const box = container.querySelector('.placeholder-element') as HTMLElement
      expect(box.style.background).toBe('transparent')
      expect(container.textContent).toBe('')
      unmount()
    }
  })
})

describe('preview mode shows design, never fake data or TEST labels', () => {
  it('never prints TEST text in the editor or the preview for a follower widget', () => {
    const element = createElement('latestFollower')
    const editor = render(<ElementRenderer element={element} />)
    expect(editor.container.textContent).not.toMatch(/TEST/)
    editor.unmount()

    const preview = render(<ElementRenderer element={element} preview />)
    expect(preview.container.textContent).not.toMatch(/TEST/)
    expect(preview.container.textContent).toContain(String(element.props.emptyText))
  })

  it('previews the alert template and says that no event has arrived', () => {
    const alert = createElement('alert')
    const { container } = render(<ElementRenderer element={alert} preview />)
    // The template's own copy is shown, and the caption is explicit that this is design state, not an event.
    expect(container.textContent).toContain('PREVIEW · NO EVENT HAS ARRIVED')
    expect(container.querySelector('.alert-stage')).toBeTruthy()
    expect(container.textContent).not.toMatch(/TEST EVENT/)
  })

  it('shows the chat frame in preview without inventing messages', () => {
    const chat = createElement('chat')
    const { container } = render(<ElementRenderer element={chat} preview />)
    expect(container.textContent).not.toMatch(/TEST|SAMPLE ONLY|قاب جدید/)
    expect(container.textContent).toContain('Chat messages appear here')
  })

  it('keeps the capture guide out of output but visible in preview', () => {
    const capture = createElement('capture')
    const output = render(<ElementRenderer element={capture} runtime />)
    expect(output.container.textContent).toBe('')
    output.unmount()

    const preview = render(<ElementRenderer element={capture} preview />)
    expect(preview.container.textContent).toContain('capture your game window in OBS')
  })

  it('shows the webcam frame in preview and never its instructions in output', () => {
    const webcam = createElement('webcam')
    const preview = render(<ElementRenderer element={webcam} preview />)
    expect(preview.container.textContent).toContain('align your OBS camera here')
    preview.unmount()

    const output = render(<ElementRenderer element={webcam} runtime />)
    expect(output.container.textContent).toBe('')
  })

  it('does not claim a live API reading in the editor', () => {
    const viewer = createElement('viewerCount')
    const { container } = render(<ElementRenderer element={viewer} preview />)
    expect(container.textContent).toContain('LIVE WHEN CONNECTED')
    expect(container.textContent).not.toContain('LIVE API PREVIEW')
  })
})

describe('decoration toggling', () => {
  /**
   * CP33 regression: DecoratedWidget called useLiveData() after two early returns, and the value was never read.
   * Toggling decoration off and on changed the number of hooks between renders, which React reports as
   * "Rendered more hooks than during the previous render" and which blanks the element. The hook is gone, so the
   * toggle must be a plain re-render.
   */
  it('survives decoration being switched off and on without a hook-order error', () => {
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { errors.push(args[0]) }

    const base = createElement('text')
    const element = { ...base, props: { ...base.props, text: 'Frame test' } }
    const active: OverlayElement = { ...element, decoration: { ...element.decoration, enabled: true, pattern: 'girih', cornerOrnaments: true } }
    const plain: OverlayElement = { ...element, decoration: { ...element.decoration, enabled: false } }

    const view = render(<ElementRenderer element={active} />)
    const first = view.container.innerHTML
    expect(first).toContain('decorated-widget')

    view.rerender(<ElementRenderer element={plain} />)
    const second = view.container.innerHTML
    expect(second).not.toContain('decorated-widget')
    expect(second).toContain('Frame test')

    view.rerender(<ElementRenderer element={active} />)
    expect(view.container.innerHTML).toBe(first)
    console.error = original

    expect(errors).toEqual([])
  })
})
