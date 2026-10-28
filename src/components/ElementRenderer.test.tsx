import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from '../lib/elements'
import { ElementRenderer } from './ElementRenderer'
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
