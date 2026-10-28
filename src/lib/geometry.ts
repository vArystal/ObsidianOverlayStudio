import type { Guide, OverlayElement } from '../types'

export const MIN_ELEMENT_SIZE = 32

export function clampElement(
  element: OverlayElement,
  canvasWidth: number,
  canvasHeight: number,
): OverlayElement {
  const width = Math.max(MIN_ELEMENT_SIZE, Math.min(element.width, canvasWidth))
  const height = Math.max(MIN_ELEMENT_SIZE, Math.min(element.height, canvasHeight))
  return {
    ...element,
    width,
    height,
    x: Math.max(0, Math.min(element.x, canvasWidth - width)),
    y: Math.max(0, Math.min(element.y, canvasHeight - height)),
  }
}

export function snapPosition(
  element: OverlayElement,
  canvasWidth: number,
  canvasHeight: number,
  threshold = 12,
): { element: OverlayElement; guides: Guide[] } {
  let x = element.x
  let y = element.y
  const guides: Guide[] = []
  const centerX = x + element.width / 2
  const centerY = y + element.height / 2
  const right = x + element.width
  const bottom = y + element.height

  if (Math.abs(x) <= threshold) {
    x = 0
    guides.push({ axis: 'x', value: 0 })
  } else if (Math.abs(centerX - canvasWidth / 2) <= threshold) {
    x = canvasWidth / 2 - element.width / 2
    guides.push({ axis: 'x', value: canvasWidth / 2 })
  } else if (Math.abs(right - canvasWidth) <= threshold) {
    x = canvasWidth - element.width
    guides.push({ axis: 'x', value: canvasWidth })
  }

  if (Math.abs(y) <= threshold) {
    y = 0
    guides.push({ axis: 'y', value: 0 })
  } else if (Math.abs(centerY - canvasHeight / 2) <= threshold) {
    y = canvasHeight / 2 - element.height / 2
    guides.push({ axis: 'y', value: canvasHeight / 2 })
  } else if (Math.abs(bottom - canvasHeight) <= threshold) {
    y = canvasHeight - element.height
    guides.push({ axis: 'y', value: canvasHeight })
  }
  return { element: clampElement({ ...element, x, y }, canvasWidth, canvasHeight), guides }
}

export function roundGeometry(value: number) {
  return Math.round(value * 10) / 10
}
