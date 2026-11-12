import { describe, expect, it } from 'vitest'
import { clampElement, resizeWithAspect, MIN_ELEMENT_SIZE } from './geometry'
import type { OverlayElement } from '../types'

const element = (overrides: Partial<OverlayElement> = {}): OverlayElement => ({
  id: 'e1', type: 'image', name: 'Image', x: 100, y: 100, width: 400, height: 200, rotation: 0,
  opacity: 1, visible: true, locked: false, includeInOutput: true, maintainAspectRatio: true,
  props: {}, decoration: {} as OverlayElement['decoration'], animation: {} as OverlayElement['animation'],
  ...overrides,
} as OverlayElement)

describe('CP41 resize keeps the aspect ratio after clamping', () => {
  it('holds the ratio when the pointer would push the layer past the canvas edge', () => {
    // 2000px wide on a 1920 canvas used to be clamped to 1920 while the height kept the pointer value, breaking 2:1.
    const result = resizeWithAspect(element(), 'e', { x: 100, y: 100, width: 4000, height: 2000 }, 1920, 1080)
    expect(result.width).toBeLessThanOrEqual(1920)
    expect(result.width / result.height).toBeCloseTo(2, 2)
  })

  it('keeps the ratio when dragging the west edge inward against the left bound', () => {
    const result = resizeWithAspect(element({ x: 20 }), 'w', { x: -900, y: 100, width: 1300, height: 650 }, 1920, 1080)
    expect(result.width / result.height).toBeCloseTo(2, 2)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
  })

  it('never shrinks below the minimum size and stays inside the canvas', () => {
    const result = resizeWithAspect(element(), 'se', { x: 100, y: 100, width: 1, height: 1 }, 1920, 1080)
    expect(Math.min(result.width, result.height)).toBeGreaterThanOrEqual(MIN_ELEMENT_SIZE)
    expect(result.x + result.width).toBeLessThanOrEqual(1920)
    expect(result.y + result.height).toBeLessThanOrEqual(1080)
  })

  it('leaves a layer that does not maintain its ratio to the plain clamp', () => {
    const result = resizeWithAspect(element({ maintainAspectRatio: false }), 'e', { x: 100, y: 100, width: 4000, height: 2000 }, 1920, 1080)
    expect(result).toEqual(clampElement(element({ maintainAspectRatio: false, width: 4000, height: 2000 }), 1920, 1080))
  })
})
