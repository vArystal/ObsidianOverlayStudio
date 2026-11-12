import type {
  DecorationPresetId,
  ElementDecoration,
  LegacyThemeId,
  OverlayTheme,
  ThemeId,
  ThemePalette,
} from '../types'

/**
 * CP20 theme system.
 *
 * Four presets, built as distinct objects rather than four tints of one card. Each owns a full palette
 * (surfaces, accents, borders, text, states, depth) plus chrome: the geometry and material that make a
 * widget read as Obsidian, Nocturne, Aurora or Monolith before any colour is considered.
 *
 * Nothing here is purple and nothing is pure black: the deepest surface is #0a0b0d.
 */

const obsidianPalette: ThemePalette = {
  surface: { base: '#0e0f11', raised: '#15161a', sunken: '#0a0b0d', overlay: 'rgba(14,15,17,.92)' },
  accent: { base: '#cfd2d6', soft: '#9ea3aa', strong: '#eef0f2' },
  border: { hairline: 'rgba(255,255,255,.10)', strong: 'rgba(255,255,255,.20)', focus: '#ffffff' },
  text: { primary: '#f2f3f4', secondary: '#b6b9bd', muted: '#8b8f94', inverse: '#0b0c0e' },
  state: { hover: 'rgba(255,255,255,.06)', selected: 'rgba(255,255,255,.11)', disabled: 'rgba(255,255,255,.28)' },
  depth: { raised: '0 1px 0 rgba(255,255,255,.05), 0 10px 30px rgba(0,0,0,.45)', floating: '0 24px 60px rgba(0,0,0,.55)', inset: 'inset 0 1px 0 rgba(255,255,255,.06)', glow: 'rgba(220,224,230,.18)' },
}

const nocturnePalette: ThemePalette = {
  surface: { base: '#14100d', raised: '#1c1713', sunken: '#0f0c0a', overlay: 'rgba(20,16,13,.93)' },
  accent: { base: '#d8a86a', soft: '#e8c79a', strong: '#f0d9b5' },
  border: { hairline: 'rgba(216,168,106,.20)', strong: 'rgba(216,168,106,.38)', focus: '#f0d9b5' },
  text: { primary: '#f6efe6', secondary: '#cfc2b2', muted: '#a3958a', inverse: '#160f0a' },
  state: { hover: 'rgba(216,168,106,.10)', selected: 'rgba(216,168,106,.18)', disabled: 'rgba(246,239,230,.28)' },
  depth: { raised: '0 1px 0 rgba(240,217,181,.08), 0 12px 34px rgba(0,0,0,.5)', floating: '0 26px 64px rgba(0,0,0,.6)', inset: 'inset 0 1px 0 rgba(240,217,181,.10)', glow: 'rgba(216,168,106,.26)' },
}

const auroraPalette: ThemePalette = {
  surface: { base: '#0b1416', raised: '#101d20', sunken: '#08100f', overlay: 'rgba(11,20,22,.9)' },
  accent: { base: '#6fd3c7', soft: '#a8e6dd', strong: '#d6f5ef' },
  border: { hairline: 'rgba(111,211,199,.22)', strong: 'rgba(111,211,199,.40)', focus: '#d6f5ef' },
  text: { primary: '#eef7f5', secondary: '#c0dcd8', muted: '#93b0ad', inverse: '#05100f' },
  state: { hover: 'rgba(111,211,199,.10)', selected: 'rgba(111,211,199,.18)', disabled: 'rgba(238,247,245,.28)' },
  depth: { raised: '0 1px 0 rgba(214,245,239,.08), 0 14px 38px rgba(0,0,0,.5)', floating: '0 28px 70px rgba(0,0,0,.6)', inset: 'inset 0 1px 0 rgba(214,245,239,.10)', glow: 'rgba(111,211,199,.30)' },
}

const monolithPalette: ThemePalette = {
  surface: { base: '#101112', raised: '#191a1c', sunken: '#0c0d0e', overlay: 'rgba(16,17,18,.96)' },
  accent: { base: '#ffffff', soft: '#d5d7da', strong: '#ffffff' },
  border: { hairline: 'rgba(255,255,255,.16)', strong: 'rgba(255,255,255,.34)', focus: '#ffffff' },
  text: { primary: '#ffffff', secondary: '#c9ccce', muted: '#9aa0a4', inverse: '#0c0d0e' },
  state: { hover: 'rgba(255,255,255,.08)', selected: 'rgba(255,255,255,.14)', disabled: 'rgba(255,255,255,.30)' },
  depth: { raised: '0 2px 0 rgba(255,255,255,.07), 0 14px 34px rgba(0,0,0,.5)', floating: '0 30px 70px rgba(0,0,0,.6)', inset: 'inset 0 2px 0 rgba(255,255,255,.08)', glow: 'rgba(255,255,255,.16)' },
}

function theme(
  id: ThemeId,
  name: string,
  nameFa: string,
  palette: ThemePalette,
  chrome: OverlayTheme['chrome'],
  pattern: OverlayTheme['pattern'],
): OverlayTheme {
  return {
    id, name, nameFa, palette, chrome, pattern,
    primary: palette.surface.raised,
    secondary: palette.surface.sunken,
    accent: palette.accent.base,
    accentSoft: palette.accent.soft,
    surface: palette.surface.base,
    surfaceAlt: palette.surface.raised,
    text: palette.text.primary,
    muted: palette.text.muted,
    glow: palette.depth.glow,
  }
}

export const THEMES: Record<ThemeId, OverlayTheme> = {
  // Cinematic and quiet: a graphite plate with a silver hairline and nothing else competing for attention.
  obsidian: theme('obsidian', 'Obsidian', 'اُبسیدیَن', obsidianPalette, {
    radius: 6, borderWidth: 1, texture: 'none', uppercaseLabels: true,
    innerBorder: false, cornerOrnaments: false, panelOpacity: 0.66,
  }, 'none'),

  // Warm, editorial, softer: bronze ink on cocoa, a paper grain, generous corners.
  nocturne: theme('nocturne', 'Nocturne', 'نوکتورن', nocturnePalette, {
    radius: 18, borderWidth: 1, texture: 'grain', uppercaseLabels: false,
    innerBorder: true, cornerOrnaments: false, panelOpacity: 0.80,
  }, 'eslimi'),

  // Atmospheric: cool aqua light bleeding through a deep teal shell, with a slow aurora band in the material.
  aurora: theme('aurora', 'Aurora', 'شفق', auroraPalette, {
    radius: 26, borderWidth: 1, texture: 'aurora', uppercaseLabels: false,
    innerBorder: true, cornerOrnaments: false, panelOpacity: 0.58,
  }, 'none'),

  // Architectural: square corners, a 2px white rule, a printed grid, maximum contrast, zero decoration.
  monolith: theme('monolith', 'Monolith', 'مونولیت', monolithPalette, {
    radius: 0, borderWidth: 2, texture: 'grid', uppercaseLabels: true,
    innerBorder: true, cornerOrnaments: false, panelOpacity: 0.88,
  }, 'diamonds'),
}

/** Gallery order: the four presets as offered in the editor. */
export const THEME_ORDER: ThemeId[] = ['obsidian', 'nocturne', 'aurora', 'monolith']

export const DEFAULT_THEME: OverlayTheme = THEMES.obsidian

/**
 * Where each retired theme goes. Thorn & Rose has no replacement that pretends to be botanical, so saved
 * overlays land on Obsidian, which keeps their composition, widgets and text intact with a neutral stage.
 */
export const LEGACY_THEME_MAP: Record<LegacyThemeId, ThemeId> = {
  'royal-persian': 'obsidian',
  'persian-turquoise': 'aurora',
  'imperial-night': 'monolith',
  'minimal-esports': 'obsidian',
  'thorn-rose': 'obsidian',
}

export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(THEMES, id)
}

export function isLegacyThemeId(id: unknown): id is LegacyThemeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_THEME_MAP, id)
}

/** Resolve any stored theme id, including one saved before CP20, to a live preset id. */
export function migrateThemeId(id: unknown): ThemeId {
  if (isThemeId(id)) return id
  if (isLegacyThemeId(id)) return LEGACY_THEME_MAP[id]
  return DEFAULT_THEME.id
}

/**
 * Themes the app exposes on the canvas stage and the runtime as CSS custom properties, so both surfaces read
 * one source. The flat vars keep older widgets working; the palette vars are what new styling should use.
 */
export function themeCssVars(input: OverlayTheme | ThemeId | string | null | undefined): Record<string, string> {
  const t = typeof input === 'object' && input ? input : getTheme(typeof input === 'string' ? input : undefined)
  return {
    '--theme-surface': t.palette.surface.base,
    '--theme-surface-raised': t.palette.surface.raised,
    '--theme-surface-sunken': t.palette.surface.sunken,
    '--theme-accent': t.palette.accent.base,
    '--theme-accent-soft': t.palette.accent.soft,
    '--theme-accent-strong': t.palette.accent.strong,
    '--theme-primary': t.primary,
    '--theme-border': t.palette.border.hairline,
    '--theme-border-strong': t.palette.border.strong,
    '--theme-text': t.palette.text.primary,
    '--theme-text-secondary': t.palette.text.secondary,
    '--theme-muted': t.palette.text.muted,
    '--theme-glow': t.palette.depth.glow,
    '--theme-radius': `${t.chrome.radius}px`,
    '--theme-border-width': `${t.chrome.borderWidth}px`,
  }
}

export const baseDecoration: ElementDecoration = {
  enabled: true,
  preset: 'royal-panel',
  inheritTheme: true,
  borderVisible: true,
  borderWidth: 1,
  borderColor: '#cfd2d6',
  borderOpacity: 1,
  radius: 6,
  innerBorder: false,
  innerBorderColor: '#eef0f2',
  innerBorderOpacity: 0.3,
  cornerOrnaments: false,
  separator: false,
  backgroundColor: '#0e0f11',
  backgroundOpacity: 0.66,
  gradient: true,
  pattern: 'none',
  shadow: true,
  glow: false,
  highlight: false,
  padding: 18,
}

/**
 * Decoration presets are geometry only: colour and material come from the theme, so a preset cannot drag a
 * retired identity back in. Ids are kept for saved data; `thorn-vine` survives as a plain framed panel.
 */
export const DECORATION_PRESETS: Record<DecorationPresetId, ElementDecoration> = {
  none: { ...baseDecoration, enabled: false, preset: 'none', borderVisible: false, innerBorder: false, cornerOrnaments: false, backgroundOpacity: 0, gradient: false, pattern: 'none', shadow: false, glow: false, highlight: false, padding: 0 },
  'royal-panel': { ...baseDecoration, preset: 'royal-panel' },
  'turquoise-panel': { ...baseDecoration, preset: 'turquoise-panel', borderWidth: 1, radius: 14, innerBorder: true, separator: true },
  'imperial-card': { ...baseDecoration, preset: 'imperial-card', borderWidth: 2, radius: 0, innerBorder: true },
  'esports-line': { ...baseDecoration, preset: 'esports-line', borderWidth: 1, radius: 8, innerBorder: false, gradient: false, pattern: 'none', padding: 14 },
  'ornamental-frame': { ...baseDecoration, preset: 'ornamental-frame', backgroundOpacity: 0, borderWidth: 6, innerBorder: true, padding: 8 },
  // Legacy id kept loadable: renders as a clean framed panel with a wider inset, no botanical art.
  'thorn-vine': { ...baseDecoration, preset: 'thorn-vine', borderWidth: 1, radius: 14, innerBorder: false, pattern: 'none', backgroundOpacity: 0.7, padding: 22 },
}

/**
 * Presets offered in the inspector, in a deliberate order. CP40: this list and the labels are the only source the
 * select reads, so a preset cannot exist in the registry and be missing from the UI again (thorn-vine was).
 */
export const DECORATION_PRESET_ORDER: DecorationPresetId[] = ['royal-panel', 'turquoise-panel', 'imperial-card', 'esports-line', 'ornamental-frame', 'thorn-vine']

export const DECORATION_PRESET_LABELS: Record<DecorationPresetId, string> = {
  none: 'None',
  'royal-panel': 'Royal panel',
  'turquoise-panel': 'Turquoise panel',
  'imperial-card': 'Imperial card',
  'esports-line': 'Minimal esports',
  'ornamental-frame': 'Ornamental frame',
  'thorn-vine': 'Vine inset',
}

export function createDecoration(preset: DecorationPresetId = 'royal-panel'): ElementDecoration {
  return structuredClone(DECORATION_PRESETS[preset] ?? DECORATION_PRESETS['royal-panel'])
}

/** Resolve any stored theme id to its live preset. */
export function getTheme(id?: string | null): OverlayTheme {
  return THEMES[migrateThemeId(id)] ?? DEFAULT_THEME
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
 * `none` preset, so flipping `enabled` alone used to leave a 0px border with no ornaments: a toggle that
 * looked broken. Enabling an empty preset adopts the default panel, while a customised frame keeps its own.
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
    borderColor: theme.palette.accent.base,
    innerBorderColor: theme.palette.accent.soft,
    backgroundColor: theme.palette.surface.base,
    radius: theme.chrome.radius,
    borderWidth: theme.chrome.borderWidth,
    innerBorder: theme.chrome.innerBorder,
    cornerOrnaments: theme.chrome.cornerOrnaments,
    backgroundOpacity: theme.chrome.panelOpacity,
    pattern: decoration.pattern === 'none' ? 'none' : theme.pattern,
  }
}
