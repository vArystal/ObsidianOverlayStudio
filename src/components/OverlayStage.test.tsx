import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyOverlay, createElement } from '../lib/elements'
import { getTheme } from '../lib/themes'
import { normalizeBackground } from '../lib/backgrounds'
import { OverlayStage } from './OverlayStage'

const { normalizeSpy } = vi.hoisted(() => ({ normalizeSpy: vi.fn() }))
vi.mock('../lib/alerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/alerts')>()
  return {
    ...actual,
    normalizeAlertSettings: (value: unknown) => {
      normalizeSpy(value)
      return actual.normalizeAlertSettings(value as never)
    },
  }
})

afterEach(() => { cleanup(); normalizeSpy.mockClear() })

const stage = (overlay: ReturnType<typeof createEmptyOverlay>, mode: 'editor' | 'runtime', extra: Record<string, unknown> = {}) => (
  <OverlayStage
    overlay={overlay}
    theme={getTheme(overlay.theme.id)}
    mode={mode}
    scale={1}
    staticElements={false}
    reducedMotion={false}
    motionHost={false}
    {...extra}
  />
)

describe('one stage renderer', () => {
  it('produces identical element markup in the editor and the runtime', () => {
    // CP34: the two surfaces used to build their own wrappers and had drifted.
    const overlay = createEmptyOverlay('Parity')
    const text = createElement('text')
    text.props.text = 'Parity line'
    // Chat and alert content legitimately differ between authoring and air (sample copy versus nothing until a
    // real event), so parity is asserted on the element kinds that carry no per-mode data.
    const second = createElement('text')
    second.props.text = 'Second line'
    overlay.elements.push(text, second, createElement('clock'))

    const editor = render(stage(overlay, 'editor'))
    const runtime = render(stage(overlay, 'runtime'))

    const editorContent = [...editor.container.querySelectorAll('.element-content')].map((node) => node.innerHTML)
    const runtimeContent = [...runtime.container.querySelectorAll('.element-content')].map((node) => node.innerHTML)

    expect(editorContent).toHaveLength(3)
    expect(runtimeContent).toEqual(editorContent)
  })

  it('wraps an alert identically in both modes, differing only in its data', () => {
    const overlay = createEmptyOverlay('Alert parity')
    overlay.elements.push(createElement('alert'))
    const editor = render(stage(overlay, 'editor'))
    const runtime = render(stage(overlay, 'runtime'))
    const shape = (container: HTMLElement) => [...container.querySelectorAll('.element-content > .element-idle > .decorated-widget > .decorated-content')].length
    expect(shape(editor.container)).toBe(1)
    expect(shape(runtime.container)).toBe(1)
    // The editor previews a labelled sample; the published source shows nothing until a real event arrives.
    expect(editor.container.textContent).toContain('PREVIEW')
    expect(runtime.container.querySelector('.alert-stage')).toBeNull()
  })

  it('renders the idle glow and sparkle layers in both modes', () => {
    // Defect 1: the runtime drew these, the editor did not, so two inspector effects were invisible while authoring.
    const overlay = createEmptyOverlay('Idle parity')
    const glow = createElement('text')
    glow.animation.idle = 'glow'
    const sparkle = createElement('text')
    sparkle.animation.idle = 'sparkle'
    overlay.elements.push(glow, sparkle)

    for (const mode of ['editor', 'runtime'] as const) {
      const view = render(stage(overlay, mode))
      expect(view.container.querySelectorAll('.idle-layer.idle-glow')).toHaveLength(1)
      expect(view.container.querySelectorAll('.idle-layer.idle-sparkle')).toHaveLength(1)
      view.unmount()
    }
  })

  it('normalises alert settings once per stage, not once per element', () => {
    // Defect 2: the provider lived inside the element map.
    const overlay = createEmptyOverlay('Two alerts')
    overlay.elements.push(createElement('alert'), createElement('alert'))

    render(stage(overlay, 'editor'))

    // Identity matters: only the stage normalises the overlay document itself.
    const overDocumentCalls = normalizeSpy.mock.calls.filter(([value]) => value === overlay.alerts)
    expect(overDocumentCalls).toHaveLength(1)
  })

  it('pauses the animated background when staticMotion is on, in both modes', () => {
    // Defect 3: the runtime ignored staticMotion for the backdrop, so a "static" source still moved.
    const overlay = { ...createEmptyOverlay('Static backdrop'), staticMotion: true }
    overlay.background = { ...normalizeBackground(undefined), enabled: true, kind: 'aurora-flow' }
    for (const mode of ['editor', 'runtime'] as const) {
      const view = render(stage(overlay, mode, { staticElements: true, reducedMotion: true }))
      const layer = view.container.querySelector('.overlay-background')
      expect(layer?.className).toContain('is-still')
      view.unmount()
    }
  })

  it('keeps a layer out of the runtime when it is excluded from output, but shows it in the editor', () => {
    const overlay = createEmptyOverlay('Filtering')
    const onAir = createElement('text')
    const guide = createElement('capture')
    guide.includeInOutput = false
    overlay.elements.push(onAir, guide)

    expect(render(stage(overlay, 'editor')).container.querySelectorAll('.stage-element')).toHaveLength(2)
    cleanup()
    expect(render(stage(overlay, 'runtime')).container.querySelectorAll('.stage-element')).toHaveLength(1)
  })
})
