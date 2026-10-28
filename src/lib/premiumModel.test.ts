import { beforeEach, describe, expect, it } from 'vitest'
import { createElement, createEmptyOverlay } from './elements'
import { decodeOverlaySnapshot, encodeOverlaySnapshot, normalizeOverlay, sanitizeOverlayForPublish } from './storage'
import { createDecoration, getTheme, resolveDecoration, THEMES } from './themes'
import type { Overlay } from '../types'

beforeEach(() => localStorage.clear())

describe('premium Persian model', () => {
  it('provides four complete editable themes', () => {
    expect(Object.keys(THEMES)).toEqual(['royal-persian', 'persian-turquoise', 'imperial-night', 'minimal-esports'])
    for (const theme of Object.values(THEMES)) {
      expect(theme.nameFa).toBeTruthy()
      expect(theme.primary).toMatch(/^#/)
      expect(theme.accent).toMatch(/^#/)
      expect(theme.surface).toMatch(/^#/)
    }
  })

  it('changes theme tokens without changing composition or content', () => {
    const overlay = createEmptyOverlay('Theme-safe')
    const text = createElement('text'); text.x = 419; text.y = 212; text.props.text = 'محتوا محفوظ است'
    overlay.elements.push(text)
    const before = structuredClone(overlay.elements)
    overlay.theme = structuredClone(getTheme('persian-turquoise'))
    expect(overlay.theme.id).toBe('persian-turquoise')
    expect(overlay.elements).toEqual(before)
  })

  it('clones decoration presets independently and resolves inherited colors', () => {
    const first = createDecoration('royal-panel'); const second = createDecoration('royal-panel')
    first.borderWidth = 11
    expect(second.borderWidth).toBe(3)
    const resolved = resolveDecoration(second, getTheme('persian-turquoise'))
    expect(resolved.borderColor).toBe(getTheme('persian-turquoise').accent)
    expect(resolved.pattern).toBe('eslimi')
    const custom = { ...second, inheritTheme: false, borderColor: '#123456' }
    expect(resolveDecoration(custom, getTheme('imperial-night')).borderColor).toBe('#123456')
  })

  it('migrates legacy elements with full decoration and motion defaults', () => {
    const overlay = createEmptyOverlay('Legacy')
    const legacy = createElement('counter') as unknown as Record<string, unknown>
    delete legacy.animation; delete legacy.decoration
    overlay.elements = [legacy as unknown as Overlay['elements'][number]]
    const migrated = normalizeOverlay(overlay)
    expect(migrated.elements[0].animation.exit).toBe('fade')
    expect(migrated.elements[0].animation.holdDuration).toBeGreaterThan(0)
    expect(migrated.elements[0].decoration.preset).toBe('royal-panel')
  })
})

describe('publish secrecy and fallback', () => {
  it('recursively strips token/secret/password variants while retaining runtime capability', () => {
    const overlay = createEmptyOverlay('Secret safe')
    overlay.live = { backendUrl: 'https://api.example', runtimeKey: 'public-runtime-key', connectionId: 'connection', channelName: 'channel' }
    const unsafe = overlay as Overlay & Record<string, unknown>
    unsafe.access_token = 'access-value'
    unsafe.nested = { refreshToken: 'refresh-value', client_secret: 'secret-value', accountPassword: 'password-value', safe: 'visible' }
    const sanitized = sanitizeOverlayForPublish(unsafe)
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain('access-value')
    expect(serialized).not.toContain('refresh-value')
    expect(serialized).not.toContain('secret-value')
    expect(serialized).not.toContain('password-value')
    expect(serialized).toContain('public-runtime-key')
    expect(serialized).toContain('visible')
  })

  it('round trips theme, decorations, animations and public live config', () => {
    const overlay = createEmptyOverlay('Runtime fallback')
    overlay.theme = structuredClone(getTheme('imperial-night'))
    overlay.staticMotion = true
    overlay.live = { backendUrl: 'https://api.example', runtimeKey: 'runtime', connectionId: 'connection', channelName: 'channel' }
    const alert = createElement('alert'); alert.decoration = createDecoration('imperial-card'); alert.animation.type = 'ornamental'
    overlay.elements.push(alert)
    const decoded = decodeOverlaySnapshot(encodeOverlaySnapshot(overlay))
    expect(decoded?.theme.id).toBe('imperial-night')
    expect(decoded?.staticMotion).toBe(true)
    expect(decoded?.elements[0].decoration.preset).toBe('imperial-card')
    expect(decoded?.elements[0].animation.type).toBe('ornamental')
    expect(decoded?.live?.runtimeKey).toBe('runtime')
  })
})
