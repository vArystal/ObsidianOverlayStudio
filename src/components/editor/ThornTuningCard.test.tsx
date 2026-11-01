import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThornTuningCard } from './ThornTuningCard'
import { buildFrameSpec } from '../../lib/thornGeometry'
import {
  DEFAULT_THORN_TUNING,
  THORN_ROSE_PALETTES,
  normalizeThornTuning,
  thornCssVars,
} from '../../lib/themes'
import { normalizeOverlay } from '../../lib/storage'
import { createEmptyOverlay } from '../../lib/elements'

afterEach(cleanup)

describe('thorn tuning', () => {
  it('falls back to the shipped look for missing or nonsense values', () => {
    expect(normalizeThornTuning(undefined)).toEqual(DEFAULT_THORN_TUNING)
    // A hand-edited snapshot is untrusted input, not a crash.
    expect(normalizeThornTuning({ rose: 'neon' as never, foliage: 'huge' as never, motion: 'fast' as never })).toEqual(DEFAULT_THORN_TUNING)
    expect(normalizeThornTuning({ rose: 'blush' })).toEqual({ ...DEFAULT_THORN_TUNING, rose: 'blush' })
  })

  it('exposes the palette and motion as CSS variables the frames read', () => {
    const vars = thornCssVars({ rose: 'wine', foliage: 'full', motion: 'lively' })
    expect(vars['--thorn-rose-mid']).toBe(THORN_ROSE_PALETTES.wine.mid)
    expect(vars['--thorn-rose-lit']).toBe(THORN_ROSE_PALETTES.wine.lit)
    // Smaller multiplier means shorter durations, i.e. faster sway.
    expect(Number(vars['--thorn-motion'])).toBeLessThan(1)
    expect(Number(thornCssVars({ ...DEFAULT_THORN_TUNING, motion: 'still' })['--thorn-motion'])).toBeGreaterThan(100)
  })

  it('changes how much foliage grows without changing the canes', () => {
    const base = { id: 'ov:cam', width: 900, height: 500, variant: 'camera' as const, radius: 18 }
    const light = buildFrameSpec({ ...base, density: 0.6 })
    const lush = buildFrameSpec({ ...base, density: 1.45 })
    expect(lush.leaves.length).toBeGreaterThan(light.leaves.length)
    expect(lush.thorns.length).toBeGreaterThan(light.thorns.length)
    // The frame structure is stable, otherwise a tuning change would rearrange the whole widget.
    expect(lush.canes.length).toBe(light.canes.length)
    expect(lush.roses.length).toBe(light.roses.length)
  })

  it('normalises a stored overlay that predates the feature', () => {
    const overlay = createEmptyOverlay()
    const legacy = { ...overlay } as Record<string, unknown>
    delete legacy.thorn
    expect(normalizeOverlay(legacy as never).thorn).toEqual(DEFAULT_THORN_TUNING)
  })
})

describe('tuning card', () => {
  it('reports each choice as a radio group and emits the whole tuning', () => {
    const onChange = vi.fn()
    render(<ThornTuningCard value={DEFAULT_THORN_TUNING} onChange={onChange} />)
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Crimson' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: 'Blush' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_THORN_TUNING, rose: 'blush' })
    fireEvent.click(screen.getByRole('radio', { name: 'lush' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_THORN_TUNING, foliage: 'lush' })
  })
})
