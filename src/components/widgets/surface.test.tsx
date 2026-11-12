import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from '../../lib/elements'
import { ElementRenderer } from '../ElementRenderer'
import { LiveDataContext } from '../LiveDataProvider'
import type { LiveDataState } from '../LiveDataProvider'

const liveSnapshot = (overrides: Partial<LiveDataState> = {}): LiveDataState => ({
  state: 'connected', messages: [], viewer: { status: 'live', count: 42, updatedAt: null }, latestFollower: null,
  sessionFollowerCount: 0, alerts: [],
  stream: { title: 'Late night ranked', category: 'Valorant', isLive: true, startedAt: new Date().toISOString(), updatedAt: null },
  channel: { slug: 'arystal', activeSubscribers: 12 }, recentFollowers: [], recentSubscribers: [], activities: [],
  lastEventAt: null, configured: true, ...overrides,
})

afterEach(cleanup)

/** CP38: the six legacy widgets read only `color` before this phase, so the inspector surface controls did nothing. */
describe('legacy widgets share the CP24 surface', () => {
  const types = ['counter', 'countdown', 'viewerCount', 'sessionFollowers', 'latestFollower', 'supporter', 'goal'] as const

  for (const type of types) {
    it(`${type} paints background, border, radius, padding and type from props`, () => {
      const element = createElement(type)
      element.props = {
        ...element.props,
        color: '#dddddd',
        textColor: '#dddddd',
        backgroundColor: '#101010',
        backgroundOpacity: 0.5,
        borderWidth: 3,
        borderColor: '#333333',
        borderOpacity: 1,
        radius: 21,
        padding: 27,
        shadow: false,
        fontSize: 31,
      }
      const view = render(
        <LiveDataContext.Provider value={liveSnapshot()}>
          <ElementRenderer element={element} />
        </LiveDataContext.Provider>,
      )
      const shell = view.container.querySelector('.widget-shell') as HTMLElement
      expect(shell).toBeTruthy()
      expect(shell.style.borderRadius).toBe('21px')
      expect(shell.style.borderWidth).toBe('3px')
      expect(shell.style.padding).toBe('27px 31px')
      expect(shell.style.fontSize).toBe('31px')
      expect(shell.style.color).toBe('rgb(221, 221, 221)')
      expect(shell.style.backgroundColor).toBe('rgba(16, 16, 16, 0.5)')
      expect(shell.style.boxShadow).toBe('')
      // Geometry and honest states survive the wrapper.
      expect(element.width).toBeGreaterThan(0)
    })
  }

  it('keeps the viewer states distinguishable and lets the inspector text win', () => {
    const offline = createElement('viewerCount')
    offline.props = { ...offline.props, offlineText: 'Off air' }
    const view = render(
      <LiveDataContext.Provider value={liveSnapshot({ viewer: { status: 'offline', count: null, updatedAt: null } })}>
        <ElementRenderer element={offline} runtime />
      </LiveDataContext.Provider>,
    )
    expect(view.container.textContent).toContain('Off air')

    const blank = createElement('viewerCount')
    blank.props = { ...blank.props, offlineText: '', unavailableText: '' }
    const second = render(
      <LiveDataContext.Provider value={liveSnapshot({ configured: false, viewer: { status: 'unavailable', count: null, updatedAt: null } })}>
        <ElementRenderer element={blank} runtime />
      </LiveDataContext.Provider>,
    )
    expect(second.container.textContent).toContain('Not connected')
  })
})
