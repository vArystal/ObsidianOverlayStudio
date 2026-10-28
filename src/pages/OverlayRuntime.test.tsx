import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createElement, createEmptyOverlay } from '../lib/elements'
import { encodeOverlaySnapshot } from '../lib/storage'
import { OverlayRuntime } from './OverlayRuntime'

afterEach(() => {
  cleanup()
  document.documentElement.className = ''
  document.body.className = ''
})

describe('published overlay runtime', () => {
  it('opens directly from a snapshot and renders only visible output layers without editor controls', () => {
    const overlay = createEmptyOverlay('OBS output')
    const included = createElement('text')
    included.props.text = 'Visible title'
    const hidden = createElement('text')
    hidden.props.text = 'Hidden title'
    hidden.visible = false
    const planning = createElement('capture')
    overlay.elements.push(included, hidden, planning)
    const snapshot = encodeOverlaySnapshot(overlay)

    const { container } = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Visible title')).toBeTruthy()
    expect(screen.queryByText('Hidden title')).toBeNull()
    expect(screen.queryByText(/GAME \/ DISPLAY CAPTURE/)).toBeNull()
    expect(container.querySelector('.runtime-stage')).toBeTruthy()
    expect(container.querySelector('.editor-toolbar')).toBeNull()
    expect(container.querySelector('.editor-panel')).toBeNull()
  })

  it('shows a small error only when local data and snapshot are unavailable', () => {
    render(
      <MemoryRouter initialEntries={['/overlay/not-here']}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Overlay unavailable')).toBeTruthy()
  })
})

describe('runtime resilience for legacy data', () => {
  // A stored overlay from an older build (or a hand-edited one) can arrive without theme colours.
  // Before this guard the colour helper threw on undefined.replace and React unmounted the whole
  // runtime into an error page, which blanks a live OBS source instead of losing one colour.
  it('renders a snapshot whose theme carries no colours, falling back to the default accent', () => {
    const overlay = createEmptyOverlay('Legacy overlay')
    overlay.theme = { id: 'royal-persian' } as typeof overlay.theme
    const title = createElement('text')
    title.props.text = 'Legacy title'
    const chat = createElement('chat')
    overlay.elements.push(title, chat)

    const snapshot = encodeOverlaySnapshot(overlay)
    const { container } = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Legacy title')).toBeTruthy()
    expect(container.querySelector('.runtime-stage')).not.toBeNull()
    const main = container.querySelector('.overlay-runtime') as HTMLElement
    expect(main.style.getPropertyValue('--theme-accent')).toBe('#d8ad55')
  })

  it('gives idle glow and sparkle their own compositor layer instead of animating the widget', () => {
    const overlay = createEmptyOverlay('Idle layers')
    const glowing = createElement('text')
    glowing.animation.idle = 'glow'
    const sparkling = createElement('text')
    sparkling.animation.idle = 'sparkle'
    overlay.elements.push(glowing, sparkling)

    const snapshot = encodeOverlaySnapshot(overlay)
    const { container } = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )

    expect(container.querySelectorAll('.idle-layer.idle-glow')).toHaveLength(1)
    expect(container.querySelectorAll('.idle-layer.idle-sparkle')).toHaveLength(1)
  })
})
