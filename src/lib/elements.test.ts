import { describe, expect, it } from 'vitest'
import { createElement } from './elements'

describe('new element placement', () => {
  it('leaves the previous layer clickable instead of burying it', () => {
    const first = createElement('text', 0)
    const second = createElement('text', 1)
    // The exposed strip of the earlier layer must be a comfortable click target, not a sliver.
    const exposed = second.y - first.y
    expect(exposed).toBeGreaterThanOrEqual(100)
    expect(second.x - first.x).toBeGreaterThanOrEqual(100)
  })

  it('keeps the whole cascade inside a 1920x1080 canvas', () => {
    for (let index = 0; index < 6; index += 1) {
      const element = createElement('shape', index)
      expect(element.x + element.width).toBeLessThanOrEqual(1920)
      expect(element.y + element.height).toBeLessThanOrEqual(1080)
    }
  })
})
