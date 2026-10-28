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
