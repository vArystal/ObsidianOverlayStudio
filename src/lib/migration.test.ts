import { describe, expect, it } from 'vitest'
import { createElement, createEmptyOverlay } from './elements'
import { normalizeOverlay } from './storage'
import { LEGACY_THEME_MAP, THEMES, THEME_ORDER, getTheme, migrateThemeId, themeCssVars } from './themes'
import type { ThemeId } from '../types'

// CP20.1: the retired identity is gone, so every saved overlay has to arrive somewhere sensible.
// These tests exist because the CP20 rewrite replaced 13 botanical tests and only one migration test.

describe('legacy theme migration', () => {
  it('maps every retired id to a current preset', () => {
    const retired = Object.keys(LEGACY_THEME_MAP)
    expect(retired).toHaveLength(5)
    for (const id of retired) {
      const migrated = migrateThemeId(id)
      expect(THEME_ORDER).toContain(migrated)
    }
    // The four current ids pass through untouched.
    for (const id of THEME_ORDER) expect(migrateThemeId(id)).toBe(id)
  })

  it('is idempotent: migrating a migrated id changes nothing', () => {
    for (const id of Object.keys(LEGACY_THEME_MAP)) {
      const once = migrateThemeId(id)
      expect(migrateThemeId(once)).toBe(once)
    }
  })

  it('falls back to the default preset instead of throwing on an unknown id', () => {
    expect(() => getTheme('no-such-theme' as ThemeId)).not.toThrow()
    expect(getTheme('no-such-theme' as ThemeId).id).toBe('obsidian')
    expect(getTheme(undefined).id).toBe('obsidian')
  })

  it('loads a saved overlay through normalizeOverlay keeping content and live config intact', () => {
    const overlay = createEmptyOverlay('Saved before CP20')
    const title = createElement('text')
    title.props.text = 'keep me'
    const chat = createElement('chat')
    overlay.elements = [title, chat]
    overlay.width = 1920
    overlay.height = 1080
    overlay.live = { backendUrl: 'https://api.example', runtimeKey: 'rt-key', connectionId: 'conn-1', channelName: 'arystal' }
    ;(overlay.theme as { id: string }).id = 'royal-persian'

    const loaded = normalizeOverlay(overlay)
    expect(loaded.theme.id).toBe('obsidian')
    expect(loaded.name).toBe('Saved before CP20')
    expect(loaded.width).toBe(1920)
    expect(loaded.height).toBe(1080)
    expect(loaded.elements).toHaveLength(2)
    expect(loaded.elements[0].props.text).toBe('keep me')
    expect(loaded.live?.channelName).toBe('arystal')
    expect(loaded.live?.connectionId).toBe('conn-1')
  })

  it('survives an overlay still carrying the retired tuning field and botanical decoration', () => {
    const overlay = createEmptyOverlay('Botanical legacy')
    const legacy = overlay as unknown as Record<string, unknown>
    legacy.thorn = { rose: 'crimson', foliage: 'lush', motion: 'lively' }
    const element = createElement('text')
    // A saved element may still name the retired decoration preset.
    ;(element.decoration as { preset: string }).preset = 'thorn-vine'
    overlay.elements = [element]
    ;(overlay.theme as { id: string }).id = 'thorn-rose'

    const loaded = normalizeOverlay(overlay)
    expect(loaded.theme.id).toBe('obsidian')
    expect(loaded.elements).toHaveLength(1)
    expect(loaded.elements[0].decoration).toBeDefined()
  })
})

describe('theme presets after CP20', () => {
  it('ships four distinct presets with complete palettes', () => {
    expect(THEME_ORDER).toHaveLength(4)
    for (const id of THEME_ORDER) {
      const theme = THEMES[id]
      expect(theme.palette.surface.base).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.palette.accent.base).toMatch(/^#[0-9a-f]{6}$/i)
      expect(theme.palette.text.primary).toMatch(/^#[0-9a-f]{6}$/i)
      // Borders may be a hex or an rgba wash; either is a valid declaration.
      expect(theme.palette.border.hairline).toMatch(/^(#[0-9a-f]{3,8}|rgba?\()/i)
      expect(theme.chrome.borderWidth).toBeGreaterThan(0)
      expect(theme.chrome.texture).not.toBe('')
    }
  })

  it('keeps the monochrome rule: no pure black surfaces, no purple accents', () => {
    // Hue is only meaningful for opaque colours; rgba borders are skipped.
    const purple = (colour: string) => {
      if (!colour.startsWith('#') || colour.length < 7) return false
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const lightness = (max + min) / 2
      const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1))
      if (saturation < 0.12) return false
      let hue = 0
      if (max === r) hue = ((g - b) / (max - min)) * 60
      else if (max === g) hue = (2 + (b - r) / (max - min)) * 60
      else hue = (4 + (r - g) / (max - min)) * 60
      hue = (hue + 360) % 360
      return hue >= 235 && hue <= 325
    }
    for (const id of THEME_ORDER) {
      const theme = THEMES[id]
      const surfaces = Object.values(theme.palette.surface)
      for (const hex of surfaces) expect(hex.toLowerCase()).not.toBe('#000000')
      const accents = [...Object.values(theme.palette.accent), theme.palette.text.primary]
      for (const hex of accents) expect(purple(hex)).toBe(false)
    }
  })

  it('emits palette and chrome variables the runtime can consume', () => {
    const vars = themeCssVars(getTheme('aurora')) as Record<string, string>
    expect(vars['--theme-accent']).toBe(getTheme('aurora').palette.accent.base)
    expect(vars['--theme-surface']).toBe(getTheme('aurora').palette.surface.base)
    expect(vars['--theme-text']).toBe(getTheme('aurora').palette.text.primary)
    expect(vars['--theme-radius']).toContain('px')
  })
})
