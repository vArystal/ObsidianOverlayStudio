import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, createEmptyOverlay } from '../../lib/elements'
import type { OverlayElement } from '../../types'
import { Canvas } from './Canvas'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('PointerEvent', MouseEvent)
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup() {
  const overlay = createEmptyOverlay()
  const element = createElement('shape')
  overlay.elements.push(element)
  const onLiveElement = vi.fn<(element: OverlayElement) => void>()
  const onInteractionStart = vi.fn()
  const onInteractionEnd = vi.fn()
  const view = render(
    <Canvas
      overlay={overlay}
      selectedId={element.id}
      preview={false}
      zoom={1}
      testAlertNonce={0}
      onSelect={vi.fn()}
      onLiveElement={onLiveElement}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
      onScaleChange={vi.fn()}
    />,
  )
  return { ...view, overlay, element, onLiveElement, onInteractionStart, onInteractionEnd }
}

describe('canvas pointer interactions', () => {
  it('translates pointer movement into logical drag coordinates', () => {
    const result = setup()
    const node = result.container.querySelector('.canvas-element') as HTMLElement
    const stage = result.container.querySelector('.canvas-stage') as HTMLElement
    fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 150, clientY: 130 })
    fireEvent.pointerUp(stage, { pointerId: 1 })

    expect(result.onInteractionStart).toHaveBeenCalledOnce()
    expect(result.onLiveElement).toHaveBeenCalled()
    expect(result.onLiveElement.mock.lastCall?.[0]).toMatchObject({ x: result.element.x + 50, y: result.element.y + 30 })
    expect(result.onInteractionEnd).toHaveBeenCalledOnce()
  })

  it('resizes from a visible corner handle in logical coordinates', () => {
    const result = setup()
    const handle = result.container.querySelector('.handle-se') as HTMLElement
    const stage = result.container.querySelector('.canvas-stage') as HTMLElement
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 260, clientY: 240 })
    fireEvent.pointerUp(stage, { pointerId: 2 })

    expect(result.onLiveElement.mock.lastCall?.[0]).toMatchObject({
      width: result.element.width + 60,
      height: result.element.height + 40,
    })
  })
})

describe('preview completeness', () => {
  // Regression: preview used to render like OBS output, so it dropped every layer with
  // includeInOutput=false and every widget whose live data was absent. Configuring a webcam frame or
  // alert with the channel offline looked like the element did not exist.
  it('shows every configured layer, including editor-only and data-gated ones', () => {
    const overlay = createEmptyOverlay()
    const types = ['text', 'image', 'shape', 'frame', 'webcam', 'capture', 'chat', 'alert', 'goal', 'counter', 'countdown', 'viewerCount', 'sessionFollowers', 'latestFollower', 'supporter'] as const
    types.forEach((type) => { const element = createElement(type); element.includeInOutput = false; overlay.elements.push(element) })

    const { container } = render(
      <Canvas
        overlay={overlay}
        selectedId={null}
        preview
        zoom={1}
        testAlertNonce={0}
        onSelect={vi.fn()}
        onLiveElement={vi.fn()}
        onInteractionStart={vi.fn()}
        onInteractionEnd={vi.fn()}
        onScaleChange={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.canvas-element')).toHaveLength(types.length)
    expect(container.querySelectorAll('.canvas-element.selected')).toHaveLength(0)
    expect(container.textContent).toContain('Preview · every layer, editor guides hidden')
  })
})
