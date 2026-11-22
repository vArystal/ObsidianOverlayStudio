import type { BackgroundKind, OverlayBackground, OverlayTheme } from '../types'

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
 * Twelve backdrops with genuinely different construction: layered light, refracted liquid, discrete particles, a
 * perspective lattice, star field with parallax depth, slow colour drift, climbing briar, charcoal smoke, a fan of
 * rays, depth bokeh, a storm with a lightning bloom and a frosted glass sheet over saturated colour. They are
 * CSS-only on purpose: compositor work on transform and opacity costs no per-frame JavaScript, needs no cleanup and
 * cannot leak.
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
    defaults: { ...base, primary: '#05060a', secondary: '#0a0f1a', accent: '#dfe6f2', opacity: 0.95, speed: 0.75, intensity: 0.4, density: 0.6 },
  },
  {
    kind: 'ambient-gradient',
    label: 'Ambient Gradient',
    blurb: 'Three fields of colour breathing out of phase',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur'],
    defaults: { ...base, primary: '#0c0d10', secondary: '#191a1f', accent: '#8a93a6', opacity: 0.86, speed: 0.6, intensity: 0.5, blur: 0 },
  },
  {
    kind: 'rose-vines',
    label: 'Rose Vines',
    blurb: 'Thorned briar swaying through hot rose light',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#1a0810', secondary: '#33101d', accent: '#ff7597', opacity: 0.94, speed: 1, intensity: 0.65, blur: 3, scale: 1.12 },
  },
  {
    kind: 'smoke-drift',
    label: 'Smoke Drift',
    blurb: 'Cold charcoal smoke rolling across the frame',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#080c12', secondary: '#26333f', accent: '#a7c2d6', opacity: 0.86, speed: 0.8, intensity: 0.6, blur: 14, scale: 1.08 },
  },
  {
    kind: 'light-rays',
    label: 'Light Rays',
    blurb: 'A warm fan of light sweeping from above',
    controls: ['primary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#0c0804', accent: '#ffd489', opacity: 0.66, speed: 0.75, intensity: 0.62, blur: 6, scale: 1.04 },
  },
  {
    kind: 'bokeh-lights',
    label: 'Bokeh Lights',
    blurb: 'Warm out-of-focus lights drifting at three depths',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'density', 'blur'],
    defaults: { ...base, primary: '#0c0910', secondary: '#2d1a25', accent: '#ffc79f', opacity: 0.92, speed: 0.9, intensity: 0.55, density: 0.55, blur: 0 },
  },
  {
    kind: 'storm-clouds',
    label: 'Storm Clouds',
    blurb: 'Heavy cloud banks with a lightning bloom',
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'scale'],
    defaults: { ...base, primary: '#070b13', secondary: '#1e2c3f', accent: '#c6ddff', opacity: 0.96, speed: 0.85, intensity: 0.55, blur: 10, scale: 1.14 },
  },
  {
    kind: 'frosted-glass',
    label: 'Frosted Glass',
    blurb: 'Saturated light diffusing through a sheet of glass',
    // No scale: the panes are fixed to the frame, so a zoom knob here would do nothing.
    controls: ['primary', 'secondary', 'accent', 'opacity', 'speed', 'intensity', 'blur', 'density'],
    defaults: { ...base, primary: '#07030c', secondary: '#2a0b3f', accent: '#ff3fa4', opacity: 0.96, speed: 0.9, intensity: 0.7, density: 0.55, blur: 0 },
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
    // The inspector offers 0–80px; clamping at 14 made every value above it silently snap back.
    blur: clamp(raw.blur, 0, 80, d.blur),
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
    // CP53: 24/58/11s cycles read as a still image while someone is working, so the same scenes now breathe on
    // 12/26/6s. Nothing per-frame changed: these are still compositor-only transform and opacity animations.
    '--bg-duration': `${(12 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-duration-slow': `${(26 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-duration-fast': `${(6 / Math.max(0.2, background.speed)).toFixed(2)}s`,
    '--bg-intensity': String(background.intensity),
    '--bg-blur': `${background.blur}px`,
    '--bg-density': String(background.density),
    '--bg-scale': String(background.scale),
  }
}

/**
 * CP53: the backdrop used to keep whichever palette its scene shipped with, so switching the overlay to Rose & Thorn
 * left a blue-grey aurora behind it. The three scene colours now come from the theme the overlay is already using:
 * deep surface for the ground, raised surface for the mass, accent for the light. A scene keeps its own construction
 * and motion, so the five still look like five effects — they just belong to the style around them. Picking a colour
 * by hand still wins, because this only runs when a theme is chosen.
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
