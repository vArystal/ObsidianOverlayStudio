import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from '../../lib/elements'
import { MOTION_PROPERTIES, MOTION_PROPERTY_LABELS, clipFromPreset, createMotion } from '../../lib/motion'
import { MotionStudio } from './MotionStudio'
import type { OverlayElement } from '../../types'

afterEach(cleanup)

const withClip = (): OverlayElement => {
  const element = createElement('text')
  element.motion = createMotion([clipFromPreset('blur-reveal', { duration: 900 })])
  return element
}

describe('motion studio keyframes', () => {
  it('offers a keyframe row for every property the sampler understands', () => {
    // CP35: the editor used to expose 6 of 9 properties, so blur, skewX and skewY presets could not be edited.
    const element = withClip()
    render(<MotionStudio element={element} onChange={() => {}} />)
    for (const property of MOTION_PROPERTIES) {
      expect(screen.getByLabelText(`Add ${property} keyframe`)).toBeTruthy()
      expect(screen.getAllByText(MOTION_PROPERTY_LABELS[property]).length).toBeGreaterThan(0)
    }
    expect(MOTION_PROPERTIES).toHaveLength(9)
    expect(MOTION_PROPERTIES).toEqual(expect.arrayContaining(['blur', 'skewX', 'skewY']))
  })
})
