/**
 * CP27 motion engine. One sampler, one preset library and one effects model are shared by the editor canvas and
 * the published OBS runtime, so a preview and a live source cannot animate differently.
 *
 * Design decisions that matter:
 * - Motion only ever produces `transform`, `opacity` and `filter`. Positioning stays on the element's left/top, so
 *   the editor's drag maths and the animation engine cannot fight over the same property.
 * - A clip is data (tracks of keyframes), never a CSS class, so it serialises with the overlay and can be scrubbed.
 * - Everything is sampled from a time value, which makes the timeline editor, the live runtime and the tests use
 *   exactly the same code path.
 */

export type MotionProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotate' | 'opacity' | 'blur' | 'skewX' | 'skewY'

export const MOTION_PROPERTIES: MotionProperty[] = ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'opacity', 'blur', 'skewX', 'skewY']

export type EasingId = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'

export interface Easing {
  id: EasingId
  /** Only for `cubic-bezier`; x values are clamped to 0..1 the way CSS does. */
  bezier?: [number, number, number, number]
}

export interface MotionKeyframe {
  /** Milliseconds from the start of the clip. */
  t: number
  value: number
  /** Easing of the segment that ENDS at this keyframe. */
  easing?: Easing
}

export interface MotionTrack {
  property: MotionProperty
  keyframes: MotionKeyframe[]
  enabled: boolean
}

export type MotionTrigger = 'load' | 'alert' | 'reveal' | 'interaction' | 'queue-complete' | 'custom'

export const MOTION_TRIGGERS: { id: MotionTrigger; label: string }[] = [
  { id: 'load', label: 'On load' },
  { id: 'alert', label: 'On alert activation' },
  { id: 'reveal', label: 'On show' },
  { id: 'interaction', label: 'On interaction' },
  { id: 'queue-complete', label: 'On queue completion' },
  { id: 'custom', label: 'Custom event' },
]

export type MotionDirection = 'up' | 'down' | 'left' | 'right' | 'center' | 'clockwise' | 'counter-clockwise'

export interface MotionClip {
  id: string
  label: string
  /** The preset this clip was created from, so the studio can show a name and regenerate defaults. */
  preset: string
  trigger: MotionTrigger
  /** Milliseconds after the trigger fires. */
  delay: number
  duration: number
  tracks: MotionTrack[]
  /** Extra passes after the first. -1 means loop forever, because JSON cannot carry Infinity. */
  repeat: number
  repeatDelay: number
  alternate: boolean
  /** Free-form name used by the `custom` trigger. */
  event?: string
}

export interface ElementEffects {
  shadow: { enabled: boolean; color: string; opacity: number; blur: number; x: number; y: number }
  glow: { enabled: boolean; color: string; intensity: number; blur: number; spread: number }
  neon: { enabled: boolean; intensity: number; color: string }
  blur: { enabled: boolean; amount: number }
  gradient: { enabled: boolean; angle: number; from: number; to: number; opacity: number }
  mask: { mode: 'none' | 'fade-bottom' | 'fade-top' | 'radial' | 'ellipse'; softness: number; scale: number }
  clip: { shape: 'none' | 'inset' | 'circle' | 'hex' }
}

export interface ElementMotion {
  version: 2
  clips: MotionClip[]
  effects: ElementEffects
  origin: string
  /** Timeline length used by the studio ruler; independent of any single clip. */
  timelineDuration: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

/* ------------------------------------------------------------------ easing */

const CUBIC: Record<'ease-in' | 'ease-out' | 'ease-in-out', (t: number) => number> = {
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - (1 - t) ** 3,
  'ease-in-out': (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
}

/** Newton-Raphson on the CSS cubic-bezier definition, with a bisection fallback for flat curves. */
export function cubicBezier(points: [number, number, number, number], t: number) {
  const [x1, y1, x2, y2] = points
  const bx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3
  const by = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3
  const dx = (u: number) => 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u ** 2 * (1 - x2)
  let u = clamp(t, 0, 1)
  for (let i = 0; i < 6; i += 1) {
    const error = bx(u) - t
    if (Math.abs(error) < 1e-5) return by(u)
    const slope = dx(u)
    if (Math.abs(slope) < 1e-6) break
    u = clamp(u - error / slope, 0, 1)
  }
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i += 1) {
    u = (low + high) / 2
    if (bx(u) < t) low = u
    else high = u
  }
  return by(u)
}

export function evaluateEasing(easing: Easing | undefined, t: number) {
  const x = clamp(t, 0, 1)
  if (!easing || easing.id === 'linear') return x
  if (easing.id === 'cubic-bezier') return cubicBezier(easing.bezier ?? [0.4, 0, 0.2, 1], x)
  return CUBIC[easing.id](x)
}

export const EASING_PRESETS: { id: EasingId; label: string; bezier?: [number, number, number, number] }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease in' },
  { id: 'ease-out', label: 'Ease out' },
  { id: 'ease-in-out', label: 'Ease in out' },
  { id: 'cubic-bezier', label: 'Cubic bezier (soft)', bezier: [0.4, 0, 0.2, 1] },
]

/* ------------------------------------------------------------- sampling */

const REST: Record<MotionProperty, number> = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, blur: 0, skewX: 0, skewY: 0 }

/** Value of one track at a local time. Before the first keyframe and after the last one the ends are held. */
export function sampleTrack(track: MotionTrack, timeMs: number) {
  const frames = track.keyframes
  if (!frames.length) return REST[track.property]
  if (timeMs <= frames[0].t) return frames[0].value
  const last = frames[frames.length - 1]
  if (timeMs >= last.t) return last.value
  for (let i = 1; i < frames.length; i += 1) {
    const to = frames[i]
    if (timeMs > to.t) continue
    const from = frames[i - 1]
    const span = to.t - from.t
    const progress = span <= 0 ? 1 : (timeMs - from.t) / span
    const eased = evaluateEasing(to.easing, progress)
    return from.value + (to.value - from.value) * eased
  }
  return last.value
}

export interface MotionFrame {
  x: number; y: number; scaleX: number; scaleY: number; rotate: number; opacity: number
  blur: number; skewX: number; skewY: number
  /** True while any clip is still running, so a host can stop scheduling work. */
  active: boolean
}

const frameAt = (): MotionFrame => ({ ...REST, active: false })

/** Local time of a clip, or null when the clip is not running at `timeMs`. */
export function clipLocalTime(clip: MotionClip, timeMs: number) {
  const start = clip.delay
  const end = start + clip.duration
  if (timeMs < start) return null
  if (timeMs < end) return timeMs - start
  if (clip.repeat < 0) {
    const cycle = clip.duration + clip.repeatDelay
    const elapsed = timeMs - start
    const index = Math.floor(elapsed / cycle)
    const within = elapsed - index * cycle
    if (within >= clip.duration) return null
    const forward = !clip.alternate || index % 2 === 0
    return forward ? within : clip.duration - within
  }
  const cycles = Math.max(1, clip.repeat + 1)
  const cycle = clip.duration + clip.repeatDelay
  const elapsed = timeMs - start
  const total = cycle * (cycles - 1) + clip.duration
  if (elapsed >= total) return null
  const index = Math.floor(elapsed / cycle)
  const within = elapsed - index * cycle
  if (within >= clip.duration) return null
  const forward = !clip.alternate || index % 2 === 0
  return forward ? within : clip.duration - within
}

/**
 * Samples every clip of an element at `timeMs`. Clips are applied in order, later clips winning per property, which
 * is how an entrance and an idle loop can coexist without one erasing the other.
 */
export function sampleMotion(
  motion: ElementMotion | undefined,
  timeMs: number,
  options: { reducedMotion?: boolean; triggers?: MotionTrigger[] } = {},
) {
  const frame = frameAt()
  if (!motion) return frame
  const allowed = options.triggers
  const clips = options.reducedMotion
    ? []
    : allowed
      ? motion.clips.filter((clip) => allowed.includes(clip.trigger))
      : motion.clips
  for (const clip of clips) {
    const local = clipLocalTime(clip, timeMs)
    if (local === null) continue
    frame.active = true
    for (const track of clip.tracks) {
      if (!track.enabled || !track.keyframes.length) continue
      frame[track.property] = sampleTrack(track, local)
    }
  }
  return frame
}

/** Longest running moment of the element's clips, used to stop the frame loop and to size the timeline. */
export function motionSpan(motion: ElementMotion | undefined) {
  if (!motion) return 0
  let span = motion.timelineDuration || 0
  for (const clip of motion.clips) {
    const cycles = clip.repeat < 0 ? 1 : Math.max(1, clip.repeat + 1)
    const length = clip.delay + cycles * (clip.duration + clip.repeatDelay)
    if (length > span) span = length
  }
  return span
}

export function motionStyle(frame: MotionFrame): Record<string, string | number> {
  const style: Record<string, string | number> = {}
  const transforms: string[] = []
  if (frame.x) transforms.push(`translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`)
  else if (frame.y) transforms.push(`translate3d(0, ${frame.y.toFixed(2)}px, 0)`)
  if (frame.scaleX !== 1 || frame.scaleY !== 1) transforms.push(`scale(${frame.scaleX.toFixed(4)}, ${frame.scaleY.toFixed(4)})`)
  if (frame.rotate) transforms.push(`rotate(${frame.rotate.toFixed(2)}deg)`)
  if (frame.skewX) transforms.push(`skewX(${frame.skewX.toFixed(2)}deg)`)
  if (frame.skewY) transforms.push(`skewY(${frame.skewY.toFixed(2)}deg)`)
  if (transforms.length) style.transform = transforms.join(' ')
  if (frame.opacity !== 1) style.opacity = clamp(frame.opacity, 0, 1)
  if (frame.blur > 0) style.filter = `blur(${frame.blur.toFixed(2)}px)`
  return style
}

/* -------------------------------------------------------------- presets */

export interface PresetContext { duration?: number; intensity?: number; direction?: MotionDirection }

export interface MotionPreset {
  id: string
  label: string
  kind: 'entrance' | 'exit' | 'loop' | 'emphasis'
  /** Clips built from a loop preset repeat forever; everything else plays once. */
  repeat?: number
  defaultDuration: number
  build: (ctx: Required<PresetContext>) => MotionTrack[]
}

const track = (property: MotionProperty, frames: [number, number, Easing?][]): MotionTrack => ({
  property,
  enabled: true,
  keyframes: frames.map(([t, value, easing]) => ({ t, value, easing })),
})

const EASE_OUT: Easing = { id: 'ease-out' }
const EASE_IN_OUT: Easing = { id: 'ease-in-out' }
const SOFT: Easing = { id: 'cubic-bezier', bezier: [0.16, 1, 0.3, 1] }

const offsetFor = (direction: MotionDirection, distance: number) => {
  switch (direction) {
    case 'down': return { x: 0, y: -distance }
    case 'left': return { x: distance, y: 0 }
    case 'right': return { x: -distance, y: 0 }
    case 'center': return { x: 0, y: 0 }
    default: return { x: 0, y: distance }
  }
}

/** The preset library. Each entry is parameterised data, so the studio can tune duration, intensity and direction. */
export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: 'fade-in', label: 'Fade in', kind: 'entrance', defaultDuration: 460,
    build: ({ duration }) => [track('opacity', [[0, 0, EASE_OUT], [duration, 1]])],
  },
  {
    id: 'fade-out', label: 'Fade out', kind: 'exit', defaultDuration: 380,
    build: ({ duration }) => [track('opacity', [[0, 1, EASE_OUT], [duration, 0]])],
  },
  {
    id: 'slide-in', label: 'Slide in', kind: 'entrance', defaultDuration: 560,
    build: ({ duration, intensity, direction }) => {
      const d = offsetFor(direction, Math.round(120 * intensity) || 60)
      return [
        track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.6), 1]]),
        track('x', [[0, d.x, SOFT], [duration, 0]]),
        track('y', [[0, d.y, SOFT], [duration, 0]]),
      ]
    },
  },
  {
    id: 'slide-out', label: 'Slide out', kind: 'exit', defaultDuration: 420,
    build: ({ duration, intensity, direction }) => {
      const d = offsetFor(direction, Math.round(120 * intensity) || 60)
      return [
        track('opacity', [[0, 1, EASE_OUT], [duration, 0]]),
        track('x', [[0, 0, SOFT], [duration, -d.x]]),
        track('y', [[0, 0, SOFT], [duration, -d.y]]),
      ]
    },
  },
  {
    id: 'zoom-in', label: 'Zoom in', kind: 'entrance', defaultDuration: 520,
    build: ({ duration }) => [
      track('scaleX', [[0, 0.82, SOFT], [duration, 1]]),
      track('scaleY', [[0, 0.82, SOFT], [duration, 1]]),
      track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.5), 1]]),
    ],
  },
  {
    id: 'zoom-out', label: 'Zoom out', kind: 'exit', defaultDuration: 400,
    build: ({ duration }) => [
      track('scaleX', [[0, 1, EASE_OUT], [duration, 1.12]]),
      track('scaleY', [[0, 1, EASE_OUT], [duration, 1.12]]),
      track('opacity', [[0, 1], [duration, 0, EASE_OUT]]),
    ],
  },
  {
    id: 'scale-pop', label: 'Scale pop', kind: 'entrance', defaultDuration: 620,
    build: ({ duration, intensity }) => {
      const overshoot = 1 + 0.08 * (intensity || 1)
      return [
        track('scaleX', [[0, 0.6, SOFT], [Math.round(duration * 0.62), overshoot, EASE_OUT], [duration, 1]]),
        track('scaleY', [[0, 0.6, SOFT], [Math.round(duration * 0.62), overshoot, EASE_OUT], [duration, 1]]),
        track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.4), 1]]),
      ]
    },
  },
  {
    id: 'bounce', label: 'Bounce', kind: 'entrance', defaultDuration: 780,
    build: ({ duration, intensity }) => {
      const drop = Math.round(90 * (intensity || 1))
      const third = Math.round(duration / 3)
      return [
        track('y', [[0, -drop, EASE_IN_OUT], [third, 0, EASE_IN_OUT], [third + 120, -Math.round(drop / 4), EASE_IN_OUT], [duration, 0]]),
        track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.3), 1]]),
      ]
    },
  },
  {
    id: 'elastic', label: 'Elastic', kind: 'entrance', defaultDuration: 900,
    build: ({ duration }) => [
      track('scaleX', [[0, 0.7, SOFT], [Math.round(duration * 0.5), 1.06, EASE_IN_OUT], [Math.round(duration * 0.75), 0.985, EASE_IN_OUT], [duration, 1]]),
      track('scaleY', [[0, 0.7, SOFT], [Math.round(duration * 0.5), 1.06, EASE_IN_OUT], [Math.round(duration * 0.75), 0.985, EASE_IN_OUT], [duration, 1]]),
      track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.3), 1]]),
    ],
  },
  {
    id: 'pulse', label: 'Pulse', kind: 'loop', repeat: -1, defaultDuration: 1800,
    build: ({ duration }) => [
      track('scaleX', [[0, 1, EASE_IN_OUT], [duration / 2, 1.035, EASE_IN_OUT], [duration, 1]]),
      track('scaleY', [[0, 1, EASE_IN_OUT], [duration / 2, 1.035, EASE_IN_OUT], [duration, 1]]),
    ],
  },
  {
    id: 'shake', label: 'Shake', kind: 'emphasis', repeat: 0, defaultDuration: 460,
    build: ({ duration, intensity }) => {
      const amount = Math.round(8 * (intensity || 1))
      const step = Math.round(duration / 6)
      return [track('x', [[0, 0], [step, amount, EASE_IN_OUT], [step * 2, -amount, EASE_IN_OUT], [step * 3, amount * 0.6, EASE_IN_OUT], [step * 4, -amount * 0.6, EASE_IN_OUT], [duration, 0, EASE_OUT]])]
    },
  },
  {
    id: 'flip', label: 'Flip', kind: 'entrance', defaultDuration: 700,
    build: ({ duration }) => [
      track('scaleX', [[0, 0, EASE_IN_OUT], [duration, 1]]),
      track('rotate', [[0, -8, SOFT], [duration, 0]]),
      track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.6), 1]]),
    ],
  },
  {
    id: 'rotate-in', label: 'Rotate', kind: 'entrance', defaultDuration: 640,
    build: ({ duration, direction }) => {
      const from = direction === 'counter-clockwise' ? 12 : -12
      return [
        track('rotate', [[0, from, SOFT], [duration, 0]]),
        track('scaleX', [[0, 0.9, SOFT], [duration, 1]]),
        track('scaleY', [[0, 0.9, SOFT], [duration, 1]]),
        track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.5), 1]]),
      ]
    },
  },
  {
    id: 'blur-reveal', label: 'Blur reveal', kind: 'entrance', defaultDuration: 620,
    build: ({ duration }) => [
      track('blur', [[0, 14, EASE_OUT], [duration, 0]]),
      track('opacity', [[0, 0.2, EASE_OUT], [duration, 1]]),
      track('scaleX', [[0, 1.03, SOFT], [duration, 1]]),
      track('scaleY', [[0, 1.03, SOFT], [duration, 1]]),
    ],
  },
  {
    id: 'typewriter', label: 'Typewriter', kind: 'entrance', defaultDuration: 1400,
    build: ({ duration }) => [
      track('x', [[0, -10, EASE_OUT], [duration, 0]]),
      track('skewX', [[0, 6, EASE_OUT], [Math.round(duration * 0.6), 0]]),
      track('opacity', [[0, 0, EASE_OUT], [Math.round(duration * 0.25), 1]]),
    ],
  },
  {
    id: 'glitch', label: 'Glitch', kind: 'emphasis', repeat: 1, defaultDuration: 520,
    build: ({ duration, intensity }) => {
      const amount = Math.round(6 * (intensity || 1))
      const step = Math.round(duration / 4)
      return [
        track('x', [[0, 0], [step, amount, EASE_IN_OUT], [step * 2, -amount, EASE_IN_OUT], [step * 3, Math.round(amount / 2), EASE_IN_OUT], [duration, 0]]),
        track('skewX', [[0, 0], [step, -4, EASE_IN_OUT], [step * 2, 5, EASE_IN_OUT], [duration, 0]]),
        track('opacity', [[0, 1], [step, 0.72], [step * 2, 1], [step * 3, 0.86], [duration, 1]]),
      ]
    },
  },
  {
    id: 'neon-glow', label: 'Neon glow', kind: 'loop', repeat: -1, defaultDuration: 2400,
    build: ({ duration }) => [
      track('blur', [[0, 0, EASE_IN_OUT], [duration / 2, 1.2, EASE_IN_OUT], [duration, 0]]),
      track('scaleX', [[0, 1, EASE_IN_OUT], [duration / 2, 1.012, EASE_IN_OUT], [duration, 1]]),
      track('scaleY', [[0, 1, EASE_IN_OUT], [duration / 2, 1.012, EASE_IN_OUT], [duration, 1]]),
    ],
  },
  {
    id: 'shimmer', label: 'Shimmer', kind: 'loop', repeat: -1, defaultDuration: 3200,
    build: ({ duration }) => [track('opacity', [[0, 1, EASE_IN_OUT], [duration / 2, 0.86, EASE_IN_OUT], [duration, 1]])],
  },
  {
    id: 'floating', label: 'Floating', kind: 'loop', repeat: -1, defaultDuration: 4200,
    build: ({ duration, intensity }) => {
      const lift = Math.round(8 * (intensity || 1))
      return [track('y', [[0, 0, EASE_IN_OUT], [duration / 2, -lift, EASE_IN_OUT], [duration, 0]])]
    },
  },
  {
    id: 'breathing', label: 'Breathing', kind: 'loop', repeat: -1, defaultDuration: 5200,
    build: ({ duration, intensity }) => {
      const growth = 1 + 0.02 * (intensity || 1)
      return [
        track('scaleX', [[0, 1, EASE_IN_OUT], [duration / 2, growth, EASE_IN_OUT], [duration, 1]]),
        track('scaleY', [[0, 1, EASE_IN_OUT], [duration / 2, growth, EASE_IN_OUT], [duration, 1]]),
      ]
    },
  },
  {
    id: 'gradient-motion', label: 'Gradient motion', kind: 'loop', repeat: -1, defaultDuration: 6000,
    build: ({ duration }) => [track('rotate', [[0, -1.2, EASE_IN_OUT], [duration / 2, 1.2, EASE_IN_OUT], [duration, -1.2]])],
  },
  {
    id: 'particle-reveal', label: 'Particle reveal', kind: 'entrance', defaultDuration: 820,
    build: ({ duration }) => [
      track('scaleX', [[0, 1.06, SOFT], [duration, 1]]),
      track('scaleY', [[0, 1.06, SOFT], [duration, 1]]),
      track('blur', [[0, 8, EASE_OUT], [duration, 0]]),
      track('opacity', [[0, 0.35, EASE_OUT], [duration, 1]]),
    ],
  },
]

export const PRESET_BY_ID = new Map(MOTION_PRESETS.map((preset) => [preset.id, preset]))

export function clipFromPreset(presetId: string, context: PresetContext = {}, overrides: Partial<MotionClip> = {}): MotionClip {
  const preset = PRESET_BY_ID.get(presetId) ?? MOTION_PRESETS[0]
  const resolved: Required<PresetContext> = {
    duration: clamp(num(context.duration, preset.defaultDuration), 60, 20_000),
    intensity: clamp(num(context.intensity, 1), 0.1, 3),
    direction: context.direction ?? 'up',
  }
  return {
    id: `clip_${Math.random().toString(36).slice(2, 9)}`,
    label: preset.label,
    preset: preset.id,
    trigger: overrides.trigger ?? 'load',
    delay: 0,
    duration: resolved.duration,
    tracks: preset.build(resolved),
    repeat: preset.repeat ?? 0,
    repeatDelay: preset.kind === 'loop' ? 0 : 120,
    alternate: false,
    ...overrides,
  }
}

/* -------------------------------------------------------------- effects */

const MONO = '#f6f6f4'

export function createEffects(): ElementEffects {
  return {
    shadow: { enabled: false, color: '#000000', opacity: 0.5, blur: 28, x: 0, y: 14 },
    glow: { enabled: false, color: MONO, intensity: 0.55, blur: 26, spread: 0 },
    neon: { enabled: false, intensity: 0.7, color: MONO },
    blur: { enabled: false, amount: 2 },
    gradient: { enabled: false, angle: 135, from: 0.06, to: 0, opacity: 1 },
    mask: { mode: 'none', softness: 22, scale: 100 },
    clip: { shape: 'none' },
  }
}

export function createMotion(clips: MotionClip[] = []): ElementMotion {
  return { version: 2, clips, effects: createEffects(), origin: 'center center', timelineDuration: 4000 }
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

/** Accepts anything a saved overlay or a hand-edited file can contain and returns a usable document. */
export function normalizeMotion(raw: unknown): ElementMotion | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Partial<ElementMotion>
  const base = createMotion()
  const clips = Array.isArray(source.clips) ? source.clips.slice(0, 32).map(normalizeClip).filter(Boolean) as MotionClip[] : []
  const effects: Partial<ElementEffects> = source.effects && typeof source.effects === 'object' ? source.effects : {}
  const read = <T extends object>(value: T | undefined, fallback: T): T => ({ ...fallback, ...(value && typeof value === 'object' ? value : {}) })
  return {
    version: 2,
    clips,
    origin: typeof source.origin === 'string' && source.origin.length <= 40 ? source.origin : base.origin,
    timelineDuration: clamp(num(source.timelineDuration, base.timelineDuration), 500, 60_000),
    effects: {
      shadow: read(effects.shadow, base.effects.shadow),
      glow: read(effects.glow, base.effects.glow),
      neon: read(effects.neon, base.effects.neon),
      blur: read(effects.blur, base.effects.blur),
      gradient: read(effects.gradient, base.effects.gradient),
      mask: read(effects.mask, base.effects.mask),
      clip: read(effects.clip, base.effects.clip),
    },
  }
}

function normalizeClip(raw: unknown): MotionClip | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<MotionClip>
  const tracks: MotionTrack[] = []
  for (const candidate of Array.isArray(source.tracks) ? source.tracks : []) {
    if (!candidate || !MOTION_PROPERTIES.includes(candidate.property)) continue
    const keyframes = (Array.isArray(candidate.keyframes) ? candidate.keyframes : [])
      .filter((frame) => frame && Number.isFinite(Number(frame.t)) && Number.isFinite(Number(frame.value)))
      .map((frame) => ({ t: clamp(Number(frame.t), 0, 60_000), value: Number(frame.value), easing: frame.easing }))
      .sort((a, b) => a.t - b.t)
    if (keyframes.length) tracks.push({ property: candidate.property, keyframes, enabled: bool(candidate.enabled, true) })
  }
  if (!tracks.length) return null
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `clip_${Math.random().toString(36).slice(2, 9)}`,
    label: typeof source.label === 'string' ? source.label.slice(0, 40) : 'Clip',
    preset: typeof source.preset === 'string' ? source.preset : 'custom',
    trigger: MOTION_TRIGGERS.some((item) => item.id === source.trigger) ? (source.trigger as MotionTrigger) : 'load',
    delay: clamp(num(source.delay, 0), 0, 20_000),
    duration: clamp(num(source.duration, 600), 60, 20_000),
    // Infinity, 999 and -1 all mean forever; anything else is a pass count. Null (the JSON form of a missing
    // value) is treated as a single pass rather than as an error.
    repeat: source.repeat === Infinity || num(source.repeat, 0) >= 999 || num(source.repeat, 0) < 0 ? -1 : Math.round(clamp(num(source.repeat, 0), 0, 50)),
    repeatDelay: clamp(num(source.repeatDelay, 0), 0, 10_000),
    alternate: bool(source.alternate, false),
    event: typeof source.event === 'string' ? source.event.slice(0, 40) : undefined,
    tracks,
  }
}

/**
 * Effects are pure style, evaluated once per render rather than per frame, so they never compete with the sampler
 * loop. Motion blur is added on top by the host when a clip animates it.
 */
/** Hex to rgba. Accepts #rgb/#rrggbb and falls back to transparent so a bad colour cannot blank an element. */
export function rgba(color: string, alpha: number) {
  const value = String(color ?? '').trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  const parts = short ? [short[1] + short[1], short[2] + short[2], short[3] + short[3]] : long ? [long[1], long[2], long[3]] : null
  if (!parts) return `rgba(0, 0, 0, ${clamp(alpha, 0, 1)})`
  const [r, g, b] = parts.map((part) => parseInt(part, 16))
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

export function effectsStyle(effects: ElementEffects, extraBlur = 0) {
  const style: Record<string, string | number> = {}
  const shadows: string[] = []
  if (effects.shadow.enabled) {
    shadows.push(`${Math.round(effects.shadow.x)}px ${Math.round(effects.shadow.y)}px ${Math.round(effects.shadow.blur)}px ${rgba(effects.shadow.color, effects.shadow.opacity)}`)
  }
  if (effects.glow.enabled) {
    // Blur and spread are separate CSS lengths, so the studio can make a tight rim or a wide halo.
    shadows.push(`0 0 ${Math.round(effects.glow.blur)}px ${Math.round(effects.glow.spread)}px ${rgba(effects.glow.color, effects.glow.intensity)}`)
  }
  if (effects.neon.enabled) {
    shadows.push(`0 0 ${Math.round(10 + effects.neon.intensity * 18)}px ${effects.neon.color}`, `0 0 ${Math.round(28 + effects.neon.intensity * 30)}px ${effects.neon.color}`)
  }
  if (shadows.length) style.boxShadow = shadows.join(', ')
  const blur = (effects.blur.enabled ? effects.blur.amount : 0) + extraBlur
  if (blur > 0) style.filter = `blur(${blur.toFixed(2)}px)`
  if (effects.gradient.enabled) {
    style.backgroundImage = `linear-gradient(${Math.round(effects.gradient.angle)}deg, rgba(246,246,244,${clamp(effects.gradient.from, 0, 1)}), rgba(246,246,244,${clamp(effects.gradient.to, 0, 1)}))`
    style.backgroundBlendMode = 'overlay'
  }
  if (effects.mask.mode !== 'none') {
    const soft = clamp(effects.mask.softness, 0, 100)
    const reach = clamp(effects.mask.scale, 20, 100)
    style.maskImage = effects.mask.mode === 'radial' || effects.mask.mode === 'ellipse'
      ? `radial-gradient(${effects.mask.mode === 'ellipse' ? 'ellipse' : 'circle'} at 50% 50%, #000 ${reach - soft * 0.5}%, transparent ${reach}%)`
      : `linear-gradient(${effects.mask.mode === 'fade-top' ? 'to top' : 'to bottom'}, #000 ${100 - soft}%, transparent 100%)`
    style.WebkitMaskImage = style.maskImage
  }
  if (effects.clip.shape !== 'none') {
    style.clipPath = effects.clip.shape === 'circle'
      ? 'circle(50% at 50% 50%)'
      : effects.clip.shape === 'hex'
        ? 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)'
        : 'inset(0 round 18px)'
  }
  return style as Record<string, string | number>
}


/* ------------------------------------------------ editor helpers (shared) */

export type MotionPresetKind = MotionPreset['kind']

export const MOTION_PROPERTY_LABELS: Record<MotionProperty, string> = {
  x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotate: 'Rotate', opacity: 'Opacity', blur: 'Blur',
  skewX: 'Skew X', skewY: 'Skew Y',
}

/** Adds or replaces the keyframe at `t`, keeping the track sorted so sampling stays monotonic. */
export function upsertKeyframe(tracks: MotionTrack[], property: MotionProperty, t: number, value: number, easing?: Easing): MotionTrack[] {
  const time = Math.max(0, Math.round(t))
  const next = tracks.filter((track) => track.property !== property || track.keyframes.length > -1)
  const existing = next.find((track) => track.property === property)
  const keyframes = [...(existing?.keyframes ?? [])]
  const frame = { t: time, value, easing }
  const index = keyframes.findIndex((keyframe) => Math.abs(keyframe.t - time) < 1)
  if (index >= 0) keyframes[index] = frame
  else keyframes.push(frame)
  keyframes.sort((a, b) => a.t - b.t)
  const track = { property, keyframes, enabled: true }
  return existing ? next.map((item) => (item.property === property ? track : item)) : [...next, track]
}

/** Removes one keyframe; an empty track disappears rather than lingering as a no-op. */
export function removeKeyframe(tracks: MotionTrack[], property: MotionProperty, t: number): MotionTrack[] {
  return tracks
    .map((track) => (track.property === property ? { ...track, keyframes: track.keyframes.filter((keyframe) => Math.abs(keyframe.t - t) >= 1) } : track))
    .filter((track) => track.keyframes.length > 0)
}
