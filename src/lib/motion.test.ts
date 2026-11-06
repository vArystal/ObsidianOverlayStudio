import { describe, expect, it } from 'vitest'
import {
  clipFromPreset, clipLocalTime, createEffects, createMotion, cubicBezier, effectsStyle, evaluateEasing,
  MOTION_PRESETS, motionSpan, motionStyle, normalizeMotion, sampleMotion, sampleTrack,
} from './motion'

const ctx = { duration: 600, intensity: 1, direction: 'up' as const }

describe('easing', () => {
  it('pins the ends and stays monotonic', () => {
    for (const id of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(evaluateEasing({ id }, 0)).toBeCloseTo(0, 5)
      expect(evaluateEasing({ id }, 1)).toBeCloseTo(1, 5)
      const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => evaluateEasing({ id }, t))
      expect(samples).toEqual([...samples].sort((a, b) => a - b))
    }
  })

  it('resolves a cubic bezier against its control points', () => {
    expect(cubicBezier([0.42, 0, 1, 1], 0)).toBeCloseTo(0, 2)
    expect(cubicBezier([0.42, 0, 1, 1], 1)).toBeCloseTo(1, 2)
    expect(cubicBezier([0.42, 0, 1, 1], 0.5)).toBeLessThan(0.5)
    expect(cubicBezier([0, 0, 0.58, 1], 0.5)).toBeGreaterThan(0.5)
  })

  it('clamps hostile values instead of returning NaN', () => {
    expect(evaluateEasing({ id: 'ease-out' }, -4)).toBe(0)
    expect(evaluateEasing({ id: 'ease-out' }, 9)).toBe(1)
    // CSS lets a control point's y leave 0..1 (that is how overshoot curves are written), so the value only has
    // to stay finite and inside a sane band rather than inside the unit interval.
    const wild = evaluateEasing({ id: 'cubic-bezier', bezier: [2, -3, 5, 9] }, 0.5)
    expect(Number.isFinite(wild)).toBe(true)
    expect(Math.abs(wild)).toBeLessThan(20)
  })
})

describe('keyframes', () => {
  it('holds the ends and interpolates the middle with the segment easing', () => {
    const track = { property: 'opacity' as const, enabled: true, keyframes: [{ t: 100, value: 0 }, { t: 300, value: 1, easing: { id: 'linear' as const } }] }
    expect(sampleTrack(track, 0)).toBe(0)
    expect(sampleTrack(track, 100)).toBe(0)
    expect(sampleTrack(track, 200)).toBeCloseTo(0.5, 5)
    expect(sampleTrack(track, 999)).toBe(1)
  })

  it('sorts and repairs keyframes written by hand', () => {
    const motion = normalizeMotion({ clips: [{ duration: 500, tracks: [{ property: 'rotate', keyframes: [{ t: 400, value: 10 }, { t: 0, value: 0 }] }] }] })
    expect(motion?.clips[0].tracks[0].keyframes.map((frame) => frame.t)).toEqual([0, 400])
  })
})

describe('clips', () => {
  it('reports the local time through delay, repeat and alternate', () => {
    const clip = { ...clipFromPreset('pulse', ctx), duration: 100, delay: 50, repeat: 1, repeatDelay: 20, alternate: true }
    expect(clipLocalTime(clip, 10)).toBeNull()
    expect(clipLocalTime(clip, 100)).toBe(50)
    // 200ms in is the second (reversed) pass of the alternate repeat.
    expect(clipLocalTime(clip, 200)).toBeCloseTo(70, 5)
    expect(clipLocalTime(clip, 400)).toBeNull()
    // A single pass ends at delay + duration; past that the clip is not running.
    // One pass runs from the delay to delay + duration; anything later is finished.
    expect(clipLocalTime({ ...clip, repeat: 0 }, 100)).toBeCloseTo(50, 5)
    expect(clipLocalTime({ ...clip, repeat: 0 }, 151)).toBeNull()
  })

  it('loops forever without ever going negative', () => {
    const clip = { ...clipFromPreset('floating', ctx), duration: 1000, repeat: Infinity }
    for (const t of [0, 900, 1000, 2500, 99_000]) {
      const local = clipLocalTime(clip, t)
      expect(local === null || local >= 0).toBe(true)
    }
  })

  it('later clips win per property so an entrance and a loop can share an element', () => {
    const motion = createMotion([
      { ...clipFromPreset('fade-in', ctx), duration: 400 },
      { ...clipFromPreset('floating', ctx), delay: 400, duration: 1000, repeat: Infinity },
    ])
    const mid = sampleMotion(motion, 200)
    expect(mid.opacity).toBeLessThan(1)
    const later = sampleMotion(motion, 900)
    expect(later.y).not.toBe(0)
  })
})

describe('presets', () => {
  it('covers the required library and every preset builds real tracks', () => {
    const ids = MOTION_PRESETS.map((preset) => preset.id)
    for (const required of ['fade-in', 'fade-out', 'slide-in', 'slide-out', 'zoom-in', 'zoom-out', 'scale-pop', 'bounce', 'elastic', 'pulse', 'shake', 'flip', 'rotate-in', 'blur-reveal', 'typewriter', 'glitch', 'neon-glow', 'shimmer', 'floating', 'breathing', 'gradient-motion', 'particle-reveal']) {
      expect(ids).toContain(required)
    }
    for (const preset of MOTION_PRESETS) {
      const tracks = preset.build({ duration: 500, intensity: 1, direction: 'up' })
      expect(tracks.length).toBeGreaterThan(0)
      for (const track of tracks) expect(track.keyframes.length).toBeGreaterThan(1)
    }
  })

  it('honours duration and intensity rather than hardcoding one animation', () => {
    const slow = clipFromPreset('slide-in', { duration: 900 })
    const fast = clipFromPreset('slide-in', { duration: 300 })
    expect(slow.duration).toBe(900)
    expect(fast.duration).toBe(300)
    const strong = clipFromPreset('floating', { intensity: 2 })
    const gentle = clipFromPreset('floating', { intensity: 0.5 })
    expect(Math.abs(strong.tracks[0].keyframes[1].value)).toBeGreaterThan(Math.abs(gentle.tracks[0].keyframes[1].value))
  })
})

describe('document', () => {
  it('returns undefined for a legacy element and repairs garbage', () => {
    expect(normalizeMotion(undefined)).toBeUndefined()
    expect(normalizeMotion('nonsense')).toBeUndefined()
    const repaired = normalizeMotion({ clips: [{ duration: -5, tracks: [{ property: 'nope', keyframes: [] }, { property: 'opacity', keyframes: [{ t: -10, value: 2 }] }] }], timelineDuration: 10 ** 9 })
    expect(repaired?.clips).toHaveLength(1)
    expect(repaired?.clips[0].duration).toBe(60)
    expect(repaired?.clips[0].tracks[0].keyframes[0].t).toBe(0)
    expect(repaired?.timelineDuration).toBe(60_000)
  })

  it('drops clips that have no usable keyframes', () => {
    expect(normalizeMotion({ clips: [{ tracks: [] }, { }] })?.clips).toHaveLength(0)
  })

  it('measures the span so the frame loop knows when to stop', () => {
    const motion = createMotion([{ ...clipFromPreset('fade-in', ctx), duration: 400, delay: 100 }])
    expect(motionSpan(motion)).toBeGreaterThanOrEqual(500)
    expect(motionSpan(createMotion([{ ...clipFromPreset('pulse'), repeat: Infinity }]))).toBeGreaterThan(0)
  })

  it('produces compositor-friendly style and respects reduced motion', () => {
    const motion = createMotion([clipFromPreset('slide-in', ctx)])
    expect(motionStyle(sampleMotion(motion, 100)).transform).toContain('translate3d')
    const still = sampleMotion(motion, 10, { reducedMotion: true })
    expect(still.active).toBe(false)
    expect(still.opacity).toBe(1)
  })

  it('only samples clips whose trigger is active', () => {
    const motion = createMotion([{ ...clipFromPreset('fade-in', ctx), trigger: 'alert' }])
    expect(sampleMotion(motion, 100, { triggers: ['load'] }).opacity).toBe(1)
    expect(sampleMotion(motion, 100, { triggers: ['alert'] }).opacity).toBeLessThan(1)
  })

  it('builds monochrome effects that serialise and never emit colour', () => {
    const effects = createEffects()
    effects.glow.enabled = true
    effects.neon.enabled = true
    const style = effectsStyle(effects)
    expect(String(style.boxShadow)).toContain('#f6f6f4')
    expect(String(style.boxShadow)).not.toMatch(/#(d8ad55|a855f7|7c3aed)/i)
    const motion = normalizeMotion({ effects: { glow: { enabled: true, color: '#ffffff', size: 40, intensity: 0.9 } } })
    expect(motion?.effects.glow.enabled).toBe(true)
    expect(motion?.effects.shadow.enabled).toBe(false)
  })
})
