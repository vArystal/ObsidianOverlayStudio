/**
 * The variant catalog: pure data. It is imported by the inspector, the normaliser and the tests, so it must not pull
 * a renderer, a canvas or a browser API into the bundle. The heavy modules are loaded lazily by `renderers.ts`.
 *
 * Every variant is a different construction, not a recolour: a domain-warped mesh shader, a metaball refractor, a
 * curl-noise particle field, advected dye, an ordered-dither quantiser, an anti-aliased isoline field, a raymarch-free
 * nebula, a spring-lattice of instanced cells, a pure-CSS orb scene and a Gray-Scott reaction-diffusion simulation.
 */
import type { ParamValue, PresetDefinition, VariantDefinition, VariantId } from './types'

const preset = (
  id: string,
  label: string,
  colors: [string, string, string],
  params?: Record<string, ParamValue>,
): PresetDefinition => ({ id, label, colors, params })

/** Five moods every variant ships with, so switching preset never means starting from nothing. */
const moods = (
  palettes: {
    mid: [string, string, string]
    pastel: [string, string, string]
    dopamine: [string, string, string]
    mono: [string, string, string]
    neon: [string, string, string]
  },
  per?: (mood: keyof typeof palettes) => Record<string, ParamValue>,
): PresetDefinition[] => [
  preset('midnight', 'Midnight', palettes.mid, per?.('mid')),
  preset('pastel', 'Pastel', palettes.pastel, per?.('pastel')),
  preset('dopamine', 'Dopamine', palettes.dopamine, per?.('dopamine')),
  preset('mono', 'Monochrome', palettes.mono, per?.('mono')),
  preset('neon', 'Neon', palettes.neon, per?.('neon')),
]

export const VARIANTS: VariantDefinition[] = [
  {
    id: 'aurora-mesh',
    label: 'Aurora Mesh',
    description: 'Luminous mesh of colour drifting through domain-warped noise',
    backend: 'gl',
    tech: 'Fragment shader · fBM domain warp · ordered dither',
    pointer: true,
    params: [
      { key: 'points', label: 'Mesh points', group: 'Variant', type: 'number', min: 3, max: 9, step: 1, default: 5, description: 'How many colour centres the field is steered by.' },
      { key: 'warp', label: 'Warp', group: 'Variant', type: 'number', min: 0, max: 2, step: 0.01, default: 0.85 },
      { key: 'glow', label: 'Glow', group: 'Variant', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.7 },
      { key: 'contrast', label: 'Band contrast', group: 'Look', type: 'number', min: 0.2, max: 2, step: 0.01, default: 0.95 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#05070f', '#101a33', '#4fd1c5'],
      pastel: ['#171232', '#4b3a6b', '#ffc4e1'],
      dopamine: ['#150022', '#4a0a5e', '#ff2f92'],
      mono: ['#08090a', '#1a1c1f', '#e6e8ea'],
      neon: ['#02060c', '#062033', '#2ef2c8'],
    }),
  },
  {
    id: 'liquid-glass',
    label: 'Liquid Glass',
    description: 'Glossy glass lenses refracting a live colour field, with dispersion and caustics',
    backend: 'gl',
    tech: 'Fragment shader · SDF metaballs · refraction + dispersion',
    pointer: true,
    params: [
      { key: 'orbs', label: 'Orbs', group: 'Variant', type: 'number', min: 3, max: 7, step: 1, default: 5 },
      { key: 'thickness', label: 'Thickness', group: 'Variant', type: 'number', min: 0.1, max: 1.4, step: 0.01, default: 0.55 },
      { key: 'dispersion', label: 'Dispersion', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'frost', label: 'Frost', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.22 },
      { key: 'specular', label: 'Specular', group: 'Look', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#060810', '#1d1633', '#8bb8ff'],
      pastel: ['#1a1430', '#463a63', '#ffd0ea'],
      dopamine: ['#12001c', '#45084f', '#ff3d9a'],
      mono: ['#0a0a0b', '#222326', '#f0f1f3'],
      neon: ['#02070e', '#05202e', '#3ff5d6'],
    }),
  },
  {
    id: 'particle-flow',
    label: 'Particle Flow',
    description: 'Thousands of luminous motes drifting through a curl-noise field with soft trails',
    backend: '2d',
    tech: 'Canvas2D · curl noise · additive trails',
    pointer: true,
    params: [
      { key: 'count', label: 'Particles', group: 'Performance', type: 'number', min: 200, max: 4000, step: 100, default: 1400 },
      { key: 'trail', label: 'Trail', group: 'Variant', type: 'number', min: 0.5, max: 14, step: 0.1, default: 6, unit: 'frames' },
      { key: 'swirl', label: 'Swirl', group: 'Variant', type: 'number', min: 0.2, max: 3, step: 0.01, default: 1 },
      { key: 'grain', label: 'Mote size', group: 'Variant', type: 'number', min: 0.5, max: 3, step: 0.01, default: 1.1 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#06070b', '#101218', '#d8ccb4'],
      pastel: ['#191430', '#463a63', '#ffd6a5'],
      dopamine: ['#13001a', '#43074d', '#ff3fa4'],
      mono: ['#08080a', '#1b1c1f', '#eceef1'],
      neon: ['#02060c', '#06202a', '#34f0c8'],
    }),
  },
  {
    id: 'fluid-ink',
    label: 'Fluid Ink',
    description: 'Vivid dye advected by a divergence-free field, stirred by the pointer',
    backend: 'gl',
    tech: 'Fragment shader · curl advection · dye layers',
    pointer: true,
    params: [
      { key: 'splats', label: 'Stir points', group: 'Variant', type: 'number', min: 1, max: 8, step: 1, default: 4 },
      { key: 'turbulence', label: 'Turbulence', group: 'Variant', type: 'number', min: 0.2, max: 2.5, step: 0.01, default: 1.1 },
      { key: 'dye', label: 'Dye density', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'zoom', label: 'Flow scale', group: 'Composition', type: 'number', min: 0.4, max: 2.5, step: 0.01, default: 1 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#07060d', '#1b1030', '#ff5fa2'],
      pastel: ['#1c1730', '#4a3a68', '#ffc2d1'],
      dopamine: ['#10001d', '#3f0655', '#ff1f8a'],
      mono: ['#080809', '#191a1d', '#e9eaec'],
      neon: ['#03060b', '#04202c', '#2ff0d0'],
    }),
  },
  {
    id: 'dither-print',
    label: 'Digital Print',
    description: 'Ordered dithering and halftone screens over a living field, limited inks',
    backend: 'gl',
    tech: 'Fragment shader · Bayer 8 / halftone quantiser',
    pointer: false,
    params: [
      { key: 'pattern', label: 'Screen', group: 'Variant', type: 'enum', values: ['bayer-8', 'bayer-4', 'halftone'], default: 'bayer-8' },
      { key: 'cell', label: 'Cell size', group: 'Variant', type: 'number', min: 1, max: 14, step: 1, default: 3, unit: 'px' },
      { key: 'contrast', label: 'Contrast', group: 'Look', type: 'number', min: 0.4, max: 2.4, step: 0.01, default: 1.1 },
      { key: 'inks', label: 'Inks', group: 'Variant', type: 'enum', values: ['duotone', 'triad', 'mono'], default: 'duotone' },
    ],
    defaults: {},
    presets: moods({
      mid: ['#0a0a0a', '#141414', '#f2ede4'],
      pastel: ['#241a2e', '#5b4768', '#ffd9ef'],
      dopamine: ['#0b0b0b', '#242424', '#ff5a1f'],
      mono: ['#000000', '#161616', '#ffffff'],
      neon: ['#000000', '#0b0b0b', '#39ff9e'],
    }),
  },
  {
    id: 'contour-lines',
    label: 'Contour Lines',
    description: 'Anti-aliased topographic isolines flowing like a living map',
    backend: 'gl',
    tech: 'Fragment shader · fwidth isolines · gradient by height',
    pointer: true,
    params: [
      { key: 'lines', label: 'Line density', group: 'Variant', type: 'number', min: 4, max: 60, step: 1, default: 22 },
      { key: 'thickness', label: 'Line weight', group: 'Variant', type: 'number', min: 0.2, max: 1.4, step: 0.01, default: 0.55 },
      { key: 'noiseScale', label: 'Field scale', group: 'Variant', type: 'number', min: 0.4, max: 3, step: 0.01, default: 1.2 },
      { key: 'ridged', label: 'Ridged relief', group: 'Variant', type: 'boolean', default: false },
      { key: 'fill', label: 'Height bands', group: 'Look', type: 'boolean', default: true },
    ],
    defaults: {},
    presets: moods({
      mid: ['#05080f', '#101b2a', '#c9d7e8'],
      pastel: ['#171233', '#43335f', '#ffd1e6'],
      dopamine: ['#120021', '#3c0854', '#ff4fa3'],
      mono: ['#09090a', '#1a1b1e', '#e8e9eb'],
      neon: ['#02070c', '#051d28', '#35efd2'],
    }),
  },
  {
    id: 'deep-space',
    label: 'Deep Space',
    description: 'Volumetric nebula, layered stars and rare shooting stars with parallax',
    backend: 'gl',
    tech: 'Fragment shader · fBM volumetrics · hashed star layers',
    pointer: true,
    params: [
      { key: 'nebula', label: 'Nebula density', group: 'Variant', type: 'number', min: 0, max: 1.4, step: 0.01, default: 0.8 },
      { key: 'stars', label: 'Star density', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.65 },
      { key: 'twinkle', label: 'Twinkle', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'shooting', label: 'Shooting stars', group: 'Variant', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#03040a', '#0a0f24', '#bcd3ff'],
      pastel: ['#120d24', '#31264b', '#ffd7f0'],
      dopamine: ['#0a0018', '#2b0647', '#ff4fb0'],
      mono: ['#040405', '#101114', '#f2f3f5'],
      neon: ['#01040a', '#031a26', '#3ff0ff'],
    }),
  },
  {
    id: 'reactive-grid',
    label: 'Reactive Grid',
    description: 'A precise cell lattice that bows, lights and connects around the pointer',
    backend: '2d',
    tech: 'Canvas2D · spring lattice · batched paths',
    pointer: true,
    params: [
      { key: 'spacing', label: 'Spacing', group: 'Composition', type: 'number', min: 18, max: 90, step: 1, default: 42, unit: 'px' },
      { key: 'cellSize', label: 'Cell size', group: 'Variant', type: 'number', min: 0.15, max: 1, step: 0.01, default: 0.55 },
      { key: 'force', label: 'Pointer force', group: 'Interaction', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'wave', label: 'Ambient wave', group: 'Variant', type: 'number', min: 0.2, max: 2, step: 0.01, default: 1 },
      { key: 'shape', label: 'Cell shape', group: 'Variant', type: 'enum', values: ['dot', 'cross', 'hex'], default: 'dot' },
    ],
    defaults: {},
    presets: moods({
      mid: ['#07080b', '#14161b', '#a9c7ff'],
      pastel: ['#171233', '#40345c', '#ffcfe4'],
      dopamine: ['#10001d', '#3a0752', '#ff2f9a'],
      mono: ['#08090a', '#191a1d', '#eeeff1'],
      neon: ['#02060b', '#031c26', '#3af2cf'],
    }),
  },
  {
    id: 'css-orbs',
    label: 'CSS Orbs',
    description: 'Zero-JS blurred colour orbs with SVG-turbulence grain — also the universal fallback',
    backend: 'css',
    tech: 'Pure CSS · @property · compositor only',
    pointer: false,
    params: [
      { key: 'orbs', label: 'Orbs', group: 'Variant', type: 'number', min: 3, max: 8, step: 1, default: 5 },
      { key: 'blur', label: 'Softness', group: 'Variant', type: 'number', min: 20, max: 140, step: 1, default: 76, unit: 'px' },
      { key: 'morph', label: 'Morph', group: 'Variant', type: 'number', min: 0, max: 1.4, step: 0.01, default: 0.6 },
      { key: 'orbit', label: 'Orbit', group: 'Motion', type: 'number', min: 0.2, max: 2, step: 0.01, default: 1 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#08070d', '#161226', '#7c6cff'],
      pastel: ['#1a1430', '#4a3a68', '#ffc8e4'],
      dopamine: ['#12001d', '#40084f', '#ff2e93'],
      mono: ['#0a0a0b', '#1c1d20', '#e8e9eb'],
      neon: ['#02060c', '#041f2b', '#33f0cf'],
    }),
  },
  {
    id: 'living-patterns',
    label: 'Living Patterns',
    description: 'Self-organising reaction-diffusion: coral, mazes, spots and worm trails',
    backend: '2d',
    tech: 'Canvas2D · Gray-Scott · palette LUT',
    pointer: true,
    params: [
      { key: 'mode', label: 'Pattern', group: 'Variant', type: 'enum', values: ['coral', 'mitosis', 'spots', 'worms', 'maze'], default: 'coral' },
      { key: 'feed', label: 'Feed', group: 'Variant', type: 'number', min: 0.008, max: 0.09, step: 0.001, default: 0.055 },
      { key: 'kill', label: 'Kill', group: 'Variant', type: 'number', min: 0.04, max: 0.072, step: 0.001, default: 0.062 },
      { key: 'detail', label: 'Detail', group: 'Performance', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    ],
    defaults: {},
    presets: moods({
      mid: ['#03080c', '#0a1a20', '#5ef2c8'],
      pastel: ['#161230', '#40345c', '#ffcfe6'],
      dopamine: ['#0e0018', '#38074b', '#ff4fae'],
      mono: ['#08090a', '#1a1b1e', '#eef0f2'],
      neon: ['#01060a', '#031a24', '#2ff5b8'],
    }),
  },
]

export const VARIANT_BY_ID: Record<string, VariantDefinition> = Object.fromEntries(VARIANTS.map((v) => [v.id, v]))

export const DEFAULT_VARIANT: VariantId = 'aurora-mesh'

/** Look values every variant starts from. Kept in one place so the inspector's "reset" is the truth. */
export const BASE_LOOK = {
  speed: 1,
  intensity: 0.6,
  opacity: 0.92,
  blur: 0,
  density: 0.5,
  scale: 1,
  pointer: 0.7,
  grain: 0.035,
  vignette: 0.35,
} as const

/**
 * Legacy kind -> variant. Twelve CSS scenes became ten constructed variants; this map is what keeps a published
 * overlay or a bookmarked snapshot rendering the same mood after the upgrade.
 */
export const LEGACY_KIND_MAP: Record<string, VariantId> = {
  'aurora-flow': 'aurora-mesh',
  'ambient-gradient': 'css-orbs',
  'liquid-light': 'liquid-glass',
  'cinematic-particles': 'particle-flow',
  'neon-grid': 'reactive-grid',
  'deep-space': 'deep-space',
  'rose-vines': 'fluid-ink',
  'smoke-drift': 'fluid-ink',
  'light-rays': 'aurora-mesh',
  'bokeh-lights': 'css-orbs',
  'storm-clouds': 'deep-space',
  'frosted-glass': 'liquid-glass',
}

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VARIANT_BY_ID, value)
}

/** Serialisable preset list for one variant, used by the inspector's dropdown and the gallery. */
export function presetsFor(id: VariantId): PresetDefinition[] {
  return VARIANT_BY_ID[id]?.presets ?? []
}
