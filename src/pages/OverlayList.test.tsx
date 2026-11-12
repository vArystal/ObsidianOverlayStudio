import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createEmptyOverlay } from '../lib/elements'
import { getOverlay, saveOverlay } from '../lib/storage'
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

describe('publication lifecycle', () => {
  // CP37: deletePublication was exported and wired to nothing, so a revoked overlay kept answering in OBS.
  it('unpublishes through a confirm dialog, revokes the key and clears the badge', async () => {
    const overlay = createEmptyOverlay('Live card')
    overlay.publishedAt = new Date().toISOString()
    overlay.live = { backendUrl: 'https://api.example', runtimeKey: 'rt_live', connectionId: 'con_1', channelName: 'arystal' }
    saveOverlay(overlay)
    sessionStorage.setItem('obsidian-integration-session-v1', JSON.stringify({ managementToken: 't', connectionId: 'con_1', runtimeKey: 'rt_live', channelName: 'arystal' }))
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return { ok: true, status: 200, json: async () => ({ removed: 1, overlayId: overlay.publicId }) } as unknown as Response
    }))

    render(<MemoryRouter><OverlayList /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Overlay menu' }))
    fireEvent.click(screen.getByRole('button', { name: /Unpublish/ }))
    expect(screen.getByText('Unpublish this overlay?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))

    await waitFor(() => expect(getOverlay(overlay.id)?.publishedAt).toBeNull())
    expect(calls.some((call) => call.startsWith('DELETE') && call.includes(`/api/overlays/${overlay.publicId}/publication`))).toBe(true)
    expect(getOverlay(overlay.id)?.live?.runtimeKey).toBe('')
    vi.unstubAllGlobals()
  })
})
