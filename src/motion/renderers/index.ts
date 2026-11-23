/**
 * Renderer registry. Each variant is a separate dynamic import, so a page that only ever shows one backdrop never
 * downloads the other nine shaders or their painters.
 *
 * The packers live here rather than in the shader files: they are the one place that knows how a variant's schema
 * params map onto the shared `uA` / `uB` vec4 slots.
 */
import type { Packer } from './gl'
import type { ResolvedParams, VariantId } from '../types'
import type { CanvasPainter } from './canvas/particleFlow'

const zeros: number[] = [0, 0, 0, 0]

const screenIndex = (value: string) => (value === 'bayer-4' ? 1 : value === 'halftone' ? 2 : 0)
const inkIndex = (value: string) => (value === 'mono' ? 2 : value === 'triad' ? 1 : 0)

export const PACKERS: Record<Exclude<VariantId, 'css-orbs'>, Packer> = {
  'aurora-mesh': (p) => [[p.num('points'), p.num('warp'), p.num('glow'), p.num('contrast')], zeros],
  'liquid-glass': (p) => [[p.num('orbs'), p.num('thickness'), p.num('dispersion'), p.num('frost')], [p.num('specular'), 0, 0, 0]],
  'fluid-ink': (p) => [[p.num('splats'), p.num('turbulence'), p.num('dye'), p.num('zoom')], zeros],
  'dither-print': (p) => [[p.num('cell'), 0, p.num('contrast'), screenIndex(p.str('pattern'))], [inkIndex(p.str('inks')), 0, 0, 0]],
  'contour-lines': (p) => [[p.num('lines'), p.num('thickness'), p.num('noiseScale'), p.bool('ridged') ? 1 : 0], [p.bool('fill') ? 1 : 0, 0, 0, 0]],
  'deep-space': (p) => [[p.num('nebula'), p.num('stars'), p.num('twinkle'), p.num('shooting')], zeros],
  'particle-flow': (p) => [[p.num('count'), p.num('trail'), p.num('swirl'), p.num('grain')], zeros],
  'reactive-grid': (p) => [[p.num('spacing'), p.num('cellSize'), p.num('force'), p.num('wave')], zeros],
  'living-patterns': (p) => [[p.num('detail'), p.num('feed'), p.num('kill'), 0], zeros],
}

export const GL_LOADERS: Partial<Record<VariantId, () => Promise<{ fragment: string }>>> = {
  'aurora-mesh': () => import('./gl/auroraMesh'),
  'liquid-glass': () => import('./gl/liquidGlass'),
  'fluid-ink': () => import('./gl/fluidInk'),
  'dither-print': () => import('./gl/ditherPrint'),
  'contour-lines': () => import('./gl/contourLines'),
  'deep-space': () => import('./gl/deepSpace'),
}

export const CANVAS_LOADERS: Partial<Record<VariantId, () => Promise<{ createParticleFlow?: never; default: (ctx: CanvasRenderingContext2D) => CanvasPainter }>>> = {
  'particle-flow': () => import('./canvas/particleFlow').then((m) => ({ default: m.createParticleFlow })),
  'reactive-grid': () => import('./canvas/reactiveGrid').then((m) => ({ default: m.createReactiveGrid })),
  'living-patterns': () => import('./canvas/livingPatterns').then((m) => ({ default: m.createLivingPatterns })),
}

export type { CanvasPainter, Packer }
export type PaletteParams = ResolvedParams
