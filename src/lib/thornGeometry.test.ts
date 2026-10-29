import { describe, expect, it } from 'vitest'
import { buildFrameSpec, THORN_ROSE_STOPS, variantForType } from '../lib/thornGeometry'

/**
 * The frame is generated, so the risks are structural: a different overlay must look different, the same
 * overlay must never shift between reloads, nothing may land outside the panel, and chat must stay the
 * lightest frame so its text survives.
 */
describe('thorn frame geometry', () => {
  const base = { width: 900, height: 380, radius: 18 }

  it('is deterministic for the same element and different between elements', () => {
    const a = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const b = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const other = buildFrameSpec({ ...base, id: 'el_other', variant: 'camera' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(other))
  })

  it('grows inside the panel and never produces invalid coordinates', () => {
    const spec = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const parts = [...spec.thorns, ...spec.leaves, ...spec.roses]
    expect(parts.length).toBeGreaterThan(20)
    for (const part of parts) {
      expect(Number.isFinite(part.x) && Number.isFinite(part.y)).toBe(true)
      // A thorn tip or petal edge may poke out by its own size; the anchor stays on the panel.
      expect(part.x).toBeGreaterThanOrEqual(-2)
      expect(part.y).toBeGreaterThanOrEqual(-2)
      expect(part.x).toBeLessThanOrEqual(base.width + 2)
      expect(part.y).toBeLessThanOrEqual(base.height + 2)
    }
  })

  it('puts a hero bloom and buds on a camera frame and keeps chat sparser', () => {
    const camera = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const chat = buildFrameSpec({ ...base, id: 'el_chat', variant: 'chat' })
    expect(camera.roses.filter((rose) => rose.kind === 'hero')).toHaveLength(1)
    expect(camera.roses.length).toBeGreaterThanOrEqual(4)
    expect(camera.leaves.length).toBeGreaterThan(chat.leaves.length)
    expect(camera.thorns.length).toBeGreaterThan(chat.thorns.length)
  })

  it('gives the counter two flanking blooms and the alert a bloom plus a medallion frame', () => {
    const plaque = buildFrameSpec({ width: 300, height: 120, radius: 14, id: 'el_counter', variant: 'plaque' })
    const alert = buildFrameSpec({ width: 620, height: 160, radius: 16, id: 'el_alert', variant: 'alert' })
    expect(plaque.roses).toHaveLength(2)
    expect(Math.abs(plaque.roses[0].y - plaque.roses[1].y)).toBeLessThan(2)
    expect(alert.roses.some((rose) => rose.kind === 'hero')).toBe(true)
  })

  it('thorns come in varied lengths and angles rather than a stamped shape', () => {
    const spec = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const lengths = new Set(spec.thorns.map((thorn) => Math.round(thorn.length)))
    const angles = new Set(spec.thorns.map((thorn) => Math.round(thorn.angle / 15)))
    expect(lengths.size).toBeGreaterThan(4)
    expect(angles.size).toBeGreaterThan(8)
  })

  it('honours the density knob', () => {
    const normal = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera' })
    const sparse = buildFrameSpec({ ...base, id: 'el_camera', variant: 'camera', density: 0.4 })
    expect(sparse.leaves.length).toBeLessThan(normal.leaves.length)
  })

  it('routes each widget type to the frame it was designed for', () => {
    expect(variantForType('webcam')).toBe('camera')
    expect(variantForType('capture')).toBe('camera')
    expect(variantForType('chat')).toBe('chat')
    expect(variantForType('alert')).toBe('alert')
    expect(variantForType('counter')).toBe('plaque')
    expect(variantForType('viewerCount')).toBe('plaque')
    expect(variantForType('shape')).toBe('panel')
  })

  it('keeps the palette anchored to the brief', () => {
    expect(THORN_ROSE_STOPS).toEqual(['#3d0610', '#8e1226', '#b3162f', '#d9304a'])
  })
})
