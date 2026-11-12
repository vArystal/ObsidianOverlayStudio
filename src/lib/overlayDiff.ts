import type { Overlay, OverlayElement } from '../types'

/**
 * CP41: `JSON.stringify(a) === JSON.stringify(b)` ran on every keystroke and its cost was the whole document,
 * including base64 images that never change during an edit. This compares the same fields by identity first and by
 * shallow value second, so an untouched layer, image or alert template costs one pointer check.
 */
/**
 * Structural compare that stops descending at `depth` and trusts the remainder. Two objects that are still identical
 * six levels down are treated as untouched, which keeps alerts and props cheap while every edited key near the surface
 * is compared for real. Strings (including base64 images) compare by identity first, so an untouched image is a
 * pointer check rather than a content walk.
 */
const sameValue = (a: unknown, b: unknown, depth = 0): boolean => {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => sameValue(item, b[index], depth + 1))
  }
  if (depth >= 6) return true
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  for (const key of keys) if (!sameValue(left[key], right[key], depth + 1)) return false
  return true
}

const sameElement = (a: OverlayElement, b: OverlayElement): boolean =>
  a === b || (a.id === b.id && a.type === b.type && a.name === b.name && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.rotation === b.rotation && a.opacity === b.opacity && a.visible === b.visible && a.locked === b.locked &&
    a.includeInOutput === b.includeInOutput &&
    // Identity first, then structure: a cloned document shares no nested references, and a compare that only trusted
    // pointers would call every undo step a change.
    sameValue(a.decoration, b.decoration) && sameValue(a.motion, b.motion) &&
    sameValue(a.animation, b.animation) && sameValue(a.props, b.props))

/** True when the two documents would render and save identically. */
export function sameOverlay(a: Overlay, b: Overlay): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.publicId !== b.publicId || a.name !== b.name) return false
  if (a.width !== b.width || a.height !== b.height || a.staticMotion !== b.staticMotion || a.live !== b.live) return false
  if (!sameValue(a.background, b.background) || !sameValue(a.settings, b.settings) || !sameValue(a.theme, b.theme)) return false
  if (a.alerts !== b.alerts && !sameValue(a.alerts, b.alerts)) return false
  if (a.elements.length !== b.elements.length) return false
  for (let index = 0; index < a.elements.length; index += 1) if (!sameElement(a.elements[index], b.elements[index])) return false
  return true
}
