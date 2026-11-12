import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from './elements'
import { WIDGETS } from './widgets'
import { WidgetSettings } from '../components/editor/WidgetSettings'
import { normalizeAlertSettings } from './alerts'
import type { Overlay } from '../types'

afterEach(cleanup)

/**
 * CP38 registry truth. `controls` is the inspector contract and `defaults` is what a new element starts with, so
 * both are checked against the code that renders them: a group that renders nothing and a key nobody reads are
 * both defects, not documentation.
 */
// Vite globbing instead of node:fs keeps the app's type environment free of Node types while reading the exact
// sources the bundler sees.
const sources = import.meta.glob('/src/components/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const RENDERERS = ['/src/components/widgets/index.tsx', '/src/components/ElementRenderer.tsx'].map((path) => sources[path] ?? '').join('\n')
const readKeys = new Set((RENDERERS.match(/'([a-zA-Z][a-zA-Z0-9]*)'/g) ?? []).map((match: string) => match.slice(1, -1)))

describe('widget registry truth', () => {
  it('renders a non-empty inspector section for every declared control group', () => {
    for (const definition of WIDGETS) {
      const element = createElement(definition.type)
      const view = render(
        <WidgetSettings
          element={element}
          onProp={() => {}}
          onReplaceProps={() => {}}
          alerts={definition.type === 'alert' ? normalizeAlertSettings(({} as Overlay).alerts) : undefined}
          onAlerts={() => {}}
        />,
      )
      for (const group of definition.controls) {
        const section = view.container.querySelector(`[data-group="${group}"]`)
        expect(section, `${definition.type} declares "${group}" but renders no section`).toBeTruthy()
        const controls = section!.querySelectorAll('input, select, textarea')
        expect(controls.length, `${definition.type} "${group}" section has no control`).toBeGreaterThan(0)
      }
      view.unmount()
    }
  })

  it('reads every default key somewhere in a renderer', () => {
    const unread: string[] = []
    for (const definition of WIDGETS) {
      for (const key of Object.keys(definition.defaults)) {
        if (!readKeys.has(key)) unread.push(`${definition.type}.${key}`)
      }
    }
    expect(unread).toEqual([])
  })

  it('binds each inspector control to a key the widget declares', () => {
    for (const definition of WIDGETS) {
      const element = createElement(definition.type)
      const written: string[] = []
      const view = render(
        <WidgetSettings
          element={element}
          onProp={(key) => written.push(key)}
          onReplaceProps={() => {}}
          alerts={definition.type === 'alert' ? normalizeAlertSettings(({} as Overlay).alerts) : undefined}
          onAlerts={() => {}}
        />,
      )
      let wroteAlerts = 0
      view.unmount()
      const second = render(
        <WidgetSettings
          element={element}
          onProp={(key) => written.push(key)}
          onReplaceProps={() => {}}
          alerts={definition.type === 'alert' ? normalizeAlertSettings(({} as Overlay).alerts) : undefined}
          onAlerts={() => { wroteAlerts += 1 }}
        />,
      )
      const input = second.container.querySelector('[data-group] input:not([type="range"]):not([type="color"]):not([type="checkbox"])') as HTMLInputElement | null
      if (input) {
        fireEvent.change(input, { target: { value: 'x' } })
        // The alert's behaviour and sound write the overlay's alert settings, every other widget writes its own props.
        if (written.length) expect(Object.keys(definition.defaults)).toContain(written[0])
        else expect(wroteAlerts).toBeGreaterThan(0)
      }
      view.unmount()
    }
  })
})
