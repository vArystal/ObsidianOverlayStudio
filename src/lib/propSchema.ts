/**
 * CP39 — one normalisation policy for element props.
 *
 * Before this file, only containers and text were coerced, so a hand-edited snapshot could carry `fontSize: 1e9`,
 * `duration: -5` or an enum value no renderer knew. Everything else reached the canvas verbatim. The registry is
 * the single source of truth for what a prop *is*: type, range, allowed values and default all come from the
 * widget definition plus the small tables below, so a new widget is validated the moment it is declared.
 */
import type { WidgetDefinition } from './widgets'

export type PropType = 'number' | 'string' | 'color' | 'boolean' | 'enum'

export interface PropSpec {
  type: PropType
  min?: number
  max?: number
  values?: readonly string[]
  default: unknown
}

export { ENUM_VALUES, NUMERIC_RANGES } from './propRanges'
import { ENUM_VALUES, NUMERIC_RANGES } from './propRanges'

const MAX_TEXT = 2_000
// A data URL is legitimately large; the publish budget, not the string policy, is what bounds it.
const MAX_DATA = 2_000_000
const textLimit = (key: string) => (/src$|url$|links?$|href$/i.test(key) ? MAX_DATA : MAX_TEXT)

export const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export const safeString = (value: unknown, fallback: string, max = MAX_TEXT): string =>
  typeof value === 'string' ? value.slice(0, max) : fallback

const HEX = /^#[0-9a-f]{6}$/i
export const safeColor = (value: unknown, fallback: string): string => (typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : fallback)

const specFor = (key: string, fallback: unknown): PropSpec => {
  const range = NUMERIC_RANGES[key]
  if (typeof fallback === 'number') return { type: 'number', min: range?.[0] ?? -1_000_000, max: range?.[1] ?? 1_000_000, default: fallback }
  if (typeof fallback === 'boolean') return { type: 'boolean', default: fallback }
  if (ENUM_VALUES[key]) return { type: 'enum', values: ENUM_VALUES[key], default: fallback }
  if (/color/i.test(key)) return { type: 'color', default: fallback }
  return { type: 'string', default: fallback }
}

/** Validates one value against its spec. Exported because animation, decorations and templates reuse it. */
export function normaliseBySpec(value: unknown, spec: PropSpec): unknown {
  switch (spec.type) {
    case 'number': return clampNumber(value, spec.min ?? -1_000_000, spec.max ?? 1_000_000, Number(spec.default))
    case 'boolean': return typeof value === 'boolean' ? value : Boolean(spec.default)
    case 'enum': return typeof value === 'string' && (spec.values ?? []).includes(value) ? value : spec.default
    case 'color': return safeColor(value, String(spec.default))
    default: return safeString(value, String(spec.default), textLimit(''))
  }
}

/**
 * Normalises the props of a registry widget. Declared keys follow their spec; keys a definition does not declare
 * are kept (a newer build may have written them) but bounded, so nothing unusable survives a round trip.
 */
export function normalizeWidgetProps(definition: WidgetDefinition, props: unknown): Record<string, unknown> {
  const incoming = props && typeof props === 'object' ? props as Record<string, unknown> : {}
  const out: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(definition.defaults)) {
    out[key] = normaliseBySpec(incoming[key] === undefined ? fallback : incoming[key], specFor(key, fallback))
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (key in out) continue
    // A key the definition does not name can still be one the shared tables know (a data source, a colour), so the
    // global vocabulary applies before the generic bounds do.
    const shared = ENUM_VALUES[key]
    if (shared) out[key] = typeof value === 'string' && shared.includes(value) ? value : shared[0]
    else if (typeof value === 'number') out[key] = clampNumber(value, -1_000_000, 1_000_000, 0)
    else if (typeof value === 'string') out[key] = key.toLowerCase().includes('color') ? safeColor(value, '#f6f6f4') : safeString(value, '', textLimit(key))
    else if (typeof value === 'boolean') out[key] = value
    else if (value && typeof value === 'object') out[key] = value
  }
  return out
}

/**
 * The same policy for props no registry widget declares: shapes, frames, images, capture guides. There are no
 * defaults to merge, so every incoming key is bounded in place instead of being dropped.
 */
export function normalizeLooseProps(props: unknown): Record<string, unknown> {
  if (!props || typeof props !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    const shared = ENUM_VALUES[key]
    const band = NUMERIC_RANGES[key]
    if (shared) out[key] = typeof value === 'string' && shared.includes(value) ? value : shared[0]
    else if (typeof value === 'number') out[key] = clampNumber(value, band?.[0] ?? -1_000_000, band?.[1] ?? 1_000_000, band?.[0] ?? 0)
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string') out[key] = key.toLowerCase().includes('color') ? safeColor(value, '#f6f6f4') : safeString(value, '', textLimit(key))
    else if (value && typeof value === 'object') out[key] = value
  }
  return out
}

/** One place for the animation block: every field is clamped to the range the inspector can present again. */
export function normaliseAnimationValues<T extends Record<string, unknown>>(animation: T): T {
  const types = ['none', 'fade', 'slide', 'scale', 'pop', 'ornamental']
  const exits = ['none', 'fade', 'slide', 'scale', 'pop', 'ornamental']
  const idles = ['none', 'shimmer', 'glow', 'float', 'sparkle']
  const directions = ['up', 'down', 'left', 'right']
  const easings = ['ease', 'ease-out', 'ease-in-out', 'linear']
  const reduced = ['respect', 'static']
  const pick = (value: unknown, values: string[], fallback: string) => (typeof value === 'string' && values.includes(value) ? value : fallback)
  return {
    ...animation,
    type: pick(animation.type, types, 'fade'),
    exit: pick(animation.exit, exits, 'none'),
    idle: pick(animation.idle, idles, 'none'),
    direction: pick(animation.direction, directions, 'up'),
    easing: pick(animation.easing, easings, 'ease-out'),
    reducedMotion: pick(animation.reducedMotion, reduced, 'respect'),
    duration: clampNumber(animation.duration, 0, 10_000, 420),
    exitDuration: clampNumber(animation.exitDuration, 0, 10_000, 320),
    delay: clampNumber(animation.delay, 0, 10_000, 0),
    intensity: clampNumber(animation.intensity, 0, 1, 1),
    holdDuration: clampNumber(animation.holdDuration, 0, 60_000, 4500),
  } as T
}
