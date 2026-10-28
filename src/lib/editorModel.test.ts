import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clampElement, snapPosition } from './geometry'
import { cloneOverlay, createElement, createEmptyOverlay, duplicateElement } from './elements'
import { decodeOverlaySnapshot, deleteOverlay, encodeOverlaySnapshot, getOverlay, loadOverlays, saveOverlay } from './storage'

beforeEach(() => localStorage.clear())

describe('overlay model', () => {
  it('creates an empty overlay and optional elements only on demand', () => {
    const overlay = createEmptyOverlay('Scene A')
    expect(overlay.elements).toHaveLength(0)
    expect(overlay.width).toBe(1920)
    expect(overlay.height).toBe(1080)

    const text = createElement('text')
    const webcam = createElement('webcam')
    const capture = createElement('capture')
    expect(text.props.text).toBe('Your stream, your story.')
    expect(webcam.includeInOutput).toBe(false)
    expect(capture.includeInOutput).toBe(false)
  })

  it('duplicates layers without sharing IDs and preserves configured properties', () => {
    const image = createElement('image')
    image.props.src = 'data:image/png;base64,abc'
    image.width = 640
    image.height = 360
    const copy = duplicateElement(image, 1)
    expect(copy.id).not.toBe(image.id)
    expect(copy.props.src).toBe(image.props.src)
    expect(copy.width / copy.height).toBe(image.width / image.height)
    copy.props.alt = 'changed'
    expect(image.props.alt).not.toBe('changed')
  })

  it('duplicates an overlay as an independent named composition', () => {
    const first = createEmptyOverlay('Main')
    first.elements.push(createElement('text'))
    const second = cloneOverlay(first)
    expect(second.id).not.toBe(first.id)
    expect(second.publicId).not.toBe(first.publicId)
    expect(second.elements[0].id).not.toBe(first.elements[0].id)
    expect(second.name).toBe('Main copy')
    expect(first.name).toBe('Main')
  })
})

describe('logical geometry', () => {
  it('clamps movement and sizing in logical canvas coordinates', () => {
    const item = { ...createElement('text'), x: -20, y: 900, width: 500, height: 300 }
    const clamped = clampElement(item, 1280, 720)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(420)
    expect(clamped.width).toBe(500)
    expect(clamped.height).toBe(300)
  })

  it('snaps to horizontal and vertical center without involving visual zoom', () => {
    const item = { ...createElement('shape'), x: 758, y: 442, width: 400, height: 200 }
    const result = snapPosition(item, 1920, 1080, 5)
    expect(result.element.x).toBe(760)
    expect(result.element.y).toBe(440)
    expect(result.guides).toEqual(expect.arrayContaining([{ axis: 'x', value: 960 }, { axis: 'y', value: 540 }]))
  })
})

describe('local persistence and publishing snapshot', () => {
  it('saves and restores an exact configured layout', () => {
    const overlay = createEmptyOverlay('Restored')
    const text = createElement('text')
    text.x = 321
    text.y = 222
    text.width = 777
    text.rotation = 12
    text.props.text = 'سلام stream'
    overlay.elements.push(text, createElement('chat'))
    const result = saveOverlay(overlay)
    expect(result.ok).toBe(true)
    const restored = getOverlay(overlay.id)
    expect(restored?.elements).toHaveLength(2)
    expect(restored?.elements[0]).toMatchObject({ x: 321, y: 222, width: 777, rotation: 12 })
    expect(restored?.elements[0].props.text).toBe('سلام stream')
  })

  it('keeps a second overlay isolated and supports deletion', () => {
    const first = createEmptyOverlay('First')
    const second = createEmptyOverlay('Second')
    first.elements.push(createElement('alert'))
    saveOverlay(first)
    saveOverlay(second)
    expect(loadOverlays()).toHaveLength(2)
    expect(getOverlay(second.id)?.elements).toHaveLength(0)
    expect(deleteOverlay(first.id).ok).toBe(true)
    expect(loadOverlays()).toHaveLength(1)
    expect(getOverlay(second.id)?.name).toBe('Second')
  })

  it('returns an explicit error instead of silently losing a failed save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    const result = saveOverlay(createEmptyOverlay('Too large'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Quota exceeded')
    spy.mockRestore()
  })

  it('round-trips the standalone URL snapshot including embedded assets', () => {
    const overlay = createEmptyOverlay('Published')
    const image = createElement('image')
    image.props.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    image.x = 401
    overlay.elements.push(image)
    const encoded = encodeOverlaySnapshot(overlay)
    const decoded = decodeOverlaySnapshot(encoded)
    expect(decoded?.name).toBe('Published')
    expect(decoded?.elements[0].props.src).toBe(image.props.src)
    expect(decoded?.elements[0].x).toBe(401)
  })
})
