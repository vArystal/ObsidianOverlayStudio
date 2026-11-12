import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from '../lib/elements'
import { clipFromPreset, createMotion, hasInfiniteClip, motionPlaybackSpan, motionSpan } from '../lib/motion'
import { MotionHost, motionSubscriberCount, setMotionPreviewTime } from './MotionHost'
import { OverlayStage } from './OverlayStage'
import { getTheme } from '../lib/themes'
import { createEmptyOverlay } from '../lib/elements'
import type { OverlayElement } from '../types'

// A hand-driven frame clock: the host's loop is the thing under test, so the test owns time.
let clock = 0
let frames: FrameRequestCallback[] = []
const step = (ms: number) => {
  clock += ms
  const due = frames
  frames = []
  act(() => { due.forEach((callback) => callback(clock)) })
}

beforeEach(() => {
  clock = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setMotionPreviewTime(null)
})

const withMotion = (preset: string, repeat?: number): OverlayElement => {
  const element = createElement('text')
  const clip = clipFromPreset(preset, { duration: 1800 })
  if (repeat !== undefined) clip.repeat = repeat
  element.motion = createMotion([clip])
  return element
}

/**
 * jsdom's CSS parser drops `transform`, so a transform-only preset cannot be observed in a test. Opacity is
 * supported, and the sampler is property-agnostic, so the loop and scrub assertions ride one opacity track.
 */
const withOpacityMotion = (repeat: number): OverlayElement => {
  const element = createElement('text')
  const clip = clipFromPreset('pulse', { duration: 1800 })
  clip.repeat = repeat
  clip.tracks = [{ property: 'opacity', enabled: true, keyframes: [{ t: 0, value: 0.35 }, { t: 900, value: 1 }, { t: 1800, value: 0.35 }] }]
  element.motion = createMotion([clip])
  return element
}

describe('motion playback span', () => {
  it('treats a looping clip as infinite and a finite clip as bounded', () => {
    const looping = withMotion('pulse')
    expect(hasInfiniteClip(looping.motion)).toBe(true)
    expect(motionPlaybackSpan(looping.motion)).toBe(Number.POSITIVE_INFINITY)
    // The ruler still needs a finite one-cycle length for the timeline and the still frame.
    expect(motionSpan(looping.motion)).toBeGreaterThan(0)
    expect(Number.isFinite(motionSpan(looping.motion))).toBe(true)

    const once = withMotion('fade-in', 0)
    expect(hasInfiniteClip(once.motion)).toBe(false)
    expect(Number.isFinite(motionPlaybackSpan(once.motion))).toBe(true)
  })
})

describe('MotionHost loop', () => {
  it('keeps sampling a pulse preset long after one cycle', () => {
    // Regression: the host unsubscribed at span + 60, so a loop froze after its first breath.
    const element = withOpacityMotion(-1)
    const { container } = render(<MotionHost element={element}><span>loop</span></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement
    expect(host).toBeTruthy()

    for (let i = 0; i < 30; i += 1) step(1000)
    const at30s = host.style.opacity
    expect(at30s).not.toBe('')
    step(700)
    expect(host.style.opacity).not.toBe(at30s)
    expect(motionSubscriberCount()).toBe(1)
  })

  it('stops scheduling once a finite clip is finished', () => {
    const element = withMotion('fade-in', 0)
    element.motion!.clips[0].duration = 200
    render(<MotionHost element={element}><span>finite</span></MotionHost>)
    step(4000)
    expect(motionSubscriberCount()).toBe(0)
  })

  it('schedules nothing for an element without motion', () => {
    const element = createElement('text')
    render(<MotionHost element={element}><span>static</span></MotionHost>)
    step(1000)
    expect(motionSubscriberCount()).toBe(0)
  })

  it('shows the still frame under reduced motion instead of looping', () => {
    const element = withOpacityMotion(-1)
    const { container } = render(<MotionHost element={element} reducedMotion><span>still</span></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement
    // Reduced motion means rest, not a paused frame: the sampler drops the clips and nothing is scheduled.
    expect(host.style.opacity === '' || host.style.opacity === '1').toBe(true)
    expect(motionSubscriberCount()).toBe(0)
    step(5000)
    expect(host.style.opacity === '' || host.style.opacity === '1').toBe(true)
  })

  it('samples the scrub time so the studio timeline moves the element', () => {
    const element = withOpacityMotion(-1)
    const { container } = render(<MotionHost element={element}><span>scrub</span></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement
    act(() => setMotionPreviewTime(0))
    const atZero = host.style.opacity
    act(() => setMotionPreviewTime(450))
    const later = host.style.opacity
    expect(later).not.toBe(atZero)
  })
})

describe('editor canvas scrubbing', () => {
  it('moves an element on the stage when the studio playhead changes', () => {
    // Acceptance: scrub → visible movement on the canvas. Before CP35 the canvas never mounted a host.
    const overlay = createEmptyOverlay('Scrub')
    overlay.elements.push(withOpacityMotion(-1))
    const view = render(
      <OverlayStage overlay={overlay} theme={getTheme(overlay.theme.id)} mode="editor" scale={1} staticElements={false} reducedMotion={false} />,
    )
    const host = view.container.querySelector('.motion-host') as HTMLElement
    expect(host).toBeTruthy()
    act(() => setMotionPreviewTime(0))
    const atZero = host.style.opacity
    act(() => setMotionPreviewTime(450))
    expect(host.style.opacity).not.toBe(atZero)
    expect(host.style.opacity).not.toBe('')
  })
})

describe('motion precedence over the legacy entrance', () => {
  it('suppresses element-anim-* when keyframed clips exist, in both modes', () => {
    const overlay = createEmptyOverlay('Precedence')
    const keyframed = withMotion('pulse')
    keyframed.animation.type = 'slide'
    overlay.elements.push(keyframed)
    const theme = getTheme(overlay.theme.id)

    for (const mode of ['editor', 'runtime'] as const) {
      const view = render(
        <OverlayStage overlay={overlay} theme={theme} mode={mode} scale={1} staticElements={false} reducedMotion={false} />,
      )
      const content = view.container.querySelector('.element-content') as HTMLElement
      expect(content.className).toContain('element-anim-none')
      expect(content.className).not.toContain('element-anim-slide')
      view.unmount()
    }
  })

  it('still applies the entrance class when there are no clips', () => {
    const overlay = createEmptyOverlay('Legacy')
    const legacy = createElement('text')
    legacy.animation.type = 'slide'
    overlay.elements.push(legacy)
    const view = render(
      <OverlayStage overlay={overlay} theme={getTheme(overlay.theme.id)} mode="editor" scale={1} staticElements={false} reducedMotion={false} />,
    )
    expect((view.container.querySelector('.element-content') as HTMLElement).className).toContain('element-anim-slide')
  })
})
