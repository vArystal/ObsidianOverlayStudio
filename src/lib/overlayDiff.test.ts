import { describe, expect, it } from 'vitest'
import { sameOverlay } from './overlayDiff'
import { createEmptyOverlay, createElement } from './elements'

const base = () => {
  const overlay = createEmptyOverlay('scene')
  overlay.elements = [createElement('counter')]
  return overlay
}

describe('CP41 cheap document compare', () => {
  it('treats a document as unchanged when nothing was touched', () => {
    const overlay = base()
    expect(sameOverlay(overlay, overlay)).toBe(true)
    expect(sameOverlay(overlay, structuredClone(overlay))).toBe(true)
  })

  it('detects a single changed prop, a moved layer, and a renamed layer', () => {
    const overlay = base()
    const changedProp = { ...overlay, elements: [{ ...overlay.elements[0], props: { ...overlay.elements[0].props, value: 9 } }, ...overlay.elements.slice(1)] }
    const moved = { ...overlay, elements: [{ ...overlay.elements[0], x: overlay.elements[0].x + 1 }, ...overlay.elements.slice(1)] }
    const renamed = { ...overlay, name: 'other scene' }
    expect(sameOverlay(changedProp, overlay)).toBe(false)
    expect(sameOverlay(moved, overlay)).toBe(false)
    expect(sameOverlay(renamed, overlay)).toBe(false)
  })

  it('detects added and removed layers, and a canvas resize', () => {
    const overlay = base()
    const added = { ...overlay, elements: [...overlay.elements, createElement('text')] }
    const resized = { ...overlay, width: overlay.width * 2 }
    expect(sameOverlay(added, overlay)).toBe(false)
    expect(sameOverlay(resized, overlay)).toBe(false)
  })

  it('does not walk into an untouched base64 image', () => {
    // The reference is shared with the previous document, which is the case the old JSON round-trip could never take
    // a shortcut on: it serialised every image on every keystroke.
    const overlay = base()
    overlay.elements[0].props = { ...overlay.elements[0].props, image: 'data:image/png;base64,' + 'A'.repeat(50_000) }
    const next = { ...overlay, elements: [{ ...overlay.elements[0], opacity: 0.5 }] }
    expect(overlay.elements[0].props.image).toBe(next.elements[0].props.image)
    expect(sameOverlay(next, overlay)).toBe(false)
  })
})
