/**
 * CP23 Typography Studio: the single source of truth for type in Obsidian Overlay Studio.
 *
 * Everything a text run needs lives here: the curated family registry, the normalisation that keeps old overlays
 * working, the eight presets, and one style builder that the editor and the OBS runtime both call. That last point
 * is the whole reason this module exists: if the editor builds its own inline style, the two surfaces drift, and a
 * streamer finds out on air.
 */
import type { CSSProperties } from 'react'

import { NUMERIC_RANGES } from './propRanges'

export type FontScript = 'latin' | 'arabic'
export type FontKind = 'sans' | 'geometric' | 'condensed' | 'display' | 'editorial' | 'headline' | 'mono' | 'persian' | 'multilingual' | 'system'

export interface FontFamily {
  /** Stable id stored in element props. Never rename: old overlays point at it. */
  id: string
  /** CSS family name, matching the @font-face rules in src/styles/fonts.css. */
  cssName: string
  label: string
  kind: FontKind
  /** Weights that actually ship as files. The weight picker only offers these. */
  weights: number[]
  scripts: FontScript[]
  /** Families without Arabic coverage still render Persian through the glyph fallback, which is stated in the UI. */
  arabic: boolean
  license: string
  source: string
  /** A short line in the family's own voice, shown in the library list. */
  sample: string
}

const OFL = 'SIL OFL 1.1'

export const FONT_FAMILIES: FontFamily[] = [
  {
    id: 'inter', cssName: 'Inter', label: 'Inter', kind: 'sans', weights: [400, 500, 700, 800], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/inter (rsms/inter)',
    sample: 'Sharp interface text that stays legible at stream scale',
  },
  {
    id: 'manrope', cssName: 'Manrope', label: 'Manrope', kind: 'geometric', weights: [400, 700, 800], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/manrope (sharanda/manrope)',
    sample: 'Round geometric forms for soft, modern captions',
  },
  {
    id: 'space-grotesk', cssName: 'Space Grotesk', label: 'Space Grotesk', kind: 'geometric', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/space-grotesk (floriankarsten)',
    sample: 'Technical geometry with a distinctive lowercase g',
  },
  {
    id: 'bebas-neue', cssName: 'Bebas Neue', label: 'Bebas Neue', kind: 'condensed', weights: [400], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/bebas-neue (dharmatype)',
    sample: 'Tall condensed capitals built for headlines',
  },
  {
    id: 'oswald', cssName: 'Oswald', label: 'Oswald', kind: 'condensed', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/oswald (vernonadams)',
    sample: 'Narrow newsroom voice that fits long titles',
  },
  {
    id: 'archivo-black', cssName: 'Archivo Black', label: 'Archivo Black', kind: 'headline', weights: [400], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/archivo-black (omnibus-type)',
    sample: 'HEAVY HEADLINE WEIGHT FOR HYPE MOMENTS',
  },
  {
    id: 'playfair-display', cssName: 'Playfair Display', label: 'Playfair Display', kind: 'editorial', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/playfair-display (clauseggers)',
    sample: 'Editorial serif with high-contrast strokes',
  },
  {
    id: 'jetbrains-mono', cssName: 'JetBrains Mono', label: 'JetBrains Mono', kind: 'mono', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/jetbrains-mono (jetbrains)',
    sample: 'const uptime = "04:12:33" // aligned digits',
  },
  {
    id: 'vazirmatn', cssName: 'Vazirmatn', label: 'Vazirmatn', kind: 'persian', weights: [400, 700], scripts: ['latin', 'arabic'],
    arabic: true, license: OFL, source: '@fontsource/vazirmatn (rastikerdar)',
    sample: 'به استریم من خوش آمدید',
  },
  {
    id: 'estedad', cssName: 'Estedad', label: 'Estedad', kind: 'persian', weights: [400, 700], scripts: ['latin', 'arabic'],
    arabic: true, license: OFL, source: '@fontsource/estedad (aminabedi68)',
    sample: 'امشب با هم بازی می‌کنیم',
  },
  {
    id: 'noto-sans-arabic', cssName: 'Noto Sans Arabic', label: 'Noto Sans Arabic', kind: 'multilingual', weights: [400, 700], scripts: ['latin', 'arabic'],
    arabic: true, license: OFL, source: '@fontsource/noto-sans-arabic (googlefonts)',
    sample: ' multilingual ‏نص عربي متعدد اللغات',
  },
  {
    id: 'anton', cssName: 'Anton', label: 'Anton', kind: 'display', weights: [400], scripts: ['latin'],
    arabic: false, license: OFL, source: '@fontsource/anton (vernonadams)',
    sample: 'TALL NARROW HEADLINES THAT SHOUT',
  },
  {
    id: 'cairo', cssName: 'Cairo', label: 'Cairo', kind: 'multilingual', weights: [400, 700], scripts: ['latin', 'arabic'],
    arabic: true, license: OFL, source: '@fontsource/cairo (googlefonts)',
    sample: 'نص عربي وهندسة لاتينية',
  },
  // System faces stay selectable so overlays authored before CP23 keep looking exactly as their author left them.
  {
    id: 'system-sans', cssName: 'Arial', label: 'Arial (system)', kind: 'system', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: 'System font', source: 'operating system', sample: 'Always available, never downloaded',
  },
  {
    id: 'system-serif', cssName: 'Georgia', label: 'Georgia (system)', kind: 'system', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: 'System font', source: 'operating system', sample: 'System serif fallback',
  },
  {
    id: 'system-rounded', cssName: 'Tahoma', label: 'Tahoma (system)', kind: 'system', weights: [400, 700], scripts: ['latin', 'arabic'],
    arabic: true, license: 'System font', source: 'operating system', sample: 'گزینه‌ی همیشه در دسترس',
  },
  {
    id: 'monospace', cssName: 'monospace', label: 'Monospace (system)', kind: 'system', weights: [400, 700], scripts: ['latin'],
    arabic: false, license: 'System font', source: 'operating system', sample: 'fixed 8px  advance width',
  },
]

/** Every family ships a real fallback chain, so a failed download degrades to a related face, never to nothing. */
const FALLBACKS: Record<FontScript, string> = {
  latin: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  arabic: "'Vazirmatn', 'Tahoma', sans-serif",
}

export const DEFAULT_FONT_ID = 'inter'

export function findFont(value: unknown): FontFamily | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const needle = value.trim()
  const lower = needle.toLowerCase()
  return FONT_FAMILIES.find((font) => font.id === lower)
    ?? FONT_FAMILIES.find((font) => font.cssName.toLowerCase() === lower)
    ?? FONT_FAMILIES.find((font) => lower.split(',')[0].trim().replace(/['"]/g, '') === font.cssName.toLowerCase())
}

/** Resolves any stored value, including a legacy hand-written stack, to a family id. */
export function resolveFontId(value: unknown): string {
  return findFont(value)?.id ?? DEFAULT_FONT_ID
}

/**
 * The CSS stack for a stored value. Persian-capable families lead with themselves and fall back to Vazirmatn for
 * glyphs they do not carry; Latin-only families do the same in reverse. This is per-glyph fallback, which is the
 * correct Unicode behaviour and the reason mixed text does not need special handling anywhere else.
 */
export function fontStack(value: unknown): string {
  const font = findFont(value)
  if (!font) return `'Inter', ${FALLBACKS.latin}`
  if (font.kind === 'system') return `${font.cssName}, ${FALLBACKS.latin}`
  return font.arabic
    ? `'${font.cssName}', ${FALLBACKS.arabic}`
    : `'${font.cssName}', 'Vazirmatn', ${FALLBACKS.latin}`
}

export function isFontMissing(value: unknown): boolean {
  const font = findFont(value)
  // A family the registry does not know is honestly reported as missing rather than quietly swapped.
  return typeof value === 'string' && value.trim().length > 0 && !font
}

export type TextDirection = 'auto' | 'ltr' | 'rtl'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'center' | 'bottom'
export type TextOverflow = 'clip' | 'ellipsis' | 'visible'
export type TextWrap = 'wrap' | 'nowrap'

export interface TypographyProps {
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
  textAlign: TextAlign
  color: string
  textOpacity: number
  direction: TextDirection
  verticalAlign: VerticalAlign
  wrap: TextWrap
  overflow: TextOverflow
  maxLines: number
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textDecoration: 'none' | 'underline' | 'line-through'
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
  glowEnabled: boolean
  glowColor: string
  glowBlur: number
}

export const TYPOGRAPHY_DEFAULTS: TypographyProps = {
  fontFamily: DEFAULT_FONT_ID,
  fontWeight: 700,
  fontStyle: 'normal',
  fontSize: 52,
  lineHeight: 1.3,
  letterSpacing: 0,
  textAlign: 'right',
  color: '#f6f6f4',
  textOpacity: 1,
  direction: 'auto',
  verticalAlign: 'top',
  wrap: 'wrap',
  overflow: 'clip',
  maxLines: 0,
  textTransform: 'none',
  textDecoration: 'none',
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 18,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  strokeEnabled: false,
  strokeColor: '#000000',
  strokeWidth: 2,
  glowEnabled: false,
  glowColor: '#ffffff',
  glowBlur: 16,
}

export const TYPOGRAPHY_KEYS = Object.keys(TYPOGRAPHY_DEFAULTS) as (keyof TypographyProps)[]

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback

const color = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim()) ? value.trim() : fallback

const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback

/**
 * Fills only what is absent. A saved overlay that already carries `fontFamily: 'Vazirmatn, Tahoma, sans-serif'` keeps
 * that string verbatim, so normalisation can run on every load without repainting anyone's existing type.
 */
type Props = Record<string, unknown>

export function normalizeTypography<T extends Props>(props: T): T {
  const draft = props as Props
  const next: Props = { ...draft }
  const d = TYPOGRAPHY_DEFAULTS

  if (typeof next.fontFamily !== 'string' || !next.fontFamily.trim()) next.fontFamily = d.fontFamily
  if (next.fontWeight === undefined) next.fontWeight = d.fontWeight
  if (next.fontStyle === undefined) next.fontStyle = pick(next.fontStyle, ['normal', 'italic'], d.fontStyle)
  if (next.fontSize === undefined) next.fontSize = d.fontSize
  if (next.lineHeight === undefined) next.lineHeight = d.lineHeight
  if (next.letterSpacing === undefined) next.letterSpacing = d.letterSpacing
  if (next.textAlign === undefined) next.textAlign = d.textAlign
  if (next.color === undefined) next.color = d.color
  if (next.textOpacity === undefined) next.textOpacity = d.textOpacity
  if (next.direction === undefined) next.direction = d.direction
  if (next.verticalAlign === undefined) next.verticalAlign = d.verticalAlign
  if (next.wrap === undefined) next.wrap = d.wrap
  if (next.overflow === undefined) next.overflow = d.overflow
  if (next.maxLines === undefined) next.maxLines = d.maxLines
  if (next.textTransform === undefined) next.textTransform = d.textTransform
  if (next.textDecoration === undefined) next.textDecoration = d.textDecoration
  if (next.shadowEnabled === undefined) next.shadowEnabled = d.shadowEnabled
  if (next.shadowColor === undefined) next.shadowColor = d.shadowColor
  if (next.shadowBlur === undefined) next.shadowBlur = d.shadowBlur
  if (next.shadowOffsetX === undefined) next.shadowOffsetX = d.shadowOffsetX
  if (next.shadowOffsetY === undefined) next.shadowOffsetY = d.shadowOffsetY
  if (next.strokeEnabled === undefined) next.strokeEnabled = d.strokeEnabled
  if (next.strokeColor === undefined) next.strokeColor = d.strokeColor
  if (next.strokeWidth === undefined) next.strokeWidth = d.strokeWidth
  if (next.glowEnabled === undefined) next.glowEnabled = d.glowEnabled
  if (next.glowColor === undefined) next.glowColor = d.glowColor
  if (next.glowBlur === undefined) next.glowBlur = d.glowBlur
  // CP39: the studio already clamps on read, so an impossible stored value rendered fine and stayed in the file.
  // Clamping here means what is saved is what the inspector can show again, with the same bands.
  for (const key of ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const) {
    const band = NUMERIC_RANGES[key]
    const value = next[key]
    if (band && typeof value === 'number') next[key] = Math.min(band[1], Math.max(band[0], Number.isFinite(value) ? value : band[0]))
  }
  return next as T
}

/** Reads a stored element's props as typed typography, clamping junk to something renderable. */
export function readTypography(props: Record<string, unknown>): TypographyProps {
  const d = TYPOGRAPHY_DEFAULTS
  const fontId = resolveFontId(props.fontFamily)
  const family = findFont(fontId)
  const weight = clampNumber(props.fontWeight, 100, 900, d.fontWeight)
  return {
    fontFamily: fontId,
    // A weight the family does not ship would make the browser synthesise a fake bold, so it snaps to the closest real one.
    fontWeight: family ? nearestWeight(family, weight) : weight,
    fontStyle: pick(props.fontStyle, ['normal', 'italic'], d.fontStyle),
    fontSize: clampNumber(props.fontSize, 4, 400, d.fontSize),
    lineHeight: clampNumber(props.lineHeight, 0.6, 4, d.lineHeight),
    letterSpacing: clampNumber(props.letterSpacing, -40, 80, d.letterSpacing),
    textAlign: pick(props.textAlign, ['left', 'center', 'right', 'justify'], d.textAlign),
    color: color(props.color, d.color),
    textOpacity: clampNumber(props.textOpacity, 0, 1, d.textOpacity),
    direction: pick(props.direction, ['auto', 'ltr', 'rtl'], d.direction),
    verticalAlign: pick(props.verticalAlign, ['top', 'center', 'bottom'], d.verticalAlign),
    wrap: pick(props.wrap, ['wrap', 'nowrap'], d.wrap),
    overflow: pick(props.overflow, ['clip', 'ellipsis', 'visible'], d.overflow),
    maxLines: clampNumber(props.maxLines, 0, 20, d.maxLines),
    textTransform: pick(props.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'], d.textTransform),
    textDecoration: pick(props.textDecoration, ['none', 'underline', 'line-through'], d.textDecoration),
    shadowEnabled: bool(props.shadowEnabled, d.shadowEnabled),
    shadowColor: color(props.shadowColor, d.shadowColor),
    shadowBlur: clampNumber(props.shadowBlur, 0, 100, d.shadowBlur),
    shadowOffsetX: clampNumber(props.shadowOffsetX, -50, 50, d.shadowOffsetX),
    shadowOffsetY: clampNumber(props.shadowOffsetY, -50, 50, d.shadowOffsetY),
    strokeEnabled: bool(props.strokeEnabled, d.strokeEnabled),
    strokeColor: color(props.strokeColor, d.strokeColor),
    strokeWidth: clampNumber(props.strokeWidth, 0, 20, d.strokeWidth),
    glowEnabled: bool(props.glowEnabled, d.glowEnabled),
    glowColor: color(props.glowColor, d.glowColor),
    glowBlur: clampNumber(props.glowBlur, 0, 80, d.glowBlur),
  }
}

export function nearestWeight(family: FontFamily, wanted: number): number {
  return family.weights.reduce((best, weight) => Math.abs(weight - wanted) < Math.abs(best - wanted) ? weight : best, family.weights[0])
}

function effects(t: TypographyProps): string | undefined {
  const layers: string[] = []
  if (t.glowEnabled) layers.push(`0 0 ${t.glowBlur}px ${t.glowColor}`)
  if (t.shadowEnabled) layers.push(`${t.shadowOffsetX}px ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}`)
  return layers.length ? layers.join(', ') : undefined
}

/**
 * The composable text style. Editor and runtime both call this and nothing else, so font, weight, size, spacing,
 * direction, alignment, shadow, stroke and glow cannot disagree between the two surfaces.
 */
export function typographyStyle(props: Record<string, unknown>): CSSProperties {
  const t = readTypography(props)
  const font = findFont(t.fontFamily)
  return {
    fontFamily: fontStack(t.fontFamily),
    fontWeight: t.fontWeight,
    fontStyle: t.fontStyle,
    fontSize: `${t.fontSize}px`,
    lineHeight: t.lineHeight,
    letterSpacing: `${t.letterSpacing}px`,
    textAlign: t.textAlign,
    color: t.color,
    opacity: t.textOpacity,
    // 'auto' is expressed through the dir attribute (first-strong-character detection), not this property.
    ...(t.direction === 'auto' ? {} : { direction: t.direction }),
    textTransform: t.textTransform,
    textDecoration: t.textDecoration,
    whiteSpace: t.wrap === 'nowrap' ? 'pre' : 'pre-wrap',
    overflowWrap: t.wrap === 'nowrap' ? 'normal' : 'break-word',
    textShadow: effects(t),
    // paint-order keeps the stroke behind the fill so a heavy outline never eats thin counters.
    ...(t.strokeEnabled && t.strokeWidth > 0
      ? { WebkitTextStrokeWidth: `${t.strokeWidth}px`, WebkitTextStrokeColor: t.strokeColor, paintOrder: 'stroke fill' as const }
      : {}),
    // Hyphenation is off: stream text is short, and auto hyphenation changes line breaks between surfaces.
    hyphens: 'none',
    fontKerning: 'normal',
    fontSynthesis: font && font.kind !== 'system' ? 'none' : 'weight style',
  }
}

/** Box behaviour: vertical alignment, wrapping and overflow. Separate from the paint style on purpose. */
export function textBoxStyle(props: Record<string, unknown>): CSSProperties {
  const t = readTypography(props)
  const clamp = t.maxLines > 0
  return {
    display: clamp ? '-webkit-box' : 'flex',
    flexDirection: 'column',
    justifyContent: t.verticalAlign === 'center' ? 'center' : t.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    alignItems: t.textAlign === 'center' ? 'center' : t.textAlign === 'right' ? 'flex-end' : 'flex-start',
    ...(clamp ? { WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: t.maxLines, overflow: 'hidden' } : {}),
    overflow: t.overflow === 'visible' ? 'visible' : 'hidden',
    textOverflow: t.overflow === 'ellipsis' ? 'ellipsis' : 'clip',
    ...(t.wrap === 'nowrap' && t.overflow !== 'visible' ? { whiteSpace: 'nowrap' as const } : {}),
  }
}

export interface TypographyPreset {
  id: string
  name: string
  description: string
  /** Typography only. Applying a preset can never move, resize, retype or re-animate an element. */
  props: Partial<TypographyProps>
}

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: 'cinematic-headline', name: 'Cinematic Headline',
    description: 'Condensed capitals, tight leading, deep shadow for trailer cards',
    props: {
      fontFamily: 'bebas-neue', fontWeight: 400, fontSize: 104, lineHeight: 0.95, letterSpacing: 4,
      textAlign: 'center', textTransform: 'uppercase', shadowEnabled: true, shadowColor: '#000000', shadowBlur: 28,
      shadowOffsetX: 0, shadowOffsetY: 6, verticalAlign: 'center', maxLines: 3,
    },
  },
  {
    id: 'stream-title', name: 'Stream Title',
    description: 'Heavy neo-grotesque with negative tracking, the default for a stream name',
    props: {
      fontFamily: 'inter', fontWeight: 800, fontSize: 64, lineHeight: 1.08, letterSpacing: -1.4,
      textAlign: 'left', textTransform: 'none', shadowEnabled: true, shadowColor: '#000000', shadowBlur: 20,
      shadowOffsetX: 0, shadowOffsetY: 3, verticalAlign: 'center', maxLines: 2,
    },
  },
  {
    id: 'compact-label', name: 'Compact Label',
    description: 'Wide-tracked small capitals for tags, BRB strips and category chips',
    props: {
      fontFamily: 'inter', fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: 6,
      textAlign: 'center', textTransform: 'uppercase', shadowEnabled: false, verticalAlign: 'center', maxLines: 1,
    },
  },
  {
    id: 'bold-gaming', name: 'Bold Gaming',
    description: 'Black weight with a hard outline, readable over bright gameplay',
    props: {
      fontFamily: 'archivo-black', fontWeight: 400, fontSize: 76, lineHeight: 1.02, letterSpacing: 0,
      textAlign: 'center', textTransform: 'uppercase', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 4,
      shadowEnabled: true, shadowColor: '#000000', shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 0,
      verticalAlign: 'center', maxLines: 3,
    },
  },
  {
    id: 'editorial', name: 'Editorial',
    description: 'High-contrast serif for schedules, quotes and credits',
    props: {
      fontFamily: 'playfair-display', fontWeight: 700, fontSize: 58, lineHeight: 1.24, letterSpacing: 0,
      textAlign: 'left', textTransform: 'none', shadowEnabled: false, verticalAlign: 'top', maxLines: 0,
    },
  },
  {
    id: 'minimal-information', name: 'Minimal Information',
    description: 'Quiet geometric sans at reading size for schedules and rules',
    props: {
      fontFamily: 'manrope', fontWeight: 400, fontSize: 30, lineHeight: 1.5, letterSpacing: 0.2,
      textAlign: 'left', textTransform: 'none', shadowEnabled: false, verticalAlign: 'top', maxLines: 0,
    },
  },
  {
    id: 'persian-display', name: 'Persian Display',
    description: 'Vazirmatn bold with right-to-left flow and generous leading for Persian',
    props: {
      fontFamily: 'vazirmatn', fontWeight: 700, fontSize: 62, lineHeight: 1.55, letterSpacing: 0,
      textAlign: 'right', direction: 'rtl', textTransform: 'none', shadowEnabled: true, shadowColor: '#000000',
      shadowBlur: 16, shadowOffsetX: 0, shadowOffsetY: 3, verticalAlign: 'top', maxLines: 0,
    },
  },
  {
    id: 'monospace-technical', name: 'Monospace Technical',
    description: 'Tabular mono for timers, counters and system readouts',
    props: {
      fontFamily: 'jetbrains-mono', fontWeight: 400, fontSize: 32, lineHeight: 1.4, letterSpacing: 0.5,
      textAlign: 'left', textTransform: 'none', shadowEnabled: false, verticalAlign: 'center', maxLines: 1,
    },
  },
]

export function getPreset(id: string): TypographyPreset | undefined {
  return TYPOGRAPHY_PRESETS.find((preset) => preset.id === id)
}

/**
 * Applies a preset's typography keys and nothing else. Text, position, size, animation, decoration and every
 * unrelated prop pass through untouched, which is what the geometry-preservation test pins down.
 */
export function applyPreset(props: Record<string, unknown>, presetId: string): Record<string, unknown> {
  const preset = getPreset(presetId)
  if (!preset) return { ...props }
  const next = { ...props }
  for (const key of Object.keys(preset.props) as (keyof TypographyProps)[]) {
    next[key] = preset.props[key]
  }
  return next
}

/**
 * Reset returns typography keys at their defaults and nothing else. The panel applies props key by key, so the
 * author's words, position, size and animation survive a reset untouched.
 */
export function resetTypography(): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of TYPOGRAPHY_KEYS) patch[key] = TYPOGRAPHY_DEFAULTS[key]
  return patch
}

export interface FontReadiness { family: string; status: 'ready' | 'loading' | 'fallback'; }

/**
 * Reports whether a face is actually available. `document.fonts.check` is cheap and synchronous once the face is
 * registered, so the studio can say "Fallback in use" instead of pretending a broken family rendered.
 */
export function checkFont(fontId: string, weight?: number): FontReadiness {
  const font = findFont(fontId)
  if (!font) return { family: fontId, status: 'fallback' }
  if (font.kind === 'system' || typeof document === 'undefined' || !document.fonts) {
    return { family: font.cssName, status: 'ready' }
  }
  const w = weight ?? font.weights[0]
  const label = `${w} 16px '${font.cssName}'`
  const ready = document.fonts.check(label, font.arabic ? 'آ' : 'Aa')
  return { family: font.cssName, status: ready ? 'ready' : 'loading' }
}

/** Warms one face on demand, so opening the library does not download twelve families. */
export async function loadFont(fontId: string, weight?: number): Promise<boolean> {
  const font = findFont(fontId)
  if (!font || font.kind === 'system' || typeof document === 'undefined' || !document.fonts) return true
  const w = weight ?? font.weights[0]
  try {
    await document.fonts.load(`${w} 16px '${font.cssName}'`, font.arabic ? 'آ Aa' : 'Aa')
    return document.fonts.check(`${w} 16px '${font.cssName}'`, font.arabic ? 'آ' : 'Aa')
  } catch {
    return false
  }
}

/** The families the studio shows, filtered by the library search box. */
export function searchFonts(query: string, list: FontFamily[] = FONT_FAMILIES): FontFamily[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return list
  return list.filter((font) =>
    font.label.toLowerCase().includes(needle)
    || font.kind.toLowerCase().includes(needle)
    || font.scripts.some((script) => script.includes(needle))
    || font.sample.toLowerCase().includes(needle),
  )
}
