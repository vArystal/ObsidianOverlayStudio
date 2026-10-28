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

function clickLibraryDescription(description: string) {
  const button = screen.getByText(description).closest('button')
  if (!button) throw new Error(`No library button for ${description}`)
  fireEvent.click(button)
}

describe('overlay editor workflow', () => {
  it('adds optional layers, edits geometry, uses history and restores a saved composition', () => {
    const empty = createEmptyOverlay('Acceptance scene')
    saveOverlay(empty)
    const view = renderEditor(empty.id)

    expect(screen.getByText('Your canvas is empty')).toBeTruthy()
    clickLibraryDescription('Custom RTL or LTR copy')
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

    clickLibraryDescription('Frame or planning guide')
    clickLibraryDescription('Layout guide — not a capture')
    clickLibraryDescription('Preview-ready integration slot')
    clickLibraryDescription('Testable event surface')
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
    clickLibraryDescription('PNG, JPEG or WebP')

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
