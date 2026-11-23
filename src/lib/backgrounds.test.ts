import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createElement as h } from 'react'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND, isAnimated, motionConfigFor, normalizeBackground, presetFor, themeBackground,
} from './backgrounds'
import { BackgroundLayer } from '../components/BackgroundLayer'
import { createEmptyOverlay, createElement } from './elements'
import { decodeOverlaySnapshot, encodeOverlaySnapshot, normalizeOverlay } from './storage'
import { THEMES, THEME_ORDER, getTheme } from './themes'
import { VARIANTS } from '../motion/catalog'
import { VARIANT_IDS } from '../motion/types'

describe('motion backdrop document model', () => {
  it('ships ten constructed variants, each with a full preset set', () => {
    expect(BACKGROUND_PRESETS).toHaveLength(10)
    expect(VARIANTS.map((variant) => variant.id)).toEqual([...VARIANT_IDS])
    expect(new Set(BACKGROUND_PRESETS.map((preset) => preset.kind)).size).toBe(10)
    for (const variant of VARIANTS) {
      expect(variant.presets, variant.id).toHaveLength(5)
      // Five distinct moods, not five names for the same palette.
      expect(new Set(variant.presets.map((preset) => preset.colors.join(''))).size, variant.id).toBe(5)
      // Every default must satisfy the schema it is declared in.
      for (const spec of variant.params) {
        expect(spec.default, `${variant.id}.${spec.key}`).toBeDefined()
        if (spec.type === 'number') {
          expect(Number(spec.default)).toBeGreaterThanOrEqual(spec.min ?? 0)
          expect(Number(spec.default)).toBeLessThanOrEqual(spec.max ?? 1)
        }
        if (spec.type === 'enum') expect(spec.values).toContain(spec.default)
      }
    }
  })

  it('resolves every legacy scene name to a variant', () => {
    expect(normalizeBackground({ kind: 'neon-grid' }).kind).toBe('reactive-grid')
    expect(normalizeBackground({ kind: 'rose-vines' }).kind).toBe('fluid-ink')
    expect(normalizeBackground({ kind: 'frosted-glass' }).kind).toBe('liquid-glass')
    expect(normalizeBackground({ kind: 'bokeh-lights' }).kind).toBe('css-orbs')
    // `none` is not a scene: an enabled backdrop always paints something.
    expect(normalizeBackground({ enabled: true, kind: 'none' }).kind).toBe(DEFAULT_BACKGROUND.kind)
  })

  it('defaults to a disabled backdrop so existing overlays look unchanged', () => {
    expect(DEFAULT_BACKGROUND.enabled).toBe(false)
    expect(normalizeBackground(undefined).enabled).toBe(false)
    expect(createEmptyOverlay('Fresh').background.enabled).toBe(false)
  })

  it('coerces invalid configuration without throwing or rendering garbage', () => {
    const broken = normalizeBackground({ kind: 'not-a-real-effect', opacity: 9, speed: -4, blur: 'x', primary: 'red', density: 99, scale: 42 })
    expect(broken.kind).toBe(DEFAULT_BACKGROUND.kind)
    expect(broken.opacity).toBe(1)
    expect(broken.speed).toBe(0.2)
    expect(broken.blur).toBe(presetFor(DEFAULT_BACKGROUND.kind)!.defaults.blur)
    expect(broken.primary).toBe(presetFor(DEFAULT_BACKGROUND.kind)!.defaults.primary)
    expect(broken.density).toBe(1)
    expect(broken.scale).toBe(1.6)
  })

  it('validates every variant param against its schema, and drops unknown keys', () => {
    const bg = normalizeBackground({ kind: 'aurora-mesh', params: { points: 99, warp: -3, glow: 'nope', bogus: 7 } })
    expect(bg.params).toEqual({ points: 9, warp: 0, glow: 0.7, contrast: 0.95 })
    expect(bg.params).not.toHaveProperty('bogus')
    // Enum params fall back instead of rendering a string the shader does not know.
    expect(normalizeBackground({ kind: 'dither-print', params: { pattern: 'triangles' } }).params?.pattern).toBe('bayer-8')
    expect(normalizeBackground({ kind: 'reactive-grid', params: { shape: 'hex' } }).params?.shape).toBe('hex')
  })

  it('stays independent of the theme in both directions', () => {
    const bg = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, kind: 'deep-space', accent: '#ff0000' })
    const before = JSON.stringify(bg)
    for (const id of THEME_ORDER) expect(getTheme(id)).toBeTruthy()
    expect(JSON.stringify(bg)).toBe(before)
    const overlay = createEmptyOverlay('Themed')
    overlay.background = bg
    const switched = normalizeOverlay({ ...overlay, theme: THEMES.nocturne })
    expect(switched.background).toEqual(normalizeBackground(bg))
  })

  it('round-trips through a published snapshot, params included', () => {
    const overlay = createEmptyOverlay('Snapshot')
    overlay.background = normalizeBackground({
      ...DEFAULT_BACKGROUND,
      enabled: true,
      kind: 'living-patterns',
      speed: 1.4,
      accent: '#22d3ee',
      params: { mode: 'maze', feed: 0.03, kill: 0.061, detail: 0.8 },
      seed: 4242,
    })
    const decoded = decodeOverlaySnapshot(encodeOverlaySnapshot(overlay))
    expect(decoded?.background.kind).toBe('living-patterns')
    expect(decoded?.background.speed).toBeCloseTo(1.4)
    expect(decoded?.background.params?.mode).toBe('maze')
    expect(decoded?.background.seed).toBe(4242)
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

  it('maps the document record onto a renderer config', () => {
    const bg = normalizeBackground({
      ...DEFAULT_BACKGROUND,
      kind: 'contour-lines',
      primary: '#010101',
      secondary: '#020202',
      accent: '#03f0c0',
      speed: 1.5,
      params: { lines: 30, ridged: true },
    })
    const config = motionConfigFor(bg)
    expect(config.colors).toEqual(['#010101', '#020202', '#03f0c0'])
    expect(config.params.lines).toBe(30)
    expect(config.params.ridged).toBe(true)
    expect(config.speed).toBe(1.5)
  })
})

describe('motion backdrop rendering', () => {
  it('renders every variant, and nothing when disabled', () => {
    for (const preset of BACKGROUND_PRESETS) {
      const background = normalizeBackground({ ...preset.defaults, kind: preset.kind, enabled: true })
      const { container, unmount } = render(h(BackgroundLayer, { background }))
      const layer = container.querySelector(`[data-background="${preset.kind}"]`)
      expect(layer, preset.kind).not.toBeNull()
      expect(layer!.getAttribute('aria-hidden')).toBe('true')
      // The poster is painted from the palette before any renderer exists: no empty rectangle, no layout shift.
      const surface = layer!.querySelector('.mb-root') as HTMLElement | null
      expect(surface, `${preset.kind} surface`).not.toBeNull()
      expect(surface!.style.backgroundImage).toContain('gradient')
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
    expect(layer.getAttribute('tabindex')).toBeNull()
    expect(layer.querySelectorAll('button, a, input')).toHaveLength(0)
    const overlay = createEmptyOverlay('Layers')
    overlay.background = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true })
    overlay.elements = [createElement('chat')]
    expect(overlay.elements).toHaveLength(1)
    overlay.elements.forEach((element) => expect(element.id).not.toBe('background'))
  })

  it('honours pause and reduced motion, with an honest animated flag', () => {
    const bg = normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, paused: false })
    expect(isAnimated(bg, false)).toBe(true)
    expect(isAnimated({ ...bg, paused: true }, false)).toBe(false)
    expect(isAnimated(bg, true)).toBe(false)
    const { container: paused } = render(h(BackgroundLayer, { background: { ...bg, paused: true } }))
    expect(paused.querySelector('.overlay-background')!.className).toContain('is-still')
    const { container: running } = render(h(BackgroundLayer, { background: bg }))
    expect(running.querySelector('.overlay-background')!.className).toContain('is-animated')
  })
})

/**
 * The palette is no longer a per-scene constant: it comes from the theme the overlay already uses. Variant, params
 * and motion are preserved, so a theme switch changes the colour of the scene, not the scene.
 */
describe('themed backdrops', () => {
  it('takes the three colours from the style and keeps the variant, params and motion', () => {
    const bg = normalizeBackground({
      ...DEFAULT_BACKGROUND,
      enabled: true,
      kind: 'fluid-ink',
      speed: 1.3,
      paused: true,
      params: { splats: 6, turbulence: 1.8 },
      preset: 'custom',
    })
    const theme = THEMES['rose-thorn']
    const themed = themeBackground(bg, theme)
    expect(themed.kind).toBe('fluid-ink')
    expect(themed.speed).toBe(1.3)
    expect(themed.paused).toBe(true)
    expect(themed.params).toEqual(bg.params)
    expect(themed.preset).toBe('custom')
    expect(themed.primary.toLowerCase()).toBe(theme.palette.surface.sunken.toLowerCase())
    expect(themed.secondary.toLowerCase()).toBe(theme.palette.surface.raised.toLowerCase())
    expect(themed.accent.toLowerCase()).toBe(theme.palette.accent.base.toLowerCase())
    expect(themed.accent).not.toBe(bg.accent)
  })
})
