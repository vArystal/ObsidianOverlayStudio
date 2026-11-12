import { compressToEncodedURIComponent } from 'lz-string'
import { beforeEach, describe, expect, it } from 'vitest'
import { createElement, createEmptyOverlay } from './elements'
import { createAlertSettings } from './alerts'
import { decodeOverlaySnapshot, migrateAlertElementProps, normalizeOverlay, saveOverlay, storageKeyForTests } from './storage'
import { fontStack, isFontMissing } from './typography'
import { normalizeWidgetProps, clampNumber } from './propSchema'
import { widgetFor } from './widgets'
import type { Overlay } from '../types'

const overlayWith = (elements: Overlay['elements'], alerts?: unknown): Overlay => ({
  ...createEmptyOverlay('CP39 probe'),
  elements,
  alerts: (alerts ?? createAlertSettings()) as Overlay['alerts'],
})

/** A snapshot as a hand edit would leave it: numbers out of any sane band and enum values no renderer knows. */
function hostileOverlay(): Overlay {
  const text = createElement('text')
  text.props = { ...text.props, fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 1e9 }
  text.animation = { ...text.animation, duration: -5, idle: 'explode' as never, direction: 'diagonal' as never }
  const counter = createElement('counter')
  counter.props = { ...counter.props, opacityAll: 99, dataSource: 'attacker', fontSize: Number.POSITIVE_INFINITY, unknownFutureKey: 'x'.repeat(9_000) }
  const shape = createElement('shape')
  shape.props = { ...shape.props, fillOpacity: 42, borderRadius: -8, fillColor: 'javascript:alert(1)' }
  return { ...createEmptyOverlay('Hostile'), elements: [text, counter, shape] }
}

describe('CP39 hostile snapshot normalisation', () => {
  it('clamps an impossible size, a negative duration and an unknown enum on load', () => {
    const loaded = normalizeOverlay(hostileOverlay())
    const [text, counter, shape] = loaded.elements
    expect(text.props.fontSize).toBe(400)
    expect(text.animation.duration).toBe(0)
    expect(text.animation.idle).toBe('none')
    expect(text.animation.direction).toBe('up')
    expect(counter.props.dataSource).toBe('preview')
    // Out of band clamps to the edge; a value that is not a number at all (Infinity) falls back to the declared
    // default, because there is no sensible edge to clamp it to.
    expect(counter.props.fontSize).toBe(widgetFor('counter')!.defaults.fontSize)
    expect(shape.props.fillOpacity).toBe(1)
    expect(shape.props.borderRadius).toBe(0)
    // A colour that is not a six-digit hex would paint nothing; the default is used instead.
    expect(shape.props.fillColor).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps an unknown key but bounds it, so a newer build cannot lose data or smuggle a megabyte', () => {
    const loaded = normalizeOverlay(hostileOverlay())
    const counter = loaded.elements[1]
    expect(String(counter.props.unknownFutureKey)).toHaveLength(2_000)
    expect(typeof counter.props.opacityAll).toBe('number')
  })

  it('applies the same policy when a shared snapshot is decoded', () => {
    const snapshot = compressToEncodedURIComponent(JSON.stringify(hostileOverlay()))
    const decoded = decodeOverlaySnapshot(snapshot)
    expect(decoded).toBeTruthy()
    expect(decoded!.elements[0].props.fontSize).toBe(400)
    expect(decoded!.elements[0].animation.duration).toBe(0)
  })

  it('is idempotent: normalising twice changes nothing', () => {
    const once = normalizeOverlay(hostileOverlay())
    const twice = normalizeOverlay(once)
    expect(JSON.stringify(twice.elements)).toBe(JSON.stringify(once.elements))
  })

  it('clamps directly through the helper, including non-finite input', () => {
    expect(clampNumber(1e9, 0, 400, 20)).toBe(400)
    expect(clampNumber(-5, 0, 10_000, 420)).toBe(0)
    expect(clampNumber(Number.NaN, 0, 10, 3)).toBe(3)
    expect(clampNumber('17', 0, 100, 1)).toBe(17)
  })

  it('fills a registry widget from its declared defaults', () => {
    const definition = widgetFor('counter')!
    const props = normalizeWidgetProps(definition, { label: 'Wins' })
    expect(props.label).toBe('Wins')
    expect(props.value).toBe(definition.defaults.value)
    expect(props.radius).toBe(definition.defaults.radius)
  })
})

describe('CP39 font vocabulary migration', () => {
  it('rewrites a legacy stack to the registry id without changing the painted family', () => {
    const legacy = createElement('text')
    legacy.props = { ...legacy.props, fontFamily: 'Vazirmatn, Tahoma, sans-serif' }
    const migrated = normalizeOverlay(overlayWith([legacy])).elements[0]
    expect(migrated.props.fontFamily).toBe('vazirmatn')
    expect(fontStack(migrated.props.fontFamily)).toBe(fontStack('Vazirmatn, Tahoma, sans-serif'))
  })

  it('migrates the chat stack the same way, and leaves a stack nobody ships exactly as it was', () => {
    const chat = createElement('chat')
    chat.props = { ...chat.props, fontFamily: 'Inter, Arial, sans-serif' }
    const exotic = createElement('chat')
    exotic.props = { ...exotic.props, fontFamily: 'Comic Sans MS, cursive' }
    const loaded = normalizeOverlay(overlayWith([chat, exotic]))
    expect(loaded.elements[0].props.fontFamily).toBe('inter')
    expect(loaded.elements[1].props.fontFamily).toBe('Comic Sans MS, cursive')
    // Left verbatim, and honestly reported as missing rather than silently swapped.
    expect(isFontMissing(loaded.elements[1].props.fontFamily)).toBe(true)
    expect(isFontMissing(loaded.elements[0].props.fontFamily)).toBe(false)
  })

  it('keeps an empty value empty, which means "widget default"', () => {
    const chat = createElement('chat')
    chat.props = { ...chat.props, fontFamily: '' }
    expect(normalizeOverlay(overlayWith([chat])).elements[0].props.fontFamily).toBe('')
  })
})

describe('CP39 alert prop migration', () => {
  const legacyAlert = () => {
    const alert = createElement('alert')
    alert.props = {
      ...alert.props,
      title: 'هدیه ویژه', message: '{username} یک هدیه فرستاد', imageSrc: 'data:image/png;base64,AAAA',
      soundName: 'chime.mp3', soundEnabled: false, eventTypes: 'channel.followed', provider: 'kick',
    }
    return alert
  }

  it('folds the element props into the templates and stops carrying them', () => {
    const loaded = normalizeOverlay(overlayWith([legacyAlert()]))
    const element = loaded.elements[0]
    for (const key of ['title', 'message', 'imageSrc', 'soundName', 'soundEnabled', 'eventTypes', 'provider']) {
      expect(key in element.props, `${key} still on the element`).toBe(false)
    }
    const templates = loaded.alerts!.templates
    expect(templates.follow.headline).toBe('هدیه ویژه')
    expect(templates.kicks.message).toBe('{username} یک هدیه فرستاد')
    expect(templates.gift.imageSrc).toBe('data:image/png;base64,AAAA')
    expect(templates.follow.audio.name).toBe('chime.mp3')
    expect(loaded.alerts!.muted).toBe(true)
  })

  it('never overwrites a template the author already customised', () => {
    const settings = createAlertSettings()
    settings.templates.follow = { ...settings.templates.follow, headline: 'Mine' }
    const result = migrateAlertElementProps([legacyAlert()], settings)
    expect(result.migrated).toBe(true)
    expect(result.settings.templates.follow.headline).toBe('Mine')
    expect(result.settings.templates.subscribe.headline).toBe('هدیه ویژه')
  })

  it('is a no-op on an overlay that never had the orphaned props', () => {
    const clean = normalizeOverlay(overlayWith([createElement('alert')]))
    expect(normalizeOverlay(clean).elements[0].props).toEqual(clean.elements[0].props)
  })
})

describe('CP39 save-time snapshot budget', () => {
  beforeEach(() => { localStorage.removeItem(storageKeyForTests()) })

  it('saves a normal overlay', () => {
    const result = saveOverlay(createEmptyOverlay('Small'))
    expect(result.ok).toBe(true)
  })

  it('refuses to write an overlay too large to ever publish, instead of failing the quota later', () => {
    const huge = { ...createEmptyOverlay('Huge'), elements: [createElement('image')] }
    huge.elements[0].props = { ...huge.elements[0].props, src: `data:image/png;base64,${'A'.repeat(1_600_000)}` }
    const result = saveOverlay(huge)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Not saved')
    // Nothing half-written: the bad overlay is not in storage.
    expect(localStorage.getItem(storageKeyForTests())).toBeNull()
  })
})

/** The acceptance claim is "legacy overlays render identically", so it is checked by rendering, not by inspection. */
describe('CP39 migrated overlays render byte-identically', async () => {
  const { render, cleanup } = await import('@testing-library/react')
  const { createElement: h } = await import('react')
  const { ElementRenderer } = await import('../components/ElementRenderer')
  const markupFor = (element: Overlay['elements'][number]) => {
    const view = render(h(ElementRenderer, { element }))
    const html = view.container.innerHTML
    cleanup()
    return html
  }

  it('paints a legacy text layer exactly as before the font migration', () => {
    const legacy = createElement('text')
    legacy.props = { ...legacy.props, fontFamily: 'Vazirmatn, Tahoma, sans-serif', text: 'سلام دنیا', fontSize: 44 }
    const before = markupFor(legacy)
    const after = markupFor(normalizeOverlay(overlayWith([legacy])).elements[0])
    expect(after).toBe(before)
  })

  it('paints a legacy chat layer exactly as before the font migration', () => {
    const legacy = createElement('chat')
    legacy.props = { ...legacy.props, fontFamily: 'Inter, Arial, sans-serif' }
    const before = markupFor(legacy)
    const after = markupFor(normalizeOverlay(overlayWith([legacy])).elements[0])
    expect(after).toBe(before)
  })
})
