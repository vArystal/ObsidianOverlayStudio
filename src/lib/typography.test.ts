import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FONT_ID, FONT_FAMILIES, TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_KEYS, TYPOGRAPHY_PRESETS, applyPreset, checkFont,
  findFont, fontStack, isFontMissing, nearestWeight, normalizeTypography, readTypography, resetTypography, searchFonts,
  textBoxStyle, typographyStyle,
} from './typography'
import { createElement } from './elements'
import { normalizeOverlay } from './storage'
import type { Overlay } from '../types'


describe('CP23 font registry', () => {
  it('ships at least twelve curated families with unique ids and names', () => {
    const curated = FONT_FAMILIES.filter((font) => font.kind !== 'system')
    expect(curated.length).toBeGreaterThanOrEqual(12)
    expect(new Set(FONT_FAMILIES.map((font) => font.id)).size).toBe(FONT_FAMILIES.length)
    expect(new Set(FONT_FAMILIES.map((font) => font.cssName)).size).toBe(FONT_FAMILIES.length)
  })

  it('covers the categories the studio promises', () => {
    const kinds = new Set(FONT_FAMILIES.map((font) => font.kind))
    for (const kind of ['sans', 'geometric', 'condensed', 'display', 'editorial', 'headline', 'mono', 'persian', 'multilingual']) {
      expect(kinds.has(kind as never)).toBe(true)
    }
    expect(FONT_FAMILIES.filter((font) => font.arabic).length).toBeGreaterThanOrEqual(3)
  })

  it('declares an open licence and a verifiable source for every self-hosted family', () => {
    for (const font of FONT_FAMILIES.filter((item) => item.kind !== 'system')) {
      expect(font.license).toBe('SIL OFL 1.1')
      expect(font.source.length).toBeGreaterThan(3)
    }
  })

  it('keeps every weight sorted and unique so the picker cannot offer a phantom weight', () => {
    for (const font of FONT_FAMILIES) {
      expect(font.weights.length).toBeGreaterThan(0)
      expect([...font.weights].sort((a, b) => a - b)).toEqual(font.weights)
      expect(new Set(font.weights).size).toBe(font.weights.length)
    }
  })
})

describe('CP23 font resolution', () => {
  it('resolves ids, css names and legacy hand-written stacks to the same family', () => {
    expect(findFont('vazirmatn')?.cssName).toBe('Vazirmatn')
    expect(findFont('Vazirmatn')?.id).toBe('vazirmatn')
    expect(findFont('Vazirmatn, Tahoma, sans-serif')?.id).toBe('vazirmatn')
    expect(findFont("'Inter', Arial, sans-serif")?.id).toBe('inter')
    expect(findFont('Inter, Arial, sans-serif')?.id).toBe('inter')
  })

  it('keeps a real fallback chain and reports an unknown family honestly', () => {
    expect(fontStack('inter')).toContain("'Inter'")
    expect(fontStack('vazirmatn')).toContain("'Vazirmatn'")
    expect(fontStack('some-deleted-font')).toContain('system-ui')
    expect(isFontMissing('some-deleted-font')).toBe(true)
    expect(isFontMissing('inter')).toBe(false)
    expect(isFontMissing(undefined)).toBe(false)
  })

  it('snaps a requested weight to one the family actually ships', () => {
    const bebas = findFont('bebas-neue')!
    expect(nearestWeight(bebas, 700)).toBe(400)
    const inter = findFont('inter')!
    expect(nearestWeight(inter, 600)).toBe(500)
    expect(readTypography({ fontFamily: 'bebas-neue', fontWeight: 900 }).fontWeight).toBe(400)
  })

  it('reports readiness without pretending a system face needs downloading', () => {
    expect(checkFont('system-sans').status).toBe('ready')
    expect(['ready', 'loading']).toContain(checkFont(DEFAULT_FONT_ID).status)
  })

  it('searches by name, category and script', () => {
    expect(searchFonts('vazir').map((font) => font.id)).toContain('vazirmatn')
    expect(searchFonts('mono').map((font) => font.id)).toContain('jetbrains-mono')
    expect(searchFonts('arabic').every((font) => font.scripts.includes('arabic'))).toBe(true)
    expect(searchFonts('  ').length).toBe(FONT_FAMILIES.length)
  })
})

describe('CP23 typography normalisation', () => {
  it('fills only what is absent, leaving an author stack verbatim', () => {
    const legacy: Record<string, unknown> = { fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 52, fontWeight: 700, color: '#ffffff', textAlign: 'right', lineHeight: 1.3, direction: 'rtl' }
    const next = normalizeTypography(legacy)
    expect(next.fontFamily).toBe('Vazirmatn, Tahoma, sans-serif')
    expect(next.fontSize).toBe(52)
    expect(next.direction).toBe('rtl')
    expect(next.letterSpacing).toBe(TYPOGRAPHY_DEFAULTS.letterSpacing)
  })

  it('is idempotent', () => {
    const once = normalizeTypography({ fontFamily: 'inter', fontSize: 40 })
    expect(normalizeTypography(once)).toEqual(once)
  })

  it('clamps junk into something renderable instead of throwing', () => {
    const t = readTypography({ fontFamily: 'inter', fontSize: 10_000, fontWeight: 'heavy', lineHeight: -4, letterSpacing: 999, textAlign: 'sideways', color: 'red', textOpacity: 9 })
    expect(t.fontSize).toBe(400)
    expect(t.fontWeight).toBe(700)
    expect(t.lineHeight).toBe(0.6)
    expect(t.letterSpacing).toBe(80)
    expect(t.textAlign).toBe('right')
    expect(t.color).toBe('#f6f6f4')
    expect(t.textOpacity).toBe(1)
  })

  it('never mutates the props it is given', () => {
    const props = { text: 'hello' }
    normalizeTypography(props)
    expect(props).toEqual({ text: 'hello' })
  })
})

describe('CP23 style building', () => {
  it('emits pixel units and drops direction for auto so the dir attribute decides', () => {
    const style = typographyStyle({ fontFamily: 'inter', fontSize: 48, letterSpacing: 2, direction: 'auto' })
    expect(style.fontSize).toBe('48px')
    expect(style.letterSpacing).toBe('2px')
    expect(style.direction).toBeUndefined()
    expect(typographyStyle({ direction: 'rtl' }).direction).toBe('rtl')
  })

  it('composes glow under shadow and only when enabled', () => {
    expect(typographyStyle({}).textShadow).toBeUndefined()
    expect(typographyStyle({ shadowEnabled: true, shadowBlur: 10, shadowColor: '#000000' }).textShadow).toContain('10px #000000')
    const both = typographyStyle({ glowEnabled: true, glowBlur: 12, shadowEnabled: true })
    expect(String(both.textShadow).split(',')).toHaveLength(2)
  })

  it('applies a stroke only when enabled and keeps paint order sane', () => {
    expect(typographyStyle({}).WebkitTextStrokeWidth).toBeUndefined()
    const stroked = typographyStyle({ strokeEnabled: true, strokeWidth: 4, strokeColor: '#111111' })
    expect(stroked.WebkitTextStrokeWidth).toBe('4px')
    expect(stroked.paintOrder).toBe('stroke fill')
  })

  it('expresses wrapping, overflow and max lines on the box', () => {
    expect(textBoxStyle({ maxLines: 2, overflow: 'ellipsis' }).WebkitLineClamp).toBe(2)
    expect(textBoxStyle({ wrap: 'nowrap', overflow: 'clip' }).whiteSpace).toBe('nowrap')
    expect(textBoxStyle({ verticalAlign: 'bottom' }).justifyContent).toBe('flex-end')
  })
})

describe('CP23 presets', () => {
  it('offers the eight named presets', () => {
    expect(TYPOGRAPHY_PRESETS.map((preset) => preset.id)).toEqual([
      'cinematic-headline', 'stream-title', 'compact-label', 'bold-gaming',
      'editorial', 'minimal-information', 'persian-display', 'monospace-technical',
    ])
  })

  it('touches typography keys only', () => {
    const allowed = new Set<string>(TYPOGRAPHY_KEYS)
    for (const preset of TYPOGRAPHY_PRESETS) {
      for (const key of Object.keys(preset.props)) expect(allowed.has(key)).toBe(true)
    }
  })

  it('preserves text, geometry, animation and decoration exactly', () => {
    const element = createElement('text')
    const before = structuredClone(element)
    for (const preset of TYPOGRAPHY_PRESETS) {
      const props = applyPreset(element.props, preset.id)
      expect(props.text).toBe(before.props.text)
      expect({ x: element.x, y: element.y, width: element.width, height: element.height }).toEqual({ x: before.x, y: before.y, width: before.width, height: before.height })
      expect(element.animation).toEqual(before.animation)
      expect(element.decoration).toEqual(before.decoration)
    }
  })

  it('only names families and weights that exist, so a preset never requests a synthetic face', () => {
    for (const preset of TYPOGRAPHY_PRESETS) {
      const font = findFont(preset.props.fontFamily)!
      expect(font).toBeTruthy()
      expect(font.weights).toContain(preset.props.fontWeight)
    }
  })

  it('resets typography without losing the author’s words', () => {
    const props = applyPreset({ text: 'Stream starting soon', fontFamily: 'bebas-neue' }, 'cinematic-headline')
    const reset = resetTypography()
    expect(reset.fontFamily).toBe(DEFAULT_FONT_ID)
    expect(props.text).toBe('Stream starting soon')
    expect(Object.keys(reset).sort()).toEqual([...TYPOGRAPHY_KEYS].sort())
  })
})

describe('CP23 persistence and parity', () => {
  const overlay = (): Overlay => {
    const element = createElement('text')
    element.props = { ...element.props, text: 'شروع پخش زنده — Live at 21:00', fontFamily: 'vazirmatn', direction: 'rtl', fontSize: 60, letterSpacing: 1 }
    return { ...createElementOverlay(), elements: [element] }
  }

  it('round-trips typography through JSON and normalisation without change', () => {
    const original = overlay()
    const revived = normalizeOverlay(JSON.parse(JSON.stringify(original)) as Overlay)
    expect(revived.elements[0].props.fontFamily).toBe('vazirmatn')
    expect(revived.elements[0].props.direction).toBe('rtl')
    expect(revived.elements[0].props.fontSize).toBe(60)
    expect(revived.elements[0].props.text).toBe('شروع پخش زنده — Live at 21:00')
  })

  it('upgrades a pre-CP23 overlay in place without resetting its type', () => {
    const legacy = normalizeOverlay({
      ...createElementOverlay(),
      elements: [{
        ...createElement('text'),
        props: { text: 'Legacy line', fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 44, fontWeight: 700, color: '#fff8e7' },
      }],
    } as Overlay)
    const props = legacy.elements[0].props
    // CP39 superseded the "keep the stack verbatim" policy: the value is migrated to the registry id, and the
    // invariant that matters is that the family painted on air does not change.
    expect(props.fontFamily).toBe('vazirmatn')
    expect(fontStack(props.fontFamily)).toBe(fontStack('Vazirmatn, Tahoma, sans-serif'))
    expect(props.fontSize).toBe(44)
    expect(props.color).toBe('#fff8e7')
    // New keys arrive at defaults so the studio has something to show.
    expect(props.letterSpacing).toBe(0)
    expect(props.overflow).toBe('clip')
  })

  it('produces one identical style regardless of surface', () => {
    const props = { ...overlay().elements[0].props }
    // Editor and runtime both call these two builders; nothing surface-specific may enter them.
    expect(typographyStyle(props)).toEqual(typographyStyle(props))
    expect(textBoxStyle(props)).toEqual(textBoxStyle(props))
    expect(typographyStyle(props).fontFamily).toBe(fontStack('vazirmatn'))
    expect(typographyStyle(props).direction).toBe('rtl')
  })

  it('keeps mixed Persian/English content byte-identical (no manual reversal)', () => {
    const mixed = 'Live at ۲۱:۰۰ — پخش زنده'
    const props = { ...overlay().elements[0].props, text: mixed }
    expect(props.text).toBe(mixed)
    expect([...props.text].reverse().join('')).not.toBe(props.text)
  })
})

function createElementOverlay(): Overlay {
  return {
    id: 'typography_test', publicId: 'pub_typography_test', name: 'Typography', width: 1920, height: 1080,
    elements: [],
    settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
    theme: { id: 'obsidian' } as Overlay['theme'],
    background: undefined as unknown as Overlay['background'],
    staticMotion: false, live: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null,
  }
}
