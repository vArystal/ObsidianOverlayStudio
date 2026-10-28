import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Overlay, StorageResult } from '../types'

const STORAGE_KEY = 'obsidian-overlays-v1'

function isOverlay(value: unknown): value is Overlay {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Overlay>
  return (
    typeof item.id === 'string' &&
    typeof item.publicId === 'string' &&
    typeof item.name === 'string' &&
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    Array.isArray(item.elements)
  )
}

export function loadOverlays(): Overlay[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isOverlay)
  } catch {
    return []
  }
}

export function saveOverlay(overlay: Overlay): StorageResult<Overlay> {
  try {
    const overlays = loadOverlays()
    const updated = { ...structuredClone(overlay), updatedAt: new Date().toISOString() }
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

export function getOverlay(id: string): Overlay | undefined {
  return loadOverlays().find((overlay) => overlay.id === id)
}

export function getOverlayByPublicId(publicId: string): Overlay | undefined {
  return loadOverlays().find((overlay) => overlay.publicId === publicId)
}

export function deleteOverlay(id: string): StorageResult<true> {
  try {
    const overlays = loadOverlays().filter((overlay) => overlay.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays))
    return { ok: true, value: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser storage error'
    return { ok: false, error: `Could not delete overlay: ${message}` }
  }
}

export function encodeOverlaySnapshot(overlay: Overlay): string {
  const clean = { ...overlay, publishedAt: new Date().toISOString() }
  return compressToEncodedURIComponent(JSON.stringify(clean))
}

export function decodeOverlaySnapshot(snapshot: string): Overlay | undefined {
  try {
    const json = decompressFromEncodedURIComponent(snapshot)
    if (!json) return undefined
    const value: unknown = JSON.parse(json)
    return isOverlay(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function storageKeyForTests() {
  return STORAGE_KEY
}
