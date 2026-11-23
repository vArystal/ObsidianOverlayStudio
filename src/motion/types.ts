/**
 * The motion background system: one typed contract shared by the catalog (data), the renderers (GLSL / Canvas2D /
 * CSS), the engine (RAF, quality, input), the editor inspector and the persisted overlay document.
 *
 * Everything a variant can be tuned by is declared once, in a `ParamSpec`, so the inspector, the normaliser and the
 * renderer cannot disagree about a default, a range or a type.
 */

export const VARIANT_IDS = [
  'aurora-mesh',
  'liquid-glass',
  'particle-flow',
  'fluid-ink',
  'dither-print',
  'contour-lines',
  'deep-space',
  'reactive-grid',
  'css-orbs',
  'living-patterns',
] as const

export type VariantId = (typeof VARIANT_IDS)[number]

export type VariantBackend = 'gl' | '2d' | 'css'

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra'

export type ParamValue = number | string | boolean

export type ParamGroup = 'Variant' | 'Motion' | 'Composition' | 'Look' | 'Interaction' | 'Performance'

export interface ParamSpec {
  key: string
  label: string
  group: ParamGroup
  type: 'number' | 'boolean' | 'enum' | 'color'
  default: ParamValue
  /** Numbers only. */
  min?: number
  max?: number
  step?: number
  /** enum only. */
  values?: readonly string[]
  unit?: string
  description?: string
  /** False when the value can only be honoured by rebuilding the renderer. */
  live?: boolean
}

export interface PresetDefinition {
  id: string
  label: string
  /** Palette in ground, mid, light order. */
  colors: [string, string, string]
  params?: Record<string, ParamValue>
  /** Per-preset look defaults, overriding the shared ones. */
  look?: Partial<Pick<MotionConfig, 'intensity' | 'speed' | 'opacity' | 'density' | 'scale' | 'blur'>>
}

export interface VariantDefinition {
  id: VariantId
  label: string
  description: string
  backend: VariantBackend
  /** Header line shown in the inspector, e.g. "Fragment shader · 3 uniforms". */
  tech: string
  /** Whether the variant reacts to the smoothed pointer at all. */
  pointer: boolean
  params: ParamSpec[]
  defaults: Record<string, ParamValue>
  presets: PresetDefinition[]
}

/** Fully resolved, serialisable configuration handed to a renderer. */
export interface MotionConfig {
  colors: [string, string, string]
  speed: number
  intensity: number
  opacity: number
  blur: number
  density: number
  scale: number
  seed: number
  pointer: number
  grain: number
  vignette: number
  params: Record<string, ParamValue>
}

export interface ResolvedParams {
  /** Shared, already-normalised fields. */
  colors: [number, number, number][]
  /** The same palette as CSS hex, for Canvas2D which needs strings. */
  hex: [string, string, string]
  intensity: number
  density: number
  scale: number
  scaleRaw: number
  seed: number
  grain: number
  vignette: number
  pointer: number
  /** Variant params, coerced to the declared type. */
  values: Record<string, ParamValue>
  num: (key: string) => number
  bool: (key: string) => boolean
  str: (key: string) => string
}

export interface Frame {
  /** Seconds since start, already multiplied by speed and stopped while paused. */
  time: number
  /** Real seconds between frames, clamped. */
  dt: number
  width: number
  height: number
  dpr: number
  quality: QualityTier
  params: ResolvedParams
  pointer: { x: number; y: number; strength: number }
}

export interface FrameStats {
  fps: number
  frameMs: number
  /** Fraction of the requested device pixel ratio currently rendered. */
  scale: number
  quality: QualityTier
  tier: 'gl' | '2d' | 'css' | 'poster'
}

export interface MotionBackgroundHandle {
  setVariant(id: VariantId, transition?: number): Promise<void>
  update(config: Partial<MotionConfig>): void
  play(): void
  pause(): void
  resize(): void
  /** Data URL of the current frame, or null when there is no drawable surface. */
  snapshot(): string | null
  destroy(): void
  stats(): FrameStats
}
