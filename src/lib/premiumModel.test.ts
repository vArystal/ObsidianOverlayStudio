import { describe, expect, it } from 'vitest'
import { createElement, createEmptyOverlay } from './elements'
import { normalizeOverlay } from './storage'
import { DECORATION_PRESETS, LEGACY_THEME_MAP, THEMES, THEME_ORDER, migrateThemeId, resolveDecoration } from './themes'

describe('CP20 theme system', () => {
  it('offers exactly four presets with a full palette each', () => {
    expect(Object.keys(THEMES).sort()).toEqual(['aurora', 'monolith', 'nocturne', 'obsidian'])
    expect(THEME_ORDER).toEqual(['obsidian', 'nocturne', 'aurora', 'monolith'])
    for (const id of THEME_ORDER) {
      const theme = THEMES[id]
      expect(theme.palette.surface.base).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.palette.text.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.palette.border.hairline).toBeTruthy()
      expect(theme.chrome.panelOpacity).toBeGreaterThan(0.4)
    }
  })

  it('keeps the four presets structurally distinct, not just recoloured', () => {
    const shapes = THEME_ORDER.map((id) => {
      const { chrome, pattern } = THEMES[id]
      return `${chrome.radius}|${chrome.borderWidth}|${chrome.texture}|${pattern}`
    })
    expect(new Set(shapes).size).toBe(4)
    expect(new Set(THEME_ORDER.map((id) => THEMES[id].palette.surface.base)).size).toBe(4)
  })

  it('never ships purple and never ships pure black surfaces', () => {
    for (const id of THEME_ORDER) {
      const theme = THEMES[id]
      const values = [theme.palette.surface.base, theme.palette.surface.raised, theme.palette.surface.sunken, theme.palette.accent.base]
      for (const hex of values) {
        expect(hex.toLowerCase(), `${id} ${hex}`).not.toBe('#000000')
        if (!hex.startsWith('#')) continue
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        // Purple is the one hue range the owner ruled out; purple has blue above red above green.
        if (max - min > 24) expect(b > r && r > g, `${id} ${hex} reads purple`).toBe(false)
      }
    }
  })

  it('migrates every retired theme id to a live preset', () => {
    expect(LEGACY_THEME_MAP['thorn-rose']).toBe('obsidian')
    expect(migrateThemeId('thorn-rose')).toBe('obsidian')
    expect(migrateThemeId('royal-persian')).toBe('obsidian')
    expect(migrateThemeId('persian-turquoise')).toBe('aurora')
    expect(migrateThemeId('imperial-night')).toBe('monolith')
    expect(migrateThemeId('nonsense')).toBe('obsidian')
    expect(migrateThemeId('nocturne')).toBe('nocturne')
  })

  it('migrates a saved overlay theme on load without touching its content', () => {
    const overlay = createEmptyOverlay('Retired theme')
    const title = createElement('text')
    title.props.text = 'unchanged'
    overlay.elements = [title]
    ;(overlay.theme as { id: string }).id = 'thorn-rose'
    // normalizeOverlay is the real load path, so the assertion runs through it rather than a cast.
    const migrated = normalizeOverlay(overlay)
    expect(migrated.theme.id).toBe('obsidian')
    expect(migrated.elements[0].props.text).toBe('unchanged')
    expect(migrated.elements).toHaveLength(1)
  })

  it('keeps the legacy decoration preset loadable as a plain framed panel', () => {
    expect(DECORATION_PRESETS['thorn-vine'].preset).toBe('thorn-vine')
    expect(DECORATION_PRESETS['thorn-vine'].borderVisible).toBe(true)
    const resolved = resolveDecoration({ ...DECORATION_PRESETS['thorn-vine'], inheritTheme: true }, THEMES.aurora)
    expect(resolved.borderColor).toBe(THEMES.aurora.palette.accent.base)
    expect(resolved.radius).toBe(THEMES.aurora.chrome.radius)
  })
})
