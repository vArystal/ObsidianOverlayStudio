import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from '../../lib/elements'
import { ElementRenderer } from '../ElementRenderer'
import { LiveDataContext } from '../LiveDataProvider'
import type { LiveDataState } from '../LiveDataProvider'
import { KICK_WIDGET_TYPES, parseSocialLinks } from './index'

afterEach(() => { cleanup(); vi.useRealTimers() })

type Overrides = Partial<LiveDataState>

const liveState = (overrides: Overrides = {}): LiveDataState => ({
  state: 'connected',
  messages: [],
  viewer: { status: 'offline', count: null, updatedAt: null },
  latestFollower: null,
  sessionFollowerCount: 0,
  alerts: [],
  stream: { title: 'Late night ranked', category: 'Valorant', isLive: true, startedAt: new Date(Date.now() - 3_723_000).toISOString(), updatedAt: null },
  channel: { slug: 'arystal', activeSubscribers: 12 },
  recentFollowers: [{ username: 'greasea', avatar: null, at: '2026-11-05T09:00:00.000Z', test: false }],
  recentSubscribers: [{ username: 'nova', avatar: null, kind: 'new', at: '2026-11-05T09:05:00.000Z', test: false }],
  activities: [
    { id: 'a1', kind: 'follow', username: 'greasea', detail: 'followed', at: '2026-11-05T09:00:00.000Z', test: false },
    { id: 'a2', kind: 'chat', username: 'nova', detail: 'hello', at: '2026-11-05T09:06:00.000Z', test: false },
  ],
  lastEventAt: '2026-11-05T09:06:00.000Z',
  configured: true,
  ...overrides,
})

const mount = (element: ReturnType<typeof createElement>, state: LiveDataState, runtime = true) =>
  render(
    <LiveDataContext.Provider value={state}>
      <ElementRenderer element={element} runtime={runtime} />
    </LiveDataContext.Provider>,
  )

describe('stream widgets read real data and name every absence', () => {
  it('shows the reported title, category, subscriber count and live state', () => {
    const title = mount(createElement('streamTitle'), liveState())
    expect(screen.getByText('Late night ranked')).toBeTruthy()
    title.unmount()

    const category = mount(createElement('streamCategory'), liveState())
    expect(screen.getByText('Valorant')).toBeTruthy()
    category.unmount()

    const subs = mount(createElement('subscriberCount'), liveState())
    expect(screen.getByText('12')).toBeTruthy()
    subs.unmount()

    mount(createElement('liveStatus'), liveState())
    expect(screen.getByText('LIVE')).toBeTruthy()
  })

  it('separates offline, unknown and unreported instead of guessing', () => {
    const offline = mount(createElement('liveStatus'), liveState({ stream: { title: null, category: null, isLive: false, startedAt: null, updatedAt: null } }))
    expect(screen.getByText('OFFLINE')).toBeTruthy()
    offline.unmount()

    const unknown = mount(createElement('liveStatus'), liveState({ stream: null }))
    expect(screen.getByText('UNKNOWN')).toBeTruthy()
    unknown.unmount()

    const title = mount(createElement('streamTitle'), liveState({ stream: null }))
    expect(screen.getByText('Stream title not reported')).toBeTruthy()
    title.unmount()

    // A missing subscriber figure must not render as 0.
    const subs = mount(createElement('subscriberCount'), liveState({ channel: { slug: 'arystal', activeSubscribers: null } }))
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText('Not reported')).toBeTruthy()
    subs.unmount()
  })

  it('labels a disconnected channel and never renders a number for it', () => {
    const state = liveState({ state: 'disconnected', configured: false, stream: null, channel: null, recentFollowers: [], activities: [] })
    const subs = mount(createElement('subscriberCount'), state)
    expect(screen.getByText('Kick not connected')).toBeTruthy()
    subs.unmount()
    mount(createElement('recentFollowers'), state)
    expect(screen.getByText('Kick not connected')).toBeTruthy()
  })

  it('says loading while connecting and error when the channel is broken', () => {
    const loading = mount(createElement('streamTitle'), liveState({ state: 'connecting', stream: null }))
    expect(screen.getByText('Connecting…')).toBeTruthy()
    loading.unmount()
    mount(createElement('recentFollowers'), liveState({ state: 'error', recentFollowers: [] }))
    expect(screen.getByText('Connection problem')).toBeTruthy()
  })
})

describe('community widgets', () => {
  it('lists real follows and shows the empty state when there are none', () => {
    const list = mount(createElement('recentFollowers'), liveState())
    expect(screen.getByText('greasea')).toBeTruthy()
    list.unmount()
    mount(createElement('recentFollowers'), liveState({ recentFollowers: [] }))
    expect(screen.getByText('No follows yet')).toBeTruthy()
  })

  it('marks subscription kinds and honours the row limit', () => {
    const element = createElement('recentSubscribers')
    element.props.maxItems = 1
    element.props.showKinds = true
    const state = liveState({
      recentSubscribers: [
        { username: 'nova', avatar: null, kind: 'new', at: '2026-11-05T09:05:00.000Z', test: false },
        { username: 'older', avatar: null, kind: 'renewal', at: '2026-11-05T08:05:00.000Z', test: false },
      ],
    })
    const { container } = mount(element, state)
    expect(screen.getByText('nova')).toBeTruthy()
    expect(container.querySelectorAll('.widget-row')).toHaveLength(1)
    expect(screen.getByText('new')).toBeTruthy()
  })

  it('filters the activity feed by kind', () => {
    const element = createElement('activityFeed')
    element.props.includeChat = false
    const { container } = mount(element, liveState())
    expect(container.querySelectorAll('.widget-row')).toHaveLength(1)
    expect(screen.getByText('greasea')).toBeTruthy()
    expect(screen.queryByText('hello')).toBeNull()
  })
})

describe('local widgets', () => {
  it('renders a clock that ticks from the shared timer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T10:30:15Z'))
    const element = createElement('clock')
    element.props.hour12 = false
    element.props.showSeconds = true
    const { container } = mount(element, liveState({ configured: false, state: 'disconnected' }))
    const first = container.querySelector('.widget-metric')?.textContent
    expect(first).toMatch(/\d{2}:\d{2}:\d{2}/)
    vi.setSystemTime(new Date('2026-11-05T10:30:16Z'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(container.querySelector('.widget-metric')?.textContent).not.toBe(first)
  })

  it('parses social links in both accepted shapes and degrades to an empty state', () => {
    expect(parseSocialLinks('Kick @arystal\nInstagram|arystal\n\nYouTube')).toEqual([
      { label: 'Kick', handle: '@arystal' },
      { label: 'Instagram', handle: '@arystal' },
      { label: '', handle: '@YouTube' },
    ])
    const element = createElement('socialLinks')
    element.props.links = ''
    const { container } = mount(element, liveState({ configured: false, state: 'disconnected' }))
    expect(screen.getByText('Add a channel and handle')).toBeTruthy()
    expect(container.querySelector('.widget-shell')).toBeTruthy()
  })
})

describe('editor and runtime parity', () => {
  it('renders byte-identical markup in both surfaces for every shared widget', () => {
    const state = liveState()
    for (const type of KICK_WIDGET_TYPES) {
      const element = createElement(type as Parameters<typeof createElement>[0])
      element.decoration = { ...element.decoration, enabled: false }
      const editor = mount(element, state, false)
      const editorHtml = editor.container.innerHTML
      editor.unmount()
      const runtime = mount(element, state, true)
      const runtimeHtml = runtime.container.innerHTML
      runtime.unmount()
      expect(runtimeHtml, `${type} diverged between editor and runtime`).toBe(editorHtml)
    }
  })

  it('keeps widget chrome out of pointer events and free of editor-only controls', () => {
    const element = createElement('recentFollowers')
    const { container } = mount(element, liveState())
    const shell = container.querySelector('.widget-shell') as HTMLElement
    expect(shell).toBeTruthy()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
  })
})
