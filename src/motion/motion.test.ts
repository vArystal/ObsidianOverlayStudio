import { describe, expect, it } from 'vitest'
import { VARIANTS, presetsFor, isVariantId, LEGACY_KIND_MAP } from './catalog'
import { VARIANT_IDS } from './types'
import { defaultConfig, normaliseMotionConfig, posterCss, resolveParams, cssBackendVars } from './config'
import { createRng, curl2, mixOklab, parseHex, paletteStops, toHex, clamp } from './utils'
import { PACKERS } from './renderers'

describe('motion schema', () => {
  it('declares ten distinct variants with a backend each', () => {
    expect(VARIANTS).toHaveLength(10)
    expect(new Set(VARIANTS.map((variant) => variant.id)).size).toBe(10)
    for (const variant of VARIANTS) {
      expect(['gl', '2d', 'css']).toContain(variant.backend)
      expect(variant.tech.length).toBeGreaterThan(0)
      expect(variant.params.length).toBeGreaterThan(2)
    }
    // No two variants may be the same scene under a different name.
    expect(new Set(VARIANTS.map((variant) => `${variant.backend}:${variant.params.map((p) => p.key).join()}`)).size).toBe(10)
  })

  it('keeps every legacy scene mapped to a real variant', () => {
    for (const [legacy, variant] of Object.entries(LEGACY_KIND_MAP)) {
      expect(isVariantId(variant), legacy).toBe(true)
      expect(VARIANT_IDS).toContain(variant)
    }
    expect(Object.keys(LEGACY_KIND_MAP).length).toBe(12)
  })

  it('gives every variant five presets in five different moods', () => {
    for (const variant of VARIANTS) {
      expect(presetsFor(variant.id), variant.id).toHaveLength(5)
      const ids = presetsFor(variant.id).map((preset) => preset.id)
      expect(new Set(ids).size).toBe(5)
      for (const preset of presetsFor(variant.id)) {
        expect(preset.colors).toHaveLength(3)
        for (const colour of preset.colors) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
        // Per-preset params must obey the same schema as the live controls.
        for (const [key, value] of Object.entries(preset.params ?? {})) {
          const spec = variant.params.find((item) => item.key === key)
          expect(spec, `${variant.id}.${preset.id}.${key}`).toBeDefined()
          if (spec?.type === 'number') {
            expect(Number(value)).toBeGreaterThanOrEqual(spec.min ?? 0)
            expect(Number(value)).toBeLessThanOrEqual(spec.max ?? 1)
          }
        }
      }
    }
  })

  it('resolves defaults to a usable, fully typed config', () => {
    for (const id of VARIANT_IDS) {
      const config = defaultConfig(id)
      expect(config.colors).toHaveLength(3)
      expect(config.speed).toBeGreaterThan(0)
      const params = resolveParams(config, id)
      for (const spec of VARIANTS.find((variant) => variant.id === id)!.params) {
        expect(params.values[spec.key], `${id}.${spec.key}`).toBeDefined()
      }
    }
  })
})

describe('config normalisation', () => {
  it('clamps shared fields and invalid colours', () => {
    const config = normaliseMotionConfig({
      colors: ['red', '#ABCDEF', '#010203'],
      speed: 99,
      opacity: -5,
      intensity: 7,
      blur: 1000,
      scale: 9,
      seed: -10,
      pointer: 4,
      grain: 9,
      vignette: -2,
    }, 'aurora-mesh')
    expect(config.colors).toEqual(['#05070f', '#abcdef', '#010203'])
    expect(config.speed).toBe(3)
    expect(config.opacity).toBe(0)
    expect(config.intensity).toBe(1)
    expect(config.blur).toBe(120)
    expect(config.scale).toBe(1.6)
    expect(config.seed).toBeGreaterThanOrEqual(0)
    expect(config.pointer).toBe(1)
    expect(config.grain).toBe(0.2)
    expect(config.vignette).toBe(0)
  })

  it('keeps params serialisable and limited to the declared schema', () => {
    const config = normaliseMotionConfig({ params: { orbs: 6, thickness: 0.9, junk: true } }, 'liquid-glass')
    expect(config.params).toEqual({ orbs: 6, thickness: 0.9, dispersion: 0.4, frost: 0.22, specular: 1 })
    expect(() => JSON.stringify(config)).not.toThrow()
  })

  it('paints a poster from the palette before any renderer exists', () => {
    const config = defaultConfig('deep-space')
    const css = posterCss(config, 'deep-space')
    expect(css).toContain('gradient')
    expect(css).toContain(config.colors[0])
    expect(posterCss(config, 'dither-print')).not.toBe(css)
  })

  it('exposes the CSS backend entirely through custom properties', () => {
    const config = normaliseMotionConfig({ speed: 2, opacity: 0.5, params: { orbs: 6, blur: 40 } }, 'css-orbs')
    const vars = cssBackendVars(config, 'css-orbs')
    expect(vars['--mb-c0']).toBe(config.colors[0])
    expect(vars['--mb-orbs']).toBe('6')
    expect(vars['--mb-softness']).toBe('40px')
    expect(vars['--mb-opacity']).toBe('0.5')
  })

  it('packs variant params into the shader slots', () => {
    const config = normaliseMotionConfig({ params: { points: 7, warp: 1.2, glow: 0.4, contrast: 1.1 } }, 'aurora-mesh')
    const [a] = PACKERS['aurora-mesh'](resolveParams(config, 'aurora-mesh'))
    expect(a).toEqual([7, 1.2, 0.4, 1.1])
    const dither = normaliseMotionConfig({ params: { pattern: 'halftone', inks: 'mono', cell: 6 } }, 'dither-print')
    const [da, db] = PACKERS['dither-print'](resolveParams(dither, 'dither-print'))
    expect(da[3]).toBe(2)
    expect(db[0]).toBe(2)
  })
})

describe('shared maths', () => {
  it('is deterministic per seed and independent across seeds', () => {
    const a = Array.from({ length: 5 }, createRng(42))
    const b = Array.from({ length: 5 }, createRng(42))
    const c = Array.from({ length: 5 }, createRng(43))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('produces a divergence-free-looking curl field', () => {
    const flow = curl2(0.4, 0.2, 3, 7)
    expect(Number.isFinite(flow.x)).toBe(true)
    expect(Number.isFinite(flow.y)).toBe(true)
    // The field must actually move between samples, or the particles would sit still.
    const other = curl2(1.4, 1.2, 3, 7)
    expect(Math.abs(flow.x - other.x) + Math.abs(flow.y - other.y)).toBeGreaterThan(0.001)
  })

  it('mixes colours perceptually and returns valid hex', () => {
    const mixed = mixOklab(parseHex('#000000'), parseHex('#ffffff'), 0.5)
    const hex = toHex(mixed)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    const stops = paletteStops(['#000000', '#888888', '#ffffff'], 5)
    expect(stops).toHaveLength(5)
    expect(stops[0]).toBe('#000000')
    expect(stops[4]).toBe('#ffffff')
  })

  it('clamps safely', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(Number.isNaN(clamp(Number.NaN, 0, 1))).toBe(true)
  })
})
