/**
 * Configuration resolution: one normaliser for the whole system.
 *
 * The overlay document is hand-editable, older than the schema and occasionally carries a number where a string
 * belongs. Everything therefore enters through `normaliseMotionConfig`, which coerces the shared look fields and
 * each variant param against its declared spec. A renderer only ever sees values it can use.
 */
import { BASE_LOOK, VARIANT_BY_ID, DEFAULT_VARIANT } from './catalog'
import type { MotionConfig, ParamSpec, ParamValue, ResolvedParams, VariantId } from './types'
import { clamp, normaliseHex, parseHex, paletteStops, smoothstep } from './utils'

const DEFAULT_COLORS: [string, string, string] = ['#070a12', '#121a2c', '#8fb4ff']

export function specFor(variant: VariantId, key: string): ParamSpec | undefined {
  return VARIANT_BY_ID[variant]?.params.find((spec) => spec.key === key)
}

function coerce(spec: ParamSpec, value: unknown): ParamValue {
  switch (spec.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
      const fallback = Number(spec.default)
      if (!Number.isFinite(n)) return fallback
      return clamp(n, spec.min ?? -1e6, spec.max ?? 1e6)
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : Boolean(spec.default)
    case 'enum':
      return typeof value === 'string' && (spec.values ?? []).includes(value) ? value : spec.default
    default:
      return typeof value === 'string' ? value : spec.default
  }
}

/** Defaults for one variant, already coerced so a renderer can read them without a second pass. */
export function defaultParams(variant: VariantId): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const spec of VARIANT_BY_ID[variant]?.params ?? []) out[spec.key] = spec.default
  return out
}

export function defaultConfig(variant: VariantId = DEFAULT_VARIANT): MotionConfig {
  const preset = VARIANT_BY_ID[variant]?.presets[0]
  return normaliseMotionConfig({
    colors: preset?.colors ?? DEFAULT_COLORS,
    ...BASE_LOOK,
    seed: 20260101,
    params: { ...defaultParams(variant), ...preset?.params },
  }, variant)
}

export function normaliseMotionConfig(input: unknown, variant: VariantId = DEFAULT_VARIANT): MotionConfig {
  const raw = (input ?? {}) as Partial<MotionConfig>
  const fallback = VARIANT_BY_ID[variant]?.presets[0]?.colors ?? DEFAULT_COLORS
  const colors = Array.isArray(raw.colors) ? raw.colors : []
  const params: Record<string, ParamValue> = {}
  const defaults = defaultParams(variant)
  const incoming = (raw.params ?? {}) as Record<string, unknown>
  for (const spec of VARIANT_BY_ID[variant]?.params ?? []) {
    params[spec.key] = incoming[spec.key] === undefined ? defaults[spec.key] : coerce(spec, incoming[spec.key])
  }
  return {
    colors: [
      normaliseHex(colors[0], fallback[0]),
      normaliseHex(colors[1], fallback[1]),
      normaliseHex(colors[2], fallback[2]),
    ],
    speed: clamp(Number(raw.speed ?? BASE_LOOK.speed) || BASE_LOOK.speed, 0.1, 3),
    intensity: clamp(Number(raw.intensity ?? BASE_LOOK.intensity), 0, 1),
    opacity: clamp(Number(raw.opacity ?? BASE_LOOK.opacity), 0, 1),
    blur: clamp(Number(raw.blur ?? BASE_LOOK.blur), 0, 120),
    density: clamp(Number(raw.density ?? BASE_LOOK.density), 0, 1),
    scale: clamp(Number(raw.scale ?? BASE_LOOK.scale), 0.6, 1.6),
    seed: Math.round(clamp(Number(raw.seed ?? 20260101), 0, 2 ** 31)),
    pointer: clamp(Number(raw.pointer ?? BASE_LOOK.pointer), 0, 1),
    grain: clamp(Number(raw.grain ?? BASE_LOOK.grain), 0, 0.2),
    vignette: clamp(Number(raw.vignette ?? BASE_LOOK.vignette), 0, 1),
    params,
  }
}

/** Resolve once per frame so a renderer never parses hex or looks up a spec in its inner loop. */
export function resolveParams(config: MotionConfig, variant: VariantId): ResolvedParams {
  const values = { ...defaultParams(variant), ...config.params }
  const num = (key: string) => {
    const value = values[key]
    return typeof value === 'number' ? value : Number(value) || 0
  }
  return {
    colors: config.colors.map((c) => {
      const { r, g, b } = parseHex(c)
      return [r / 255, g / 255, b / 255]
    }) as ResolvedParams['colors'],
    hex: [...config.colors] as [string, string, string],
    intensity: config.intensity,
    density: config.density,
    scale: config.scale,
    scaleRaw: config.scale,
    seed: config.seed,
    grain: config.grain,
    vignette: config.vignette,
    pointer: config.pointer,
    values,
    num,
    bool: (key) => values[key] === true,
    str: (key) => (typeof values[key] === 'string' ? (values[key] as string) : String(specFor(variant, key)?.default ?? '')),
  }
}

/**
 * The instant paint. Browsers take a frame or two to compile a shader, so the layer shows these CSS layers first and
 * fades the live surface in over them. Same palette, same composition, no layout shift and no empty rectangle.
 */
export function posterCss(config: MotionConfig, variant: VariantId): string {
  const [ground, mid, light] = config.colors
  const stops = paletteStops(config.colors, 4)
  switch (variant) {
    case 'particle-flow':
    case 'deep-space':
      return [
        `radial-gradient(120% 100% at 18% 12%, ${light}22 0%, transparent 55%)`,
        `radial-gradient(90% 80% at 82% 78%, ${mid} 0%, transparent 62%)`,
        `linear-gradient(165deg, ${ground} 0%, ${stops[1]} 62%, ${ground} 100%)`,
      ].join(', ')
    case 'reactive-grid':
    case 'contour-lines':
      return [
        `radial-gradient(80% 70% at 50% 0%, ${light}1f 0%, transparent 70%)`,
        `linear-gradient(180deg, ${mid} 0%, ${ground} 78%)`,
      ].join(', ')
    case 'dither-print':
      return `linear-gradient(155deg, ${mid} 0%, ${ground} 55%, ${light}30 100%)`
    case 'living-patterns':
    case 'css-orbs':
    case 'aurora-mesh':
    case 'liquid-glass':
    case 'fluid-ink':
    default:
      return [
        `radial-gradient(90% 80% at 16% 8%, ${light}2e 0%, transparent 58%)`,
        `radial-gradient(85% 90% at 78% 22%, ${mid} 0%, transparent 62%)`,
        `radial-gradient(120% 100% at 50% 110%, ${stops[2]}22 0%, transparent 70%)`,
        `linear-gradient(160deg, ${stops[0]} 0%, ${ground} 70%)`,
      ].join(', ')
  }
}

/** CSS custom properties for the pure-CSS backend; everything it animates is declared here, never inline. */
export function cssBackendVars(config: MotionConfig, variant: VariantId): Record<string, string> {
  const params = resolveParams(config, variant)
  return {
    '--mb-c0': config.colors[0],
    '--mb-c1': config.colors[1],
    '--mb-c2': config.colors[2],
    '--mb-orbs': String(Math.round(params.num('orbs'))),
    '--mb-softness': `${params.num('blur')}px`,
    '--mb-morph': String(params.num('morph')),
    '--mb-orbit': `${(26 / Math.max(0.2, config.speed * params.num('orbit'))).toFixed(2)}s`,
    '--mb-opacity': String(config.opacity),
    '--mb-grain': String(config.grain),
    // The content-safe zone dims whatever sits behind text without touching the pointer.
    '--mb-safe': String(smoothstep(0.2, 0.9, config.intensity) * 0.25),
  }
}
