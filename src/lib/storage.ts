import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ElementDecoration, Overlay, OverlayAnimation, OverlayElement, StorageResult } from '../types'
import { createAnimation, normalizeContainerProps } from './elements'
import { normalizeLooseProps, normalizeWidgetProps, normaliseAnimationValues, safeString } from './propSchema'
import { widgetFor } from './widgets'
import { createAlertSettings } from './alerts'
import type { AlertSettings } from './alerts'
import { snapshotBudget } from './images'
import { createDecoration, getTheme } from './themes'
import { normalizeBackground } from './backgrounds'
import { normalizeAlertSettings } from './alerts'
import { normalizeMotion } from './motion'
import { findFont, normalizeTypography } from './typography'

const STORAGE_KEY = 'obsidian-overlays-v1'
const FORBIDDEN_PUBLIC_KEYS = new Set(['accesstoken', 'refreshtoken', 'clientsecret', 'managementtoken', 'tokenencryptionkey', 'codeverifier', 'oauthverifier', 'authorization', 'password'])
function isForbiddenPublicKey(key: string) {
  const normalized = key.replace(/[-_]/g, '').toLowerCase()
  return FORBIDDEN_PUBLIC_KEYS.has(normalized) || normalized.endsWith('password') || normalized.endsWith('clientsecret')
}

function isOverlay(value: unknown): value is Overlay {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Overlay>
  return typeof item.id === 'string' && typeof item.publicId === 'string' && typeof item.name === 'string' && typeof item.width === 'number' && typeof item.height === 'number' && Array.isArray(item.elements)
}

function normalizeAnimation(value: Partial<OverlayAnimation> | undefined): OverlayAnimation {
  // CP39: the block used to be a raw spread, so a hand-edited duration of -5 or 1e9 reached the canvas. Every field
  // is now clamped to the band the inspector can show again.
  const defaults = createAnimation((value?.type ?? 'fade') as OverlayAnimation['type'])
  return normaliseAnimationValues({ ...defaults, ...value }) as OverlayAnimation
}

/** Legacy alert props. They were orphaned the moment templates took over rendering, so they migrate once and go. */
const LEGACY_ALERT_KEYS = ['title', 'message', 'imageSrc', 'soundName', 'soundEnabled', 'eventTypes', 'provider'] as const

export interface AlertPropMigration {
  settings: AlertSettings
  elements: OverlayElement[]
  migrated: boolean
}

/**
 * CP39: fold the pre-template alert element props into overlay.alerts.templates.
 *
 * A template that the author already customised is never overwritten: the legacy value only wins where the
 * template still equals the shipped default, which is exactly the case the element props used to render.
 * `provider` and `eventTypes` are dropped rather than migrated because routing is derived from ALERT_KINDS now.
 */
export function migrateAlertElementProps(elements: OverlayElement[], settings: AlertSettings): AlertPropMigration {
  const defaults = createAlertSettings()
  const alertElements = elements.filter((element) => element.type === 'alert')
  const legacy = alertElements.find((element) => LEGACY_ALERT_KEYS.some((key) => key in (element.props ?? {})))
  if (!legacy) return { settings, elements, migrated: false }
  const props = legacy.props as Record<string, unknown>
  const templates = { ...settings.templates }
  for (const kind of Object.keys(templates) as (keyof typeof templates)[]) {
    const template = { ...templates[kind] }
    const shipped = defaults.templates[kind]
    const title = safeString(props.title, '').trim()
    const message = safeString(props.message, '').trim()
    if (title && template.headline === shipped.headline) template.headline = title
    if (message && template.message === shipped.message) template.message = message
    if (typeof props.imageSrc === 'string' && props.imageSrc && !template.imageSrc) template.imageSrc = props.imageSrc
    if (typeof props.soundName === 'string' && props.soundName && !template.audio.src) template.audio = { ...template.audio, name: props.soundName }
    templates[kind] = template
  }
  const muted = props.soundEnabled === false ? true : settings.muted
  return {
    settings: { ...settings, muted, templates },
    elements: elements.map((element) => {
      if (element.type !== 'alert') return element
      const next = { ...(element.props ?? {}) }
      for (const key of LEGACY_ALERT_KEYS) delete next[key]
      return { ...element, props: next }
    }),
    migrated: true,
  }
}

/** A saved stack that resolves to a shipped family becomes its id; anything unresolvable is left exactly as it was. */
export function migrateFontId(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value
  const font = findFont(value)
  return font ? font.id : value
}

function normalizeDecoration(value: Partial<ElementDecoration> | undefined): ElementDecoration {
  return { ...createDecoration(value?.preset ?? 'royal-panel'), ...value }
}

function normalizeElement(element: OverlayElement): OverlayElement {
  const base = { ...element, animation: normalizeAnimation(element.animation), decoration: normalizeDecoration(element.decoration) }
  // CP39: one font vocabulary. A stack that resolves to a shipped family is stored as its id, so chat, alerts and
  // typography all read the same value; a stack nobody ships is left verbatim and reported as missing.
  const withFont = (props: Record<string, unknown>) => (
    props && typeof props === 'object' && 'fontFamily' in props ? { ...props, fontFamily: migrateFontId(props.fontFamily) as string } : props
  ) as OverlayElement['props']
  // Legacy data predates containers entirely, so only a container is coerced here; shapes keep their own props.
  if (element.type === 'container') return { ...base, props: withFont(normalizeContainerProps(element.props)) }
  // CP23 fills only the typography keys that are absent. A stack written by an earlier version stays verbatim.
  if (element.type === 'text') return { ...base, props: withFont(normalizeTypography(element.props)) }
  // CP39: every registry widget is validated against its declared props, so a hand-edited snapshot cannot reach
  // the canvas with an impossible size, opacity or enum.
  const widget = widgetFor(element.type)
  if (widget && Object.keys(widget.defaults).length) return { ...base, props: withFont(normalizeWidgetProps(widget, element.props)) }
  // CP39: a shape, image or capture guide has no widget defaults, but its props are still bounded in place.
  return { ...base, props: withFont(normalizeLooseProps(base.props)) }
}

export function normalizeOverlay(overlay: Overlay): Overlay {
  const elements = (overlay.elements ?? []).map(normalizeElement)
  const migrated = migrateAlertElementProps(elements, normalizeAlertSettings(overlay.alerts))
  return {
    ...overlay,
    // A saved overlay may name a retired theme. Resolve it to its replacement and take the new preset whole:
    // the old palette belongs to an identity that no longer exists. Elements, text and layout are untouched.
    theme: getTheme(overlay.theme?.id),
    // A legacy overlay has no background at all; a hand-edited one may carry nonsense. Either way the scene is
    // coerced to something usable, and a disabled backdrop stays exactly as the author left it.
    background: normalizeBackground(overlay.background),
    staticMotion: Boolean(overlay.staticMotion),
    live: overlay.live ?? null,
    // CP25: a legacy overlay has no alert block; a hand-edited one may carry nonsense. Either resolves to the
    // default document, so the alert element keeps working exactly as before the queue existed.
    alerts: normalizeAlertSettings(migrated.settings),
    // CP27: only elements that actually carry motion get the block back, so legacy overlays stay byte-identical.
    // CP27: normalise the element, then re-attach motion only when the element really carries it, so a legacy
    // overlay round-trips unchanged and no empty motion block creeps into the snapshot URL.
    elements: migrated.elements.map((element) => {
      const motion = normalizeMotion(element.motion)
      return motion ? { ...element, motion } : element
    }),
  }
}

export function loadOverlays(): Overlay[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isOverlay).map(normalizeOverlay)
  } catch {
    return []
  }
}

export function saveOverlay(overlay: Overlay): StorageResult<Overlay> {
  try {
    const overlays = loadOverlays()
    const updated = { ...structuredClone(normalizeOverlay(overlay)), updatedAt: new Date().toISOString() }
    const index = overlays.findIndex((item) => item.id === overlay.id)
    if (index >= 0) overlays[index] = updated
    else overlays.push(updated)
    // CP39: the snapshot budget used to run only on publish, so an overlay that could never be published was still
    // written to localStorage and only explained later. The save is refused first, with the same message.
    const serialised = JSON.stringify(overlays)
    const budget = snapshotBudget(serialised.length)
    if (budget.level === 'blocked') {
      return { ok: false, error: `Not saved: ${budget.message}` }
    }
    localStorage.setItem(STORAGE_KEY, serialised)
    return { ok: true, value: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser storage error'
    return { ok: false, error: `Could not save locally: ${message}` }
  }
}

export function getOverlay(id: string): Overlay | undefined { return loadOverlays().find((overlay) => overlay.id === id) }
export function getOverlayByPublicId(publicId: string): Overlay | undefined { return loadOverlays().find((overlay) => overlay.publicId === publicId) }

export function deleteOverlay(id: string): StorageResult<true> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadOverlays().filter((overlay) => overlay.id !== id)))
    return { ok: true, value: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser storage error'
    return { ok: false, error: `Could not delete overlay: ${message}` }
  }
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !isForbiddenPublicKey(key)).map(([key, item]) => [key, stripSecrets(item)]))
}

export function sanitizeOverlayForPublish(overlay: Overlay): Overlay {
  return normalizeOverlay(stripSecrets(structuredClone(overlay)) as Overlay)
}

export function encodeOverlaySnapshot(overlay: Overlay): string {
  const clean = { ...sanitizeOverlayForPublish(overlay), publishedAt: new Date().toISOString() }
  return compressToEncodedURIComponent(JSON.stringify(clean))
}

export function decodeOverlaySnapshot(snapshot: string): Overlay | undefined {
  try {
    const json = decompressFromEncodedURIComponent(snapshot)
    if (!json) return undefined
    const value: unknown = JSON.parse(json)
    return isOverlay(value) ? normalizeOverlay(value) : undefined
  } catch { return undefined }
}

export function storageKeyForTests() { return STORAGE_KEY }
