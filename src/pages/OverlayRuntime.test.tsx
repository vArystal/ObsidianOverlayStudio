import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createElement, createEmptyOverlay } from '../lib/elements'
import { encodeOverlaySnapshot } from '../lib/storage'
import { OverlayRuntime } from './OverlayRuntime'

afterEach(() => {
  cleanup()
  document.documentElement.className = ''
  document.body.className = ''
})

describe('published overlay runtime', () => {
  it('opens directly from a snapshot and renders only visible output layers without editor controls', () => {
    const overlay = createEmptyOverlay('OBS output')
    const included = createElement('text')
    included.props.text = 'Visible title'
    const hidden = createElement('text')
    hidden.props.text = 'Hidden title'
    hidden.visible = false
    const planning = createElement('capture')
    overlay.elements.push(included, hidden, planning)
    const snapshot = encodeOverlaySnapshot(overlay)

    const { container } = render(
      <MemoryRouter initialEntries={[`/overlay/${overlay.publicId}?snapshot=${snapshot}`]}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Visible title')).toBeTruthy()
    expect(screen.queryByText('Hidden title')).toBeNull()
    expect(screen.queryByText(/GAME \/ DISPLAY CAPTURE/)).toBeNull()
    expect(container.querySelector('.runtime-stage')).toBeTruthy()
    expect(container.querySelector('.editor-toolbar')).toBeNull()
    expect(container.querySelector('.editor-panel')).toBeNull()
  })

  it('shows a small error only when local data and snapshot are unavailable', () => {
    render(
      <MemoryRouter initialEntries={['/overlay/not-here']}>
        <Routes><Route path="/overlay/:publicId" element={<OverlayRuntime />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Overlay unavailable')).toBeTruthy()
  })
})
