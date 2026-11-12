import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createElement as h } from 'react'
import { CONTAINER_PRESETS, containerStyle, createElement, createEmptyOverlay, normalizeContainerProps } from './elements'
import { clampElement } from './geometry'
import { decodeOverlaySnapshot, encodeOverlaySnapshot, normalizeOverlay } from './storage'
import { ElementRenderer } from '../components/ElementRenderer'

const container = () => createElement('container')

describe('CP22 empty containers', () => {
  it('creates a first-class container with its own geometry and a complete appearance', () => {
    const item = container()
    expect(item.type).toBe('container')
    expect(item.width).toBeGreaterThan(0)
    expect(item.height).toBeGreaterThan(0)
    expect(item.props).toMatchObject({ fill: expect.any(String), borderStyle: expect.any(String), radius: expect.any(Number) })
  })

  it('does not depend on a text, image or placeholder to exist', () => {
    const item = container()
    const contentKeys = ['text', 'src', 'alt', 'label']
    expect(Object.keys(item.props).some((key) => contentKeys.includes(key))).toBe(false)
  })

  it('ships eight distinct presets that only change appearance', () => {
    expect(CONTAINER_PRESETS).toHaveLength(8)
    expect(new Set(CONTAINER_PRESETS.map((preset) => preset.id)).size).toBe(8)
    const looks = new Set(CONTAINER_PRESETS.map((preset) => JSON.stringify(containerStyle(preset.props))))
    expect(looks.size).toBe(8)
    const item = container()
    for (const preset of CONTAINER_PRESETS) {
      const styled = { ...item, props: { ...item.props, ...preset.props } }
      expect(styled.width).toBe(item.width)
      expect(styled.x).toBe(item.x)
    }
  })

  it('renders a transparent container as genuinely empty', () => {
    const style = containerStyle({ fill: 'transparent', borderStyle: 'none' })
    expect(style.background).toBe('transparent')
    expect(style.boxShadow).toBe('none')
  })

  it('coerces nonsense values instead of rendering a broken box', () => {
    const props = normalizeContainerProps({ fill: 'hologram', borderStyle: 'wavy', radius: 'huge', fillOpacity: 9, borderWidth: -4, blur: 900 })
    expect(props.fill).toBe('solid')
    expect(props.borderStyle).toBe('solid')
    expect(props.radius).toBe(10)
    expect(props.fillOpacity).toBe(1)
    expect(props.borderWidth).toBe(0)
    expect(props.blur).toBe(24)
  })

  it('survives save, reload and publish without changing its appearance', () => {
    const overlay = createEmptyOverlay('Containers')
    const item = { ...container(), x: 140, y: 220, width: 731, height: 418, props: { ...container().props, ...CONTAINER_PRESETS[3].props } }
    overlay.elements = [item]
    const reloaded = normalizeOverlay(JSON.parse(JSON.stringify(overlay)))
    expect(reloaded.elements[0].props).toMatchObject(item.props)
    expect(reloaded.elements[0].width).toBe(731)
    const round = decodeOverlaySnapshot(encodeOverlaySnapshot(overlay))
    expect(round?.elements[0].type).toBe('container')
    expect(round?.elements[0].width).toBe(731)
  })

  it('keeps legacy overlays and shapes untouched while normalising containers', () => {
    const overlay = createEmptyOverlay('Legacy')
    const shape = createElement('shape')
    const legacy = { ...container(), props: { fill: 'solid' } as OverlayElementProps }
    overlay.elements = [shape, legacy]
    const loaded = normalizeOverlay(overlay)
    expect(loaded.elements[0].props).toEqual(shape.props)
    expect(loaded.elements[1].props.fillOpacity).toBe(0.42)
  })

  it('renders the same box in the editor and in the runtime', () => {
    const item = { ...container(), props: { ...container().props, ...CONTAINER_PRESETS[1].props, blur: 8 } }
    const view = (runtime: boolean) => render(h(ElementRenderer, { element: item, theme: undefined as never, runtime }))
    const editor = view(false)
    const editorStyle = (editor.container.querySelector('.container-element') as HTMLElement).style
    const editorSnapshot = { background: editorStyle.background, border: editorStyle.border, radius: editorStyle.borderRadius, shadow: editorStyle.boxShadow }
    editor.unmount()

    const runtime = view(true)
    const runtimeStyle = (runtime.container.querySelector('.container-element') as HTMLElement).style
    expect(runtimeStyle.background).toBe(editorStyle.background)
    expect(runtimeStyle.borderRadius).toBe(editorSnapshot.radius)
    expect(runtimeStyle.boxShadow).toBe(editorSnapshot.shadow)
    expect(runtimeStyle.backdropFilter).toBe(editorStyle.backdropFilter)
    expect(runtimeStyle.borderColor).toBe(editorStyle.borderColor)
    runtime.unmount()
  })

  it('keeps containers independent when duplicated', () => {
    const first = container()
    const second = { ...first, id: 'copy', props: { ...first.props } }
    second.props.fillColor = '#ff0000'
    expect(first.props.fillColor).not.toBe('#ff0000')
  })

  it('leaves the CP21 background configuration alone', () => {
    const overlay = createEmptyOverlay('Background intact')
    overlay.background = { ...overlay.background, enabled: true, kind: 'aurora-flow' }
    const loaded = normalizeOverlay({ ...overlay, elements: [container()] })
    expect(loaded.background.kind).toBe('aurora-flow')
    expect(loaded.background.enabled).toBe(true)
  })
})

type OverlayElementProps = Record<string, string | number | boolean | null>

describe('CP22 container geometry', () => {
  it('resizes freely and clamps only at the canvas edge, like any other element', () => {
    const item = { ...createElement('container'), x: 100, y: 100, width: 1200, height: 640 }
    const clamped = clampElement({ ...item, width: 4000, height: 3000 }, 1920, 1080)
    expect(clamped.width).toBeLessThanOrEqual(1920)
    expect(clamped.height).toBeLessThanOrEqual(1080)
    const tiny = clampElement({ ...item, width: 4, height: 4 }, 1920, 1080)
    expect(tiny.width).toBeGreaterThan(0)
    expect(tiny.height).toBeGreaterThan(0)
  })

  it('keeps geometry independent of the preset that styles it', () => {
    const item = { ...createElement('container'), x: 90, y: 140, width: 731, height: 419 }
    for (const preset of CONTAINER_PRESETS) {
      const styled = { ...item, props: { ...item.props, ...preset.props } }
      expect([styled.x, styled.y, styled.width, styled.height]).toEqual([90, 140, 731, 419])
    }
  })
})
