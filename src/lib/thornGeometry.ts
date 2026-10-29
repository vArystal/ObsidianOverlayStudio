/**
 * Thorn & Rose geometry.
 *
 * Every frame is described by this module and rendered by `ThornFrame`. The spec is generated from a seed
 * derived from the element id, so an overlay looks identical on every reload and in OBS, while two
 * different elements still grow differently instead of sharing one tiled stencil.
 *
 * Pure functions only: no DOM, no randomness that escapes the seed. That keeps it testable and means the
 * published snapshot carries numbers, not artwork.
 */

export type ThornVariant = 'camera' | 'chat' | 'plaque' | 'alert' | 'panel'

export interface CaneSegment {
  d: string
  width: number
  /** Second, brighter cane woven over the first. */
  highlight: boolean
  /** Approximate path length, used to draw the cane on during an alert. */
  length?: number
}

export interface ThornPart {
  x: number
  y: number
  angle: number
  length: number
  /** Thorns point away from the panel (outward) or across the cane face (inward). */
  dir: 1 | -1
}

export interface LeafPart {
  x: number
  y: number
  angle: number
  size: number
  shade: 0 | 1 | 2
  /** Leaves behind the canes read as depth; leaves in front catch the light. */
  behind: boolean
  /** Only part of the foliage sways: animating 70 nodes costs frames for no visual gain. */
  animated: boolean
  sway: { duration: number; delay: number }
}

export interface RosePart {
  x: number
  y: number
  angle: number
  size: number
  /** 'hero' is a full bloom, 'bud' is barely open, 'small' is a side bloom. */
  kind: 'hero' | 'bud' | 'small'
  sway: { duration: number; delay: number }
}

export interface FrameSpec {
  width: number
  height: number
  inset: number
  canes: CaneSegment[]
  thorns: ThornPart[]
  leaves: LeafPart[]
  roses: RosePart[]
  filigree: { x: number; y: number; width: number; height: number; radius: number }
  drift: { x: number; duration: number; delay: number }
  /** How long the whole frame takes to breathe; varies per element. */
  breath: number
}

/** Foliage and thorn budget, kept here so the look can be tuned in one place. */
export const THORN_TUNING = {
  /** Multiplies how many leaves and thorns grow. 1 is the shipped look, 0.5 is sparse. */
  density: 1,
  /** Multiplies every idle animation duration; 2 is half speed, 0.001 effectively stills it. */
  motionScale: 1,
  /** Rose scale for each widget kind. */
  roseScale: { hero: 1, bud: 0.62, small: 0.44 },
} as const

/** mulberry32: small, fast, and stable across engines, which is all a seed needs to be. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const round = (value: number) => Math.round(value * 100) / 100

interface Point { x: number; y: number; nx: number; ny: number; angle: number }
type CaneEnd = Omit<Point, 'angle'>

/** Walks the perimeter clockwise, returning positions plus the outward normal at each one. */
function walk(width: number, height: number, inset: number, step: number): Point[] {
  const left = inset, right = width - inset, top = inset, bottom = height - inset
  const points: Point[] = []
  const push = (x: number, y: number, nx: number, ny: number) => points.push({ x: round(x), y: round(y), nx, ny, angle: round((Math.atan2(ny, nx) * 180) / Math.PI) })
  const spanX = right - left
  const spanY = bottom - top
  for (let d = 0; d < spanX; d += step) push(left + d, top, 0, -1)
  for (let d = 0; d < spanY; d += step) push(right, top + d, 1, 0)
  for (let d = 0; d < spanX; d += step) push(right - d, bottom, 0, 1)
  for (let d = 0; d < spanY; d += step) push(left, bottom - d, -1, 0)
  return points
}

/** A slightly waving line between two perimeter points, so a cane is never perfectly straight. */
function canePath(from: CaneEnd, to: CaneEnd, wobble: number, bow: number) {
  const mx = (from.x + to.x) / 2 + from.nx * bow
  const my = (from.y + to.y) / 2 + from.ny * bow
  const cx = mx + (from.nx + to.nx) * wobble
  const cy = my + (from.ny + to.ny) * wobble
  return `M${from.x} ${from.y} Q${round(cx)} ${round(cy)} ${to.x} ${to.y}`
}

const cornerArcs = (width: number, height: number, inset: number, radius: number): CaneSegment[] => [
  { d: `M${inset + radius} ${inset} Q${inset} ${inset} ${inset} ${inset + radius}`, width: 7, highlight: false, length: Math.round(radius * 1.9) },
  { d: `M${width - inset - radius} ${inset} Q${width - inset} ${inset} ${width - inset} ${inset + radius}`, width: 7, highlight: false, length: Math.round(radius * 1.9) },
  { d: `M${width - inset} ${height - inset - radius} Q${width - inset} ${height - inset} ${width - inset - radius} ${height - inset}`, width: 7, highlight: false, length: Math.round(radius * 1.9) },
  { d: `M${inset + radius} ${height - inset} Q${inset} ${height - inset} ${inset} ${height - inset - radius}`, width: 7, highlight: false, length: Math.round(radius * 1.9) },
]

/** How showy each widget is. Chat stays lighter so text is never crowded. */
const PROFILE: Record<ThornVariant, { cornerLeaves: number; edgeLeaves: number; thornStep: number; cornerThorns: number }> = {
  camera: { cornerLeaves: 5, edgeLeaves: 7, thornStep: 62, cornerThorns: 4 },
  alert: { cornerLeaves: 4, edgeLeaves: 5, thornStep: 70, cornerThorns: 4 },
  panel: { cornerLeaves: 4, edgeLeaves: 5, thornStep: 74, cornerThorns: 3 },
  plaque: { cornerLeaves: 2, edgeLeaves: 2, thornStep: 96, cornerThorns: 2 },
  chat: { cornerLeaves: 2, edgeLeaves: 3, thornStep: 104, cornerThorns: 2 },
}

export function buildFrameSpec(options: {
  id: string
  width: number
  height: number
  variant: ThornVariant
  radius: number
  density?: number
  motionScale?: number
}): FrameSpec {
  const { id, width, height, variant, radius } = options
  const density = (options.density ?? THORN_TUNING.density)
  const motionScale = options.motionScale ?? THORN_TUNING.motionScale
  const random = rng(hash(`${id}:${variant}:${Math.round(width)}x${Math.round(height)}`))
  const profile = PROFILE[variant]
  const inset = Math.max(9, Math.min(20, Math.min(width, height) * 0.055))
  const step = 26

  const points = walk(width, height, inset, step)
  const canes: CaneSegment[] = [...cornerArcs(width, height, inset, Math.max(14, inset * 1.6))]
  // Each side is one cane that swells away from the edge, drawn twice: a dark woody body and a thin lit
  // edge offset inward. Two strands per side, staggered, so the border reads as intertwined growth.
  const sides = [
    { from: { x: inset, y: inset, nx: 0, ny: -1 }, to: { x: width - inset, y: inset, nx: 0, ny: -1 }, span: width - inset * 2 },
    { from: { x: width - inset, y: inset, nx: 1, ny: 0 }, to: { x: width - inset, y: height - inset, nx: 1, ny: 0 }, span: height - inset * 2 },
    { from: { x: width - inset, y: height - inset, nx: 0, ny: 1 }, to: { x: inset, y: height - inset, nx: 0, ny: 1 }, span: width - inset * 2 },
    { from: { x: inset, y: height - inset, nx: -1, ny: 0 }, to: { x: inset, y: inset, nx: -1, ny: 0 }, span: height - inset * 2 },
  ]
  sides.forEach((side, index) => {
    const bow = (random() - 0.5) * 4
    canes.push({ d: canePath(side.from, side.to, 0, bow), width: 6, highlight: false, length: Math.round(side.span + Math.abs(bow) * 2) })
    if (index % 2 === 0 || random() > 0.5) {
      const near = (point: { x: number; y: number; nx: number; ny: number }) => ({ ...point, x: point.x + point.nx * 5, y: point.y + point.ny * 5 })
      canes.push({ d: canePath(near(side.from), near(side.to), 0, -bow - 3), width: 3.4, highlight: true, length: Math.round(side.span + Math.abs(bow) * 2) })
    }
  })

  const thorns: ThornPart[] = []
  const leaves: LeafPart[] = []
  const sway = () => ({ duration: round((7 + random() * 6) / motionScale), delay: round(random() * 6) })

  // Thorns follow the canes at irregular intervals: spacing and size both vary, which is what stops a
  // generated frame from looking tiled.
  for (let i = 0; i < points.length; i += 1) {
    const gap = Math.round((profile.thornStep * (0.6 + random() * 0.9)) / step)
    const point = points[(i += Math.max(1, gap))]
    if (!point) break
    // Chat keeps one trailing side clear so the feed stays readable.
    if (variant === 'chat' && point.nx > 0) continue
    thorns.push({ x: point.x, y: point.y, angle: round(point.angle + (random() - 0.5) * 34), length: round(7 + random() * 8), dir: random() > 0.28 ? 1 : -1 })
  }

  const corners = [
    { x: inset + 4, y: inset + 4, base: -135 },
    { x: width - inset - 4, y: inset + 4, base: -45 },
    { x: width - inset - 4, y: height - inset - 4, base: 45 },
    { x: inset + 4, y: height - inset - 4, base: 135 },
  ]
  corners.forEach((corner) => {
    const thornCount = Math.round(profile.cornerThorns * density)
    for (let i = 0; i < thornCount; i += 1) {
      const spread = corner.base + (random() - 0.5) * 150
      const radius2 = 6 + random() * 16
      thorns.push({
        x: round(corner.x + Math.cos((spread * Math.PI) / 180) * radius2),
        y: round(corner.y + Math.sin((spread * Math.PI) / 180) * radius2),
        angle: round(spread), length: round(8 + random() * 9), dir: 1,
      })
    }
    const leafCount = Math.round(profile.cornerLeaves * density)
    for (let i = 0; i < leafCount; i += 1) {
      const spread = corner.base + (random() - 0.5) * 190
      const radius2 = 4 + random() * 20
      leaves.push({
        x: round(corner.x + Math.cos((spread * Math.PI) / 180) * radius2),
        y: round(corner.y + Math.sin((spread * Math.PI) / 180) * radius2),
        angle: round(spread + (random() - 0.5) * 30),
        size: round(13 + random() * 12),
        shade: (Math.floor(random() * 3) as 0 | 1 | 2),
        behind: random() > 0.55,
        animated: random() > 0.62,
        sway: sway(),
      })
    }
  })

  // Mid-edge growth is deliberately sparse: the middle of a side must stay quiet for the content.
  const edgeLeaves = Math.round(profile.edgeLeaves * density)
  for (let i = 0; i < edgeLeaves; i += 1) {
    const point = points[Math.floor(random() * points.length)]
    if (!point) continue
    leaves.push({
      x: point.x, y: point.y,
      angle: round(point.angle + (random() - 0.5) * 40),
      size: round(10 + random() * 9),
      shade: (Math.floor(random() * 3) as 0 | 1 | 2),
      behind: random() > 0.4,
      animated: random() > 0.62,
      sway: sway(),
    })
  }

  const roses: RosePart[] = []
  const roseScale = THORN_TUNING.roseScale
  const addRose = (x: number, y: number, kind: RosePart['kind'], base: number, angle: number) => {
    roses.push({ x: round(x), y: round(y), angle: round(angle), size: round(base * roseScale[kind]), kind, sway: sway() })
  }

  if (variant === 'camera') {
    addRose(width - inset - 30, inset + 24, 'hero', 76, -12)
    addRose(inset + 30, height - inset - 26, 'bud', 46, 18)
    addRose(inset + 12, height * 0.42, 'small', 34, -8)
    addRose(width - inset - 16, height * 0.62, 'small', 30, 14)
  } else if (variant === 'alert') {
    addRose(width / 2 + 6, inset + 16, 'hero', 64, 6)
    addRose(inset + 26, height - inset - 20, 'bud', 40, -14)
    addRose(width - inset - 22, height - inset - 24, 'small', 30, 20)
  } else if (variant === 'chat') {
    addRose(width - inset - 18, inset + 16, 'bud', 34, -16)
    addRose(inset + 14, height * 0.7, 'small', 24, 10)
  } else if (variant === 'plaque') {
    addRose(inset + 14, height / 2, 'small', 30, -20)
    addRose(width - inset - 14, height / 2, 'small', 30, 22)
  } else {
    addRose(width - inset - 22, inset + 18, 'bud', 38, -10)
    addRose(inset + 20, height - inset - 18, 'small', 28, 16)
  }

  return {
    width, height, inset, canes, thorns, leaves, roses,
    filigree: { x: inset + 5, y: inset + 5, width: Math.max(1, width - (inset + 5) * 2), height: Math.max(1, height - (inset + 5) * 2), radius: Math.max(2, radius - 4) },
    drift: { x: round(inset + 24 + random() * Math.max(1, width - inset * 2 - 48)), duration: round(14 + random() * 6), delay: round(random() * 9) },
    breath: round((11 + random() * 5) / motionScale),
  }
}

/** Which frame a widget gets. Sizes are the widget's own, so the art follows its shape. */
export function variantForType(type: string): ThornVariant {
  if (type === 'webcam' || type === 'capture') return 'camera'
  if (type === 'chat') return 'chat'
  if (type === 'alert') return 'alert'
  if (type === 'counter' || type === 'sessionFollowers' || type === 'latestFollower' || type === 'viewerCount' || type === 'supporter') return 'plaque'
  return 'panel'
}

/** Deterministic rose colour stops, exported so tests can assert the palette is wired. */
export const THORN_ROSE_STOPS = ['#3d0610', '#8e1226', '#b3162f', '#d9304a'] as const
