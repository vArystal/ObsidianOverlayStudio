import type { BackgroundKind, OverlayBackground, OverlayTheme } from '../types'
import type { MotionConfig, VariantId } from '../motion/types'
import { BASE_LOOK, DEFAULT_VARIANT, LEGACY_KIND_MAP, VARIANTS, VARIANT_BY_ID, isVariantId } from '../motion/catalog'
import { defaultConfig, normaliseMotionConfig } from '../motion/config'

/**
 * The document side of the backdrop.
 *
 * The overlay stores a flat, JSON-friendly record (colours, speed, opacity, seed, variant params) rather than a
 * renderer config, because published snapshots and share links must survive a renderer upgrade. This module is the
 * only place that translates between that record and the motion system's typed `MotionConfig`.
 */

export interface BackgroundPreset {
  kind: VariantId
  label: string
  blurb: string
  /** Generic document fields the variant can use; kept so older UI code and tests still have a contract. */
  controls: Array<'primary' | 'secondary' | 'accent' | 'opacity' | 'speed' | 'intensity' | 'blur' | 'density' | 'scale'>
  defaults: Omit<OverlayBackground, 'kind' | 'enabled' | 'paused'>
}

const ALL_CONTROLS: BackgroundPreset['controls'] = ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'density', 'scale']

function presetDefaults(variant: VariantId): Omit<OverlayBackground, 'kind' | 'enabled' | 'paused'> {
  const definition = VARIANT_BY_ID[variant]
  const preset = definition?.presets[0]
  const config = defaultConfig(variant)
  return {
    primary: preset?.colors[0] ?? config.colors[0],
    secondary: preset?.colors[1] ?? config.colors[1],
    accent: preset?.colors[2] ?? config.colors[2],
    opacity: BASE_LOOK.opacity,
    speed: BASE_LOOK.speed,
    intensity: BASE_LOOK.intensity,
    blur: BASE_LOOK.blur,
    density: BASE_LOOK.density,
    scale: BASE_LOOK.scale,
    params: { ...config.params, ...preset?.params },
    preset: preset?.id ?? 'midnight',
    seed: config.seed,
  }
}

/** The ten variants as gallery entries, in catalog order. */
export const BACKGROUND_PRESETS: BackgroundPreset[] = VARIANTS.map((variant) => ({
  kind: variant.id,
  label: variant.label,
  blurb: variant.description,
  controls: ALL_CONTROLS,
  defaults: presetDefaults(variant.id),
}))

export const DEFAULT_BACKGROUND: OverlayBackground = {
  enabled: false,
  kind: DEFAULT_VARIANT,
  paused: false,
  ...presetDefaults(DEFAULT_VARIANT),
}

/** Accepts a variant id, a legacy scene name or nothing at all. */
export function resolveKind(value: unknown): VariantId {
  if (isVariantId(value)) return value
  if (typeof value === 'string' && LEGACY_KIND_MAP[value]) return LEGACY_KIND_MAP[value]
  return DEFAULT_VARIANT
}

export function presetFor(kind: BackgroundKind | string): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find((preset) => preset.kind === resolveKind(kind))
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

const colour = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback

/**
 * Anything can arrive here: a legacy overlay with no background, a hand-edited snapshot, a stale scene name. Every
 * field is coerced and every variant param is validated against its schema, so the runtime never renders garbage.
 */
export function normalizeBackground(input: unknown): OverlayBackground {
  const raw = (input ?? {}) as Partial<OverlayBackground>
  const kind = resolveKind(raw.kind)
  const fallback = presetDefaults(kind)
  const config = normaliseMotionConfig({
    colors: [colour(raw.primary, fallback.primary), colour(raw.secondary, fallback.secondary), colour(raw.accent, fallback.accent)],
    opacity: clamp(raw.opacity, 0, 1, fallback.opacity),
    speed: clamp(raw.speed, 0.2, 2, fallback.speed),
    intensity: clamp(raw.intensity, 0, 1, fallback.intensity),
    blur: clamp(raw.blur, 0, 80, fallback.blur),
    density: clamp(raw.density, 0, 1, fallback.density),
    scale: clamp(raw.scale, 0.6, 1.6, fallback.scale),
    seed: raw.seed,
    params: raw.params ?? fallback.params,
  }, kind)
  return {
    enabled: raw.enabled === true,
    kind,
    paused: raw.paused === true,
    primary: config.colors[0],
    secondary: config.colors[1],
    accent: config.colors[2],
    opacity: config.opacity,
    speed: clamp(config.speed, 0.2, 2, fallback.speed),
    intensity: config.intensity,
    blur: config.blur,
    density: config.density,
    scale: config.scale,
    params: config.params,
    preset: typeof raw.preset === 'string' && raw.preset ? raw.preset : fallback.preset,
    seed: config.seed,
  }
}

/** Document record -> renderer configuration. */
export function motionConfigFor(background: OverlayBackground): MotionConfig {
  return normaliseMotionConfig({
    colors: [background.primary, background.secondary, background.accent],
    speed: background.speed,
    intensity: background.intensity,
    opacity: background.opacity,
    blur: background.blur,
    density: background.density,
    scale: background.scale,
    seed: background.seed,
    params: background.params,
  }, resolveKind(background.kind))
}

/**
 * The backdrop used to keep whichever palette its scene shipped with, so switching the overlay to Rose & Thorn left a
 * blue-grey aurora behind it. The three scene colours now come from the theme: deep surface for the ground, raised
 * surface for the mass, accent for the light. The variant, its params and its motion are untouched.
 */
export function themeBackground(background: OverlayBackground, theme: OverlayTheme): OverlayBackground {
  return normalizeBackground({
    ...background,
    primary: theme.palette.surface.sunken,
    secondary: theme.palette.surface.raised,
    accent: theme.palette.accent.base,
  })
}

export function isAnimated(background: OverlayBackground, reducedMotion: boolean) {
  return background.enabled && background.kind !== 'none' && !background.paused && !reducedMotion
}
