const DEDICATED_INSPECTOR = ['text', 'image', 'shape', 'container', 'frame', 'capture', 'webcam']

import { describe, expect, it } from 'vitest'
import { ELEMENT_LABELS, createElement, duplicateElement } from './elements'
import { WIDGETS, WIDGET_GROUPS, availabilityLabel, createWidgetProps, resetWidgetProps, scaleWidgetText, searchWidgets, widgetFor } from './widgets'
import type { ElementType } from '../types'

describe('widget registry', () => {
  it('registers every element type exactly once and never leaves a type undiscoverable', () => {
    const types = Object.keys(ELEMENT_LABELS) as ElementType[]
    const registered = WIDGETS.map((widget) => widget.type)
    expect(new Set(registered).size).toBe(registered.length)
    for (const type of types) expect(widgetFor(type), `${type} is missing from the registry`).toBeTruthy()
    expect(registered).toHaveLength(types.length)
  })

  it('gives each widget a usable label, blurb, group and positive default size', () => {
    for (const widget of WIDGETS) {
      expect(widget.label.length).toBeGreaterThan(0)
      expect(widget.blurb.length).toBeGreaterThan(0)
      expect(WIDGET_GROUPS).toContain(widget.group)
      expect(widget.width).toBeGreaterThan(0)
      expect(widget.height).toBeGreaterThan(0)
      // CP38: `controls` now describes what WidgetSettings renders. Canvas primitives (text, image, shape,
      // container, frame, capture, webcam) are edited by their own studio sections, so they declare no group here
      // rather than advertising groups that would render empty.
      if (DEDICATED_INSPECTOR.includes(widget.type)) expect(widget.controls).toEqual([])
      else expect(widget.controls.length).toBeGreaterThan(0)
    }
  })

  it('states availability honestly instead of promising unsupported integrations', () => {
    expect(availabilityLabel(widgetFor('supporter')!)).toBe('Not available')
    expect(widgetFor('supporter')!.note).toMatch(/no donation provider/i)
    expect(availabilityLabel(widgetFor('recentFollowers')!)).toBe('Needs Kick')
    expect(availabilityLabel(widgetFor('clock')!)).toBe('Offline-ready')
    // Kick has no follower total: no widget may claim one.
    expect(WIDGETS.some((widget) => /follower total/i.test(widget.label))).toBe(false)
  })

  it('searches by label, group, blurb and type without hiding the full list on an empty query', () => {
    expect(searchWidgets('').length).toBe(WIDGETS.length)
    expect(searchWidgets('  ').length).toBe(WIDGETS.length)
    const followers = searchWidgets('follower').map((widget) => widget.type)
    expect(followers).toContain('recentFollowers')
    expect(followers).toContain('latestFollower')
    expect(searchWidgets('community').every((widget) => widget.group === 'Community')).toBe(true)
    expect(searchWidgets('streamDuration')).toHaveLength(1)
    expect(searchWidgets('nope-not-a-widget')).toHaveLength(0)
  })

  it('hands every instance its own prop bag so a duplicate never shares mutable configuration', () => {
    const element = createElement('streamTitle')
    const copy = duplicateElement(element, 0)
    element.props.color = '#123456'
    expect(copy.props.color).toBe('#f6f6f4')
    expect(createWidgetProps('streamTitle')).not.toBe(createWidgetProps('streamTitle'))
  })

  it('builds registry widgets from the registry’s own geometry and defaults', () => {
    for (const widget of WIDGETS.filter((entry) => Object.keys(entry.defaults).length > 0)) {
      const element = createElement(widget.type)
      expect(element.width).toBe(widget.width)
      expect(element.height).toBe(widget.height)
      expect(element.props).toEqual(widget.defaults)
      expect(element.name).toBe(widget.label)
      expect(element.id.startsWith(widget.type)).toBe(true)
    }
  })

  it('scales a widget’s type with its box and keeps the factor anchored to the gesture start', () => {
    const clock = createElement('clock')
    const doubled = scaleWidgetText(clock, { ...clock, width: clock.width * 2, height: clock.height * 2 })
    expect(doubled.props.fontSize).toBe(44)
    // Widening only is the case that used to look broken: the type still grows, but gently.
    const wider = scaleWidgetText(clock, { ...clock, width: clock.width * 4 })
    expect(Number(wider.props.fontSize)).toBe(44)
    // Frames and text boxes re-flow instead of growing their caption.
    const text = createElement('text')
    const grown = scaleWidgetText(text, { ...text, width: text.width * 3, height: text.height * 3 })
    expect(grown.props).toBe(text.props)
    // A hand-set size can never be driven past what the typography studio can present again.
    const huge = createElement('clock')
    huge.props.fontSize = 300
    expect(scaleWidgetText(huge, { ...huge, width: huge.width * 10, height: huge.height * 10 }).props.fontSize).toBe(400)
  })

  it('resets a widget to its defaults while keeping geometry and identity', () => {
    const element = createElement('recentFollowers')
    element.props.color = '#abcdef'
    element.props.maxItems = 19
    const reset = resetWidgetProps('recentFollowers')
    expect(reset.color).toBe('#f6f6f4')
    expect(reset.maxItems).toBe(5)
    expect(element.width).toBe(420)
    expect(element.height).toBe(340)
  })
})
