import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createEmptyOverlay } from '../lib/elements'
import { saveOverlay } from '../lib/storage'
import { OverlayList } from './OverlayList'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

describe('overlay library accessibility', () => {
  // The card's edit button holds only decorative marks (a miniature stage of coloured spans), which axe
  // flags as a critical unlabelled button; the name has to come from the overlay it opens.
  it('gives each card thumbnail an accessible name naming the overlay it edits', () => {
    const overlay = createEmptyOverlay('Royal starting soon')
    saveOverlay(overlay)
    render(<MemoryRouter><OverlayList /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Edit Royal starting soon' })).toBeTruthy()
  })
})

describe('card thumbnails', () => {
  it('paints the saved animated scene behind the element marks, frozen', () => {
    const overlay = createEmptyOverlay('Scene card')
    overlay.background = { ...overlay.background, enabled: true, kind: 'neon-grid' }
    saveOverlay(overlay)
    const { container } = render(<MemoryRouter><OverlayList /></MemoryRouter>)
    const layer = container.querySelector('.thumbnail-stage .overlay-background') as HTMLElement | null
    expect(layer).toBeTruthy()
    expect(layer!.className).toContain('bg-neon-grid')
    // Frozen: the dashboard must not run dozens of scenes at once.
    expect(layer!.className).toContain('is-still')
  })
})
