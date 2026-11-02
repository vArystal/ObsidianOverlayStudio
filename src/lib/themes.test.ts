import { describe, expect, it } from 'vitest'
import { createElement } from './elements'
import { createDecoration, getTheme, hasVisibleFrame, resolveDecoration, toggleDecoration } from './themes'

describe('decorative frame toggle', () => {
  it('gives text, image and shape layers a visible Persian frame when the toggle is turned on', () => {
    for (const type of ['text', 'image', 'shape'] as const) {
      const element = createElement(type)
      expect(element.decoration.preset).toBe('none')
      expect(hasVisibleFrame(element.decoration)).toBe(false)

      const enabled = toggleDecoration(element.decoration, true)
      expect(enabled.enabled).toBe(true)
      expect(enabled.preset).toBe('royal-panel')
      expect(hasVisibleFrame(enabled)).toBe(true)
      expect(enabled.borderVisible).toBe(true)
      expect(enabled.borderWidth).toBeGreaterThan(0)
      expect(enabled.cornerOrnaments).toBe(true)
      expect(enabled.innerBorder).toBe(true)
      expect(enabled.pattern).not.toBe('none')
      expect(enabled.padding).toBeGreaterThan(0)
    }
  })

  it('keeps a customised frame exactly as the author left it', () => {
    const custom = { ...createDecoration('turquoise-panel'), borderColor: '#123456', borderWidth: 9, inheritTheme: false, padding: 44 }
    const enabled = toggleDecoration({ ...custom, enabled: false }, true)
    expect(enabled).toEqual({ ...custom, enabled: true })
  })

  it('leans on the Royal panel preset but respects the theme-inheritance choice', () => {
    const base = { ...createDecoration('none'), inheritTheme: false }
    const enabled = toggleDecoration(base, true)
    expect(enabled.inheritTheme).toBe(false)
    expect(enabled.borderColor).toBe('#e8e8e6')
    expect(enabled.enabled).toBe(true)
  })

  it('repairs a frame that is enabled yet paints nothing', () => {
    const invisible = { ...createDecoration('royal-panel'), borderVisible: false, innerBorder: false, cornerOrnaments: false, shadow: false, glow: false, highlight: false, pattern: 'none' as const, backgroundOpacity: 0 }
    expect(hasVisibleFrame(invisible)).toBe(false)
    const repaired = toggleDecoration({ ...invisible, enabled: true }, true)
    expect(hasVisibleFrame(repaired)).toBe(true)
    expect(repaired.preset).toBe('royal-panel')
  })

  it('turns the frame off without discarding its settings', () => {
    const custom = { ...createDecoration('ornamental-frame'), borderWidth: 11 }
    const off = toggleDecoration(custom, false)
    expect(off.enabled).toBe(false)
    expect(off.preset).toBe('ornamental-frame')
    expect(off.borderWidth).toBe(11)
    expect(toggleDecoration(off, true)).toEqual({ ...custom, enabled: true })
  })

  it('still resolves inherited theme colours once the frame is on', () => {
    const enabled = toggleDecoration(createElement('text').decoration, true)
    const theme = getTheme('royal-persian')
    const resolved = resolveDecoration(enabled, theme)
    // Inherited colours come from the preset itself, so the test names the relationship, not a literal.
    expect(resolved.borderColor).toBe(theme.accent)
    expect(resolved.innerBorderColor).toBe(theme.accentSoft)
    expect(resolved.backgroundOpacity).toBeGreaterThan(0)
  })
})
