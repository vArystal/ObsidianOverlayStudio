import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MotionHost, motionSubscriberCount, setMotionPreviewTime } from './MotionHost'
import { clipFromPreset, createMotion, motionStyle, sampleMotion } from '../lib/motion'
import type { OverlayElement } from '../types'

afterEach(() => { setMotionPreviewTime(null); cleanup() })

const element = (motion = createMotion([clipFromPreset('slide-in', {}, { delay: 0, duration: 400 })])) => ({ id: 'e', type: 'text', props: {}, motion } as unknown as OverlayElement)

describe('motion host', () => {
  it('applies exactly what the sampler computes, so a preview cannot drift from the runtime', () => {
    const motion = createMotion([clipFromPreset('slide-in', {}, { delay: 0, duration: 400 })])
    const { container } = render(<MotionHost element={element(motion)} reducedMotion><span /></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement
    const expected = motionStyle(sampleMotion(motion, 10_000, { reducedMotion: true }))
    expect(host.style.transform).toBe(String(expected.transform ?? ''))
    // The host only writes properties the sampler actually emits; an omitted value stays untouched so an
    // element's own CSS opacity is not clobbered by a rest state.
    expect(host.style.opacity).toBe(expected.opacity === undefined ? '' : String(expected.opacity))
  })

  it('scrubs to a fixed time while the studio playhead moves', () => {
    const motion = createMotion([clipFromPreset('fade-in', {}, { delay: 0, duration: 400 })])
    setMotionPreviewTime(200)
    const { container } = render(<MotionHost element={element(motion)}><span /></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement
    const midpoint = motionStyle(sampleMotion(motion, 200, { reducedMotion: false }))
    expect(Number(host.style.opacity)).toBeCloseTo(Number(midpoint.opacity), 2)
  })

  it('leaves no subscribers behind after unmount', () => {
    const { unmount } = render(<MotionHost element={element()}><span /></MotionHost>)
    const before = motionSubscriberCount()
    unmount()
    expect(motionSubscriberCount()).toBeLessThanOrEqual(before)
    expect(motionSubscriberCount()).toBe(0)
  })

  it('treats a legacy element with no motion as a plain wrapper', () => {
    const { container } = render(<MotionHost element={{ id: 'e2', type: 'text', props: {} } as unknown as OverlayElement}><span /></MotionHost>)
    const host = container.querySelector('.motion-host') as HTMLElement | null
    // A legacy element gets a plain wrapper with no transform work scheduled at all.
    if (host) expect(host.style.transform).toBe('')
    expect(container.querySelector('span')).toBeTruthy()
  })
})
