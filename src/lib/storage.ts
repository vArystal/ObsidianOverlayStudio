import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ElementDecoration, Overlay, OverlayAnimation, OverlayElement, StorageResult } from '../types'
import { createAnimation } from './elements'
import { createDecoration, getTheme } from './themes'

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
  const defaults = createAnimation((value?.type ?? 'fade') as OverlayAnimation['type'])
  return { ...defaults, ...value, type: value?.type ?? defaults.type }
}

function normalizeDecoration(value: Partial<ElementDecoration> | undefined): ElementDecoration {
  return { ...createDecoration(value?.preset ?? 'royal-panel'), ...value }
}

function normalizeElement(element: OverlayElement): OverlayElement {
  return { ...element, animation: normalizeAnimation(element.animation), decoration: normalizeDecoration(element.decoration) }
}

export function normalizeOverlay(overlay: Overlay): Overlay {
  return {
    ...overlay,
    theme: { ...getTheme(overlay.theme?.id), ...(overlay.theme ?? {}) },
    staticMotion: Boolean(overlay.staticMotion),
    live: overlay.live ?? null,
    elements: overlay.elements.map(normalizeElement),
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays))
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
