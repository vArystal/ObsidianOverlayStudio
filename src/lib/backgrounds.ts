import type { BackgroundKind, OverlayBackground } from '../types'

/** Which controls a given backdrop actually responds to. Hiding the rest avoids dead knobs. */
export type BackgroundControl = 'primary' | 'secondary' | 'accent' | 'opacity' | 'speed' | 'intensity' | 'blur' | 'density' | 'scale'

export interface BackgroundPreset {
  kind: BackgroundKind
  label: string
  blurb: string
  controls: BackgroundControl[]
  defaults: Omit<OverlayBackground, 'kind' | 'enabled' | 'paused'>
}

const base = {
  primary: '#0e0f11',
  secondary: '#15161a',
  accent: '#cfd2d6',
  opacity: 0.85,
  speed: 1,
  intensity: 0.5,
  blur: 0,
  density: 0.5,
  scale: 1,
}

/**
 * Six backdrops with genuinely different construction: layered light, refracted liquid, discrete particles, a
 * perspective lattice, star field with parallax depth, and slow colour drift. They are CSS-only on purpose:
 * compositor work on transform and opacity costs no per-frame JavaScript, needs no cleanup and cannot leak.
 */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    kind: 'aurora-flow',
    label: 'Aurora Flow',
    blurb: 'Layered curtains of light drifting on different rhythms',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#061014', secondary: '#0b2430', accent: '#6fd3c7', opacity: 0.9, speed: 1, intensity: 0.55, blur: 0 },
  },
  {
    kind: 'liquid-light',
    label: 'Liquid Light',
    blurb: 'Refracted pools that fold into each other',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#0a0a0c', secondary: '#1a1c22', accent: '#a9b4c4', opacity: 0.82, speed: 0.9, intensity: 0.6, blur: 0 },
  },
  {
    kind: 'cinematic-particles',
    label: 'Cinematic Particles',
    blurb: 'Slow motes with real depth layers',
    controls: ['primary', 'accent', 'opacity', 'speed', 'intensity', 'density'],
    defaults: { ...base, primary: '#08090b', accent: '#e7e4dc', opacity: 0.9, speed: 0.8, intensity: 0.35, density: 0.45 },
  },
  {
    kind: 'neon-grid',
    label: 'Neon Grid',
    blurb: 'A perspective lattice receding from the horizon',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'scale'],
    defaults: { ...base, primary: '#06070a', secondary: '#101319', accent: '#8fd8ff', opacity: 0.78, speed: 0.7, intensity: 0.45, scale: 1 },
  },
  {
    kind: 'deep-space',
    label: 'Deep Space',
    blurb: 'Star field, distant light and parallax depth',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'density', 'blur'],
    defaults: { ...base, primary: '#05060a', secondary: '#0a0f1a', accent: '#dfe6f2', opacity: 0.95, speed: 0.5, intensity: 0.4, density: 0.6 },
  },
  {
    kind: 'ambient-gradient',
    label: 'Ambient Gradient',
    blurb: 'Three fields of colour breathing out of phase',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur'],
    defaults: { ...base, primary: '#0c0d10', secondary: '#191a1f', accent: '#8a93a6', opacity: 0.86, speed: 0.6, intensity: 0.5, blur: 0 },
  },
]

export const DEFAULT_BACKGROUND: OverlayBackground = {
  enabled: false,
  kind: 'aurora-flow',
  paused: false,
  ...BACKGROUND_PRESETS[0].defaults,
}

export function presetFor(kind: BackgroundKind): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find((preset) => preset.kind === kind)
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

const colour = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback

/**
 * Anything can arrive here: a legacy overlay with no background, a hand-edited snapshot, a stale kind from a
 * removed effect. Every field is coerced to a usable value so the runtime never renders a broken scene.
 */
export function normalizeBackground(input: unknown): OverlayBackground {
  const raw = (input ?? {}) as Partial<OverlayBackground>
  const kind: BackgroundKind = presetFor(raw.kind as BackgroundKind) ? (raw.kind as BackgroundKind) : DEFAULT_BACKGROUND.kind
  const preset = presetFor(kind)!
  const d = preset.defaults
  return {
    enabled: raw.enabled === true,
    kind,
    paused: raw.paused === true,
    primary: colour(raw.primary, d.primary),
    secondary: colour(raw.secondary, d.secondary),
    accent: colour(raw.accent, d.accent),
    opacity: clamp(raw.opacity, 0, 1, d.opacity),
    speed: clamp(raw.speed, 0.2, 2, d.speed),
    intensity: clamp(raw.intensity, 0, 1, d.intensity),
    blur: clamp(raw.blur, 0, 14, d.blur),
    density: clamp(raw.density, 0, 1, d.density),
    scale: clamp(raw.scale, 0.6, 1.6, d.scale),
  }
}

/** The layer reads everything from custom properties, so one markup tree serves editor and OBS output. */
export function backgroundCssVars(background: OverlayBackground): Record<string, string> {
  const preset = presetFor(background.kind) ?? BACKGROUND_PRESETS[0]
  const has = (control: BackgroundControl) => preset.controls.includes(control)
  return {
    '--bg-primary': background.primary,
    '--bg-secondary': has('secondary') ? background.secondary : background.primary,
    '--bg-accent': background.accent,
    '--bg-opacity': String(background.opacity),
    // Slower speed means longer durations, so the multiplier is inverted once here rather than in six places.
    '--bg-duration': `${(24 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-duration-slow': `${(58 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-duration-fast': `${(11 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-intensity': String(background.intensity),
    '--bg-blur': `${background.blur}px`,
    '--bg-density': String(background.density),
    '--bg-scale': String(background.scale),
  }
}

export function isAnimated(background: OverlayBackground, reducedMotion: boolean) {
  return background.enabled && background.kind !== 'none' && !background.paused && !reducedMotion
}
