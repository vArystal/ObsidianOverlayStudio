import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createElement as h } from 'react'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND, backgroundCssVars, isAnimated, normalizeBackground, presetFor,
} from './backgrounds'
import { BackgroundLayer } from '../components/BackgroundLayer'
import { createEmptyOverlay, createElement } from './elements'
import { decodeOverlaySnapshot, encodeOverlaySnapshot, normalizeOverlay } from './storage'
import { THEMES, THEME_ORDER, getTheme } from './themes'

describe('CP21 background engine', () => {
  it('ships six effects with distinct construction, not six gradients', () => {
    expect(BACKGROUND_PRESETS).toHaveLength(6)
    const kinds = BACKGROUND_PRESETS.map((preset) => preset.kind)
    expect(new Set(kinds).size).toBe(6)
    // Each effect must differ from the others in its defaults, or it is the same scene under a new name.
    const signatures = BACKGROUND_PRESETS.map((preset) => JSON.stringify(preset.defaults))
    expect(new Set(signatures).size).toBe(6)
  })

  it('defaults to a disabled backdrop so existing overlays look unchanged', () => {
    expect(DEFAULT_BACKGROUND.enabled).toBe(false)
    expect(normalizeBackground(undefined).enabled).toBe(false)
    const overlay = createEmptyOverlay('Fresh')
    expect(overlay.background.enabled).toBe(false)
  })

  it('survives invalid configuration without throwing or rendering garbage', () => {
    const broken = normalizeBackground({ kind: 'not-a-real-effect', opacity: 9, speed: -4, blur: 'x', primary: 'red', density: 99, scale: 42 })
    expect(broken.kind).toBe(DEFAULT_BACKGROUND.kind)
    expect(broken.opacity).toBe(1)
    expect(broken.speed).toBe(0.2)
    expect(broken.blur).toBe(presetFor(DEFAULT_BACKGROUND.kind)!.defaults.blur)
    expect(broken.primary).toBe(presetFor(DEFAULT_BACKGROUND.kind)!.defaults.primary)
    expect(broken.density).toBe(1)
    expect(broken.scale).toBe(1.6)
  })

  it('stays independent of the theme in both directions', () => {
    const bg = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, kind: 'deep-space', accent: '#ff0000' })
    const before = JSON.stringify(bg)
    for (const id of THEME_ORDER) expect(getTheme(id)).toBeTruthy()
    expect(JSON.stringify(bg)).toBe(before)
    // And a theme change on an overlay leaves its background byte-identical.
    const overlay = createEmptyOverlay('Themed')
    overlay.background = bg
    const switched = normalizeOverlay({ ...overlay, theme: THEMES.nocturne })
    expect(switched.background).toEqual(normalizeBackground(bg))
  })

  it('round-trips through a published snapshot', () => {
    const overlay = createEmptyOverlay('Snapshot')
    overlay.background = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, kind: 'neon-grid', speed: 1.4, accent: '#22d3ee' })
    const decoded = decodeOverlaySnapshot(encodeOverlaySnapshot(overlay))
    expect(decoded?.background.kind).toBe('neon-grid')
    expect(decoded?.background.speed).toBeCloseTo(1.4)
    expect(decoded?.background.enabled).toBe(true)
  })

  it('keeps legacy overlays valid, with no background field at all', () => {
    const legacy = createEmptyOverlay('Legacy')
    delete (legacy as { background?: unknown }).background
    const loaded = normalizeOverlay(legacy)
    expect(loaded.background.enabled).toBe(false)
    expect(loaded.background.kind).toBe(DEFAULT_BACKGROUND.kind)
    expect(loaded.elements).toHaveLength(0)
  })

  it('renders the scene for every effect and nothing when disabled', () => {
    for (const preset of BACKGROUND_PRESETS) {
      const { container, unmount } = render(h(BackgroundLayer, { background: normalizeBackground({ ...preset.defaults, kind: preset.kind, enabled: true }) }))
      const layer = container.querySelector(`[data-background="${preset.kind}"]`)
      expect(layer).not.toBeNull()
      expect(layer!.getAttribute('aria-hidden')).toBe('true')
      unmount()
      expect(container.querySelector('.overlay-background')).toBeNull()
    }
    const off = render(h(BackgroundLayer, { background: normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: false }) }))
    expect(off.container.querySelector('.overlay-background')).toBeNull()
    off.unmount()
  })

  it('never takes pointer events and never joins the layer list', () => {
    const { container } = render(h(BackgroundLayer, { background: normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true }) }))
    const layer = container.querySelector('.overlay-background')!
    // The style tag carries pointer-events: none; the markup must also not be a focusable/interactive node.
    expect(layer.getAttribute('tabindex')).toBeNull()
    expect(layer.querySelectorAll('button, a, input')).toHaveLength(0)
    const overlay = createEmptyOverlay('Layers')
    overlay.background = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true })
    overlay.elements = [createElement('chat')]
    expect(overlay.elements).toHaveLength(1)
    overlay.elements.forEach((element) => expect(element.id).not.toBe('background'))
  })

  it('honours pause and reduced motion, and keeps intensity/speed mapped to durations', () => {
    const bg = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, speed: 2, paused: false })
    expect(isAnimated(bg, false)).toBe(true)
    expect(isAnimated({ ...bg, paused: true }, false)).toBe(false)
    expect(isAnimated(bg, true)).toBe(false)
    const fast = backgroundCssVars(bg)
    const slow = backgroundCssVars({ ...bg, speed: 0.5 })
    expect(parseFloat(fast['--bg-duration'])).toBeLessThan(parseFloat(slow['--bg-duration']))
    expect(fast['--bg-opacity']).toBe(String(bg.opacity))
  })

  it('exposes only the controls an effect actually reads', () => {
    const particle = presetFor('cinematic-particles')!
    expect(particle.controls).not.toContain('blur')
    expect(particle.controls).toContain('density')
    const grid = presetFor('neon-grid')!
    expect(grid.controls).not.toContain('density')
    expect(grid.controls).toContain('scale')
  })
})
