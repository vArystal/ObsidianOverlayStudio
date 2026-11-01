import type { DecorationPresetId, ElementDecoration, OverlayTheme, ThemeId, ThornFoliage, ThornMotion, ThornRose, ThornTuning } from '../types'

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
  /**
   * Thorn & Rose: a dark botanical frame. The palette is deliberately restrained (forest base, ivory
   * type, one emerald, one muted gold, one rose) because the vine artwork already carries the detail;
   * pattern stays 'none' so the inside of a widget never competes with legible content.
   */
  'thorn-rose': {
    id: 'thorn-rose', name: 'Thorn & Rose', nameFa: 'خار و گل سرخ',
    primary: '#1b3a2c', secondary: '#08110c', accent: '#c9a24a', accentSoft: '#f4efe4',
    surface: '#0b1410', surfaceAlt: '#12211a', text: '#f4efe4', muted: '#a9b9ad', glow: '#2f7a5f', pattern: 'none',
  },
}


/**
 * Thorn & Rose presets.
 *
 * A streamer should not have to edit a stylesheet to change the mood, so the palette, the foliage budget
 * and the animation speed are data. Each palette only moves the rose ramp (shadow -> deep -> mid -> lit);
 * the greens and golds stay put so a recoloured overlay still reads as the same garden.
 */
export const THORN_ROSE_PALETTES: Record<ThornRose, { label: string; shadow: string; deep: string; mid: string; lit: string }> = {
  crimson: { label: 'Crimson', shadow: '#3d0610', deep: '#8e1226', mid: '#b3162f', lit: '#d9304a' },
  wine: { label: 'Wine', shadow: '#2b0410', deep: '#5d0f22', mid: '#7e1630', lit: '#a82844' },
  blush: { label: 'Blush', shadow: '#5c2531', deep: '#a34456', mid: '#c4677a', lit: '#e79aa8' },
}

/** Foliage budget multipliers: how much grows out of each cane. */
export const THORN_FOLIAGE_DENSITY: Record<ThornFoliage, number> = { light: 0.6, full: 1, lush: 1.45 }

/** Animation speed: larger is slower, and `still` parks the idle motion without removing the art. */
export const THORN_MOTION_SCALE: Record<ThornMotion, number> = { still: 400, subtle: 1, lively: 0.62 }

export const DEFAULT_THORN_TUNING: ThornTuning = { rose: 'crimson', foliage: 'full', motion: 'subtle' }

/**
 * CSS custom properties for a tuning: the rose ramp plus the motion multiplier. Applying them to the stage
 * means a preview, the editor and a published source all resolve identical values.
 */
export function thornCssVars(tuning: ThornTuning): Record<string, string> {
  const palette = THORN_ROSE_PALETTES[tuning.rose]
  return {
    '--thorn-rose-shadow': palette.shadow,
    '--thorn-rose-deep': palette.deep,
    '--thorn-rose-mid': palette.mid,
    '--thorn-rose-lit': palette.lit,
    '--thorn-motion': String(THORN_MOTION_SCALE[tuning.motion]),
  }
}

export function normalizeThornTuning(input?: Partial<ThornTuning> | null): ThornTuning {
  const rose = input?.rose as ThornRose
  const foliage = input?.foliage as ThornFoliage
  const motion = input?.motion as ThornMotion
  return {
    rose: rose in THORN_ROSE_PALETTES ? rose : DEFAULT_THORN_TUNING.rose,
    foliage: foliage in THORN_FOLIAGE_DENSITY ? foliage : DEFAULT_THORN_TUNING.foliage,
    motion: motion in THORN_MOTION_SCALE ? motion : DEFAULT_THORN_TUNING.motion,
  }
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
  // The vine lives at the edges, so the content keeps a wider inset and no corner runners of its own.
  'thorn-vine': { ...baseDecoration, preset: 'thorn-vine', borderWidth: 2, radius: 14, cornerOrnaments: false, innerBorder: false, pattern: 'none', backgroundOpacity: 0.72, padding: 24, glow: false },
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
