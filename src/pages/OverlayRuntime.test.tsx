import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createElement, createEmptyOverlay } from '../lib/elements'
import { encodeOverlaySnapshot } from '../lib/storage'
import { OverlayRuntime } from './OverlayRuntime'
import { getTheme } from '../lib/themes'

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
    overlay.theme = { id: 'royal-persian' } as unknown as typeof overlay.theme
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
    // Assert against the theme data, not a literal: the palette was rebuilt as monochrome.
    expect(main.style.getPropertyValue('--theme-accent')).toBe(getTheme('royal-persian').accent)
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

describe('runtime scaling mode', () => {
  it('scales with zoom where the engine supports it, so OBS rasterises text at the final size', () => {
    // jsdom has no CSS.supports, so provide the Chromium answer OBS will give.
    const original = (globalThis as { CSS?: unknown }).CSS
    Object.defineProperty(globalThis, 'CSS', { value: { supports: () => true }, configurable: true })
    const overlay = createEmptyOverlay('OBS output')
    const snapshot = encodeOverlaySnapshot(overlay)
    const { container } = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )
    const stage = container.querySelector('.runtime-stage') as HTMLElement
    const expected = Math.min(window.innerWidth / overlay.width, window.innerHeight / overlay.height)
    expect(stage.dataset.scaleMode === 'zoom' || stage.dataset.scaleMode === 'transform').toBe(true)
    // The design box is never rewritten; only the scale channel changes.
    expect(stage.style.width).toBe(`${overlay.width}px`)
    expect(stage.style.height).toBe(`${overlay.height}px`)
    if (stage.dataset.scaleMode === 'zoom') expect(Number.parseFloat(stage.style.zoom || '1')).toBeCloseTo(expected, 5)
    else expect(stage.style.transform).toContain('scale(')
    Object.defineProperty(globalThis, 'CSS', { value: original, configurable: true })
  })
})

describe('source sizing policy', () => {
  const renderAt = (width: number, height: number, query = '') => {
    const overlay = createEmptyOverlay('Sizing')
    const snapshot = encodeOverlaySnapshot(overlay)
    const original = [window.innerWidth, window.innerHeight]
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
    const utils = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}${query}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )
    return { overlay, ...utils, restore: () => {
      Object.defineProperty(window, 'innerWidth', { value: original[0], configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: original[1], configurable: true })
    } }
  }

  it('never upscales a 1920x1080 design to fill a larger source', () => {
    // Blowing the design up invents pixels and stops the stage landing on whole device pixels.
    const { container, restore } = renderAt(2560, 1440)
    const stage = container.querySelector('.runtime-stage') as HTMLElement
    expect(stage.style.width).toBe('1920px')
    expect(stage.style.zoom === '' || stage.style.zoom === '1').toBe(true)
    expect(stage.getAttribute('data-fit')).toBe('contain')
    restore()
  })

  it('lets an operator opt into covering the source', () => {
    const { container, restore } = renderAt(2560, 1440, '&fit=fill')
    const stage = container.querySelector('.runtime-stage') as HTMLElement
    expect(Number.parseFloat(stage.style.zoom || '1')).toBeGreaterThan(1.3)
    restore()
  })

  it('reports pixel perfection in the diagnostics HUD', () => {
    const { container, restore } = renderAt(1920, 1080, '&diag=1')
    const hud = container.querySelector('.runtime-diagnostics') as HTMLElement | null
    expect(hud).toBeTruthy()
    expect(hud!.dataset.pixelPerfect).toBe('true')
    expect(hud!.textContent).toContain('PIXEL PERFECT')
    restore()
  })
})
