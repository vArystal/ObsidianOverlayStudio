/**
 * Shared maths for the motion system: deterministic randomness, value/simplex noise, a curl field for the particle
 * and ink variants, and sRGB <-> OKLab colour helpers so generated palettes stay perceptually even.
 *
 * The GLSL side re-implements the few functions it needs in `prelude.ts`; these are the CPU counterparts and are
 * kept deliberately small so a particle budget of a few thousand costs well under a millisecond.
 */

/** mulberry32 — fast, seeded, good enough for art and deterministic in tests. */
export function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ noise */

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Value noise, trilinear. Cheaper than simplex and plenty for these fields. */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = fade(xf)
  const v = fade(yf)
  const n00 = hash2(xi, yi, seed)
  const n10 = hash2(xi + 1, yi, seed)
  const n01 = hash2(xi, yi + 1, seed)
  const n11 = hash2(xi + 1, yi + 1, seed)
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v)
}

export function noise3(x: number, y: number, z: number, seed = 0): number {
  const zi = Math.floor(z)
  const zf = z - zi
  const w = fade(zf)
  return lerp(noise2(x, y, seed + zi * 1013), noise2(x, y, seed + (zi + 1) * 1013), w)
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise2(fx, fy, seed + i * 37)
    norm += amp
    fx *= 2.03
    fy *= 2.03
    amp *= 0.5
  }
  return sum / norm
}

/** Curl of a scalar field, returned as a unit-ish velocity. Divergence-free, so particles swirl instead of clump. */
export function curl2(x: number, y: number, t: number, seed = 0): { x: number; y: number } {
  const e = 0.35
  const n1 = fbm2(x, y + e, 3, seed)
  const n2 = fbm2(x, y - e, 3, seed)
  const n3 = fbm2(x + e, y, 3, seed)
  const n4 = fbm2(x - e, y, 3, seed)
  // The time term slides the sampled field, which makes the flow evolve without recomputing it.
  const drift = Math.sin(t * 0.12) * 0.6
  return { x: (n1 - n2) / (2 * e) + drift, y: -(n3 - n4) / (2 * e) }
}

/* ------------------------------------------------------------------ colour */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string, fallback: Rgb = { r: 14, g: 15, b: 17 }): Rgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return fallback
  const raw = match[1]
  const value = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

export const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')}`

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

export interface Oklab {
  l: number
  a: number
  b: number
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToRgb({ l, a, b }: Oklab): Rgb {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  return { r: linearToSrgb(lr) * 255, g: linearToSrgb(lg) * 255, b: linearToSrgb(lb) * 255 }
}

/** Perceptually even mix; `null` for out-of-gamut channels is avoided by clamping after conversion. */
export function mixOklab(from: Rgb, to: Rgb, t: number): Rgb {
  const a = rgbToOklab(from)
  const b = rgbToOklab(to)
  return oklabToRgb({ l: lerp(a.l, b.l, t), a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) })
}

/** A gradient stop list usable as a CSS gradient or as a shader palette. */
export function paletteStops(colors: [string, string, string], count = 5): string[] {
  const ends = colors.map((c) => parseHex(c))
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    return toHex(t < 0.5
      ? mixOklab(ends[0], ends[1], t * 2)
      : mixOklab(ends[1], ends[2], (t - 0.5) * 2))
  })
}

/* ------------------------------------------------------------------ format */

export function normaliseHex(value: unknown, fallback: string): string {
  const hex = typeof value === 'string' ? value.trim() : ''
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallback
}
