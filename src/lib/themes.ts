import type { DecorationPresetId, ElementDecoration, OverlayTheme, ThemeId } from '../types'

export const THEMES: Record<ThemeId, OverlayTheme> = {
  'royal-persian': {
    id: 'royal-persian', name: 'Royal Persian', nameFa: 'پارسی سلطنتی',
    primary: '#6d28a8', secondary: '#2a0f36', accent: '#d8ad55', accentSoft: '#f1d89a',
    surface: '#170b20', surfaceAlt: '#2b1238', text: '#fff8e7', muted: '#c8b9cf', glow: '#a855f7', pattern: 'girih',
  },
  'persian-turquoise': {
    id: 'persian-turquoise', name: 'Persian Turquoise', nameFa: 'فیروزه پارسی',
    primary: '#087f8c', secondary: '#071d2d', accent: '#d7ad55', accentSoft: '#f4dda0',
    surface: '#071820', surfaceAlt: '#0c3540', text: '#f8f4e8', muted: '#a8c8cb', glow: '#20c7c9', pattern: 'eslimi',
  },
  'imperial-night': {
    id: 'imperial-night', name: 'Imperial Night', nameFa: 'شب شاهانه',
    primary: '#4b183f', secondary: '#160d19', accent: '#b99a62', accentSoft: '#e8d8b5',
    surface: '#120b14', surfaceAlt: '#281429', text: '#f4ecdd', muted: '#b8aab6', glow: '#7f476f', pattern: 'diamonds',
  },
  'minimal-esports': {
    id: 'minimal-esports', name: 'Minimal Esports', nameFa: 'اسپرت مینیمال',
    primary: '#7c3aed', secondary: '#111119', accent: '#a78bfa', accentSoft: '#ddd6fe',
    surface: '#0e0e14', surfaceAlt: '#1a1a24', text: '#f8fafc', muted: '#9ca3af', glow: '#7c3aed', pattern: 'none',
  },
}

export const DEFAULT_THEME = THEMES['royal-persian']

const baseDecoration: ElementDecoration = {
  enabled: true,
  preset: 'royal-panel',
  inheritTheme: true,
  borderVisible: true,
  borderWidth: 3,
  borderColor: '#d8ad55',
  borderOpacity: 0.92,
  radius: 18,
  innerBorder: true,
  innerBorderColor: '#f1d89a',
  innerBorderOpacity: 0.3,
  cornerOrnaments: true,
  separator: false,
  backgroundColor: '#170b20',
  backgroundOpacity: 0.82,
  gradient: true,
  pattern: 'girih',
  shadow: true,
  glow: true,
  highlight: true,
  padding: 18,
}

export const DECORATION_PRESETS: Record<DecorationPresetId, ElementDecoration> = {
  none: { ...baseDecoration, enabled: false, preset: 'none', borderVisible: false, innerBorder: false, cornerOrnaments: false, backgroundOpacity: 0, gradient: false, pattern: 'none', shadow: false, glow: false, highlight: false, padding: 0 },
  'royal-panel': { ...baseDecoration, preset: 'royal-panel' },
  'turquoise-panel': { ...baseDecoration, preset: 'turquoise-panel', borderWidth: 2, radius: 14, pattern: 'eslimi', separator: true },
  'imperial-card': { ...baseDecoration, preset: 'imperial-card', borderWidth: 2, radius: 10, pattern: 'diamonds', glow: false, cornerOrnaments: true },
  'esports-line': { ...baseDecoration, preset: 'esports-line', borderWidth: 2, radius: 8, innerBorder: false, cornerOrnaments: false, gradient: false, pattern: 'none', glow: false, padding: 14 },
  'ornamental-frame': { ...baseDecoration, preset: 'ornamental-frame', backgroundOpacity: 0, borderWidth: 6, innerBorder: true, cornerOrnaments: true, separator: false, padding: 8 },
}

export function createDecoration(preset: DecorationPresetId = 'royal-panel'): ElementDecoration {
  return structuredClone(DECORATION_PRESETS[preset])
}

export function getTheme(id?: string | null): OverlayTheme {
  return THEMES[(id as ThemeId) ?? 'royal-persian'] ?? DEFAULT_THEME
}

/** True when a decoration produces any visible framing at all. */
export function hasVisibleFrame(decoration: ElementDecoration) {
  return Boolean(
    decoration.borderVisible
    || decoration.innerBorder
    || decoration.cornerOrnaments
    || decoration.shadow
    || decoration.glow
    || decoration.highlight
    || (decoration.pattern && decoration.pattern !== 'none')
    || decoration.backgroundOpacity > 0,
  )
}

/**
 * Turning the frame on must always show something. Text, image and shape layers are created with the
 * `none` preset, so flipping `enabled` alone used to leave a 0px border with no ornaments, no pattern
 * and no padding — a toggle that looked broken. Enabling an empty preset now adopts Royal panel,
 * while any customised frame keeps its own values.
 */
export function toggleDecoration(decoration: ElementDecoration, enabled: boolean): ElementDecoration {
  if (!enabled) return { ...decoration, enabled: false }
  if (decoration.preset === 'none' || !hasVisibleFrame(decoration)) {
    return { ...structuredClone(DECORATION_PRESETS['royal-panel']), inheritTheme: decoration.inheritTheme, enabled: true }
  }
  return { ...decoration, enabled: true }
}

export function resolveDecoration(decoration: ElementDecoration, theme: OverlayTheme) {
  if (!decoration.inheritTheme) return decoration
  return {
    ...decoration,
    borderColor: theme.accent,
    innerBorderColor: theme.accentSoft,
    backgroundColor: theme.surface,
    pattern: decoration.pattern === 'none' ? 'none' : theme.pattern,
  }
}
