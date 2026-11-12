import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createEmptyOverlay } from '../lib/elements'
import { getOverlay, saveOverlay } from '../lib/storage'
import { OverlayEditor } from './OverlayEditor'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderEditor(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/overlays/editor/${id}`]}>
      <Routes><Route path="/overlays/editor/:id" element={<OverlayEditor />} /></Routes>
    </MemoryRouter>,
  )
}

/**
 * CP24: the palette is generated from the widget registry, so blurbs are copy that may change. The helper targets
 * the stable `data-widget-type` contract instead of a sentence, so a rewording cannot silently break the journey.
 */
function clickLibraryWidget(type: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-widget-type="${type}"]`)
  if (!button) throw new Error(`No library button for ${type}`)
  fireEvent.click(button)
}

describe('overlay editor workflow', () => {
  it('adds optional layers, edits geometry, uses history and restores a saved composition', () => {
    const empty = createEmptyOverlay('Acceptance scene')
    saveOverlay(empty)
    const view = renderEditor(empty.id)

    expect(screen.getByText('Your canvas is empty')).toBeTruthy()
    clickLibraryWidget('text')
    expect(screen.queryByText('Your canvas is empty')).toBeNull()

    const textArea = screen.getByLabelText('Text') as HTMLTextAreaElement
    fireEvent.change(textArea, { target: { value: 'سلام from the editor' } })
    const xInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement
    fireEvent.change(xInput, { target: { value: '420' } })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(screen.getByRole('tab', { name: /Layers 2/ })).toBeTruthy()
    fireEvent.click(screen.getByTitle('Undo (Ctrl/⌘ Z)'))
    expect(screen.getByRole('tab', { name: /Layers 1/ })).toBeTruthy()
    fireEvent.click(screen.getByTitle('Redo (Ctrl/⌘ Shift Z)'))
    expect(screen.getByRole('tab', { name: /Layers 2/ })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.getByRole('tab', { name: /Layers 1/ })).toBeTruthy()
    fireEvent.click(screen.getByTitle('Undo (Ctrl/⌘ Z)'))
    expect(screen.getByRole('tab', { name: /Layers 2/ })).toBeTruthy()

    clickLibraryWidget('webcam')
    clickLibraryWidget('capture')
    clickLibraryWidget('chat')
    clickLibraryWidget('alert')
    expect(screen.getByText('Kick connection required')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Test preview alert/ }))
    expect(screen.getByText(/Preview alert triggered/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Layers 6/ }))
    const selectedLayer = document.querySelector('.layer-row.selected') as HTMLElement
    fireEvent.click(selectedLayer.querySelector('[aria-label="Toggle layer lock"]') as HTMLElement)
    fireEvent.click(selectedLayer.querySelector('[aria-label="Toggle layer visibility"]') as HTMLElement)
    fireEvent.click(selectedLayer.querySelector('[title="Move backward"]') as HTMLElement)

    fireEvent.change(screen.getByLabelText('Canvas resolution'), { target: { value: '1280x720' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const saved = getOverlay(empty.id)
    expect(saved?.width).toBe(1280)
    expect(saved?.height).toBe(720)
    expect(saved?.elements).toHaveLength(6)
    expect(saved?.elements[0].props.text).toBe('سلام from the editor')
    expect(saved?.elements[0].x).toBe(421)
    expect(saved?.elements.some((element) => element.type === 'webcam' && !element.includeInOutput)).toBe(true)
    expect(saved?.elements.some((element) => element.type === 'capture' && !element.includeInOutput)).toBe(true)
    expect(saved?.elements.find((element) => element.type === 'alert')).toMatchObject({ locked: true, visible: false })
    expect(saved?.elements[(saved?.elements.length ?? 1) - 1]?.type).not.toBe('alert')

    view.unmount()
    renderEditor(empty.id)
    expect(screen.getAllByText('سلام from the editor')).toHaveLength(2)
    expect(screen.getByDisplayValue('Acceptance scene')).toBeTruthy()
  })

  it('validates an uploaded image and preserves its decoded aspect ratio', async () => {
    class ImageStub {
      naturalWidth = 800
      naturalHeight = 400
      onload: (() => void) | null = null
      set src(_value: string) { window.setTimeout(() => this.onload?.(), 0) }
    }
    vi.stubGlobal('Image', ImageStub)
    const empty = createEmptyOverlay('Image scene')
    saveOverlay(empty)
    renderEditor(empty.id)
    clickLibraryWidget('image')

    const input = document.querySelector('.right-panel input[type="file"][accept^="image/png"]') as HTMLInputElement
    const file = new File(['small-png'], 'mark.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('image · 360 × 180')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const image = getOverlay(empty.id)?.elements[0]
    expect(image?.maintainAspectRatio).toBe(true)
    expect((image?.width ?? 0) / (image?.height ?? 1)).toBe(2)
    expect(String(image?.props.src)).toMatch(/^data:image\/png;base64,/)
  })
})

describe('publish failure reporting', () => {
  // CP37: alert-settings registration used `.catch(() => null)`, so a rejected registration looked like success and
  // milestones silently never fired.
  it('keeps a standing notice when alert settings are rejected', async () => {
    const overlay = createEmptyOverlay('Live notice')
    overlay.live = { backendUrl: 'https://api.example', runtimeKey: 'rt_before', connectionId: 'con_1', channelName: 'arystal' }
    saveOverlay(overlay)
    const fetchStub = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/overlays/publish')) return { ok: true, status: 200, json: async () => ({ publicationId: 'pub_1', runtimeKey: 'rt_new' }) } as unknown as Response
      if (String(url).includes('/alert-settings')) return { ok: false, status: 500, json: async () => ({ error: 'd1 write failed' }) } as unknown as Response
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchStub)
    renderEditor(overlay.id)
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Alert durability is not active'))
    expect(screen.getByRole('alert').textContent).toContain('d1 write failed')
    // Still published: a rejected settings row must not block the overlay itself.
    await waitFor(() => expect(getOverlay(overlay.id)?.publishedAt).toBeTruthy())
  })
})
