export type ElementType =
  | 'text'
  | 'image'
  | 'webcam'
  | 'capture'
  | 'chat'
  | 'alert'
  | 'goal'
  | 'shape'
  | 'counter'
  | 'countdown'
  | 'supporter'

export type AnimationType = 'none' | 'fade' | 'slide' | 'scale'
export type TextDirection = 'ltr' | 'rtl' | 'auto'

export interface OverlayAnimation {
  type: AnimationType
  duration: number
}

export interface OverlayElement {
  id: string
  type: ElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  includeInOutput: boolean
  maintainAspectRatio: boolean
  animation: OverlayAnimation
  props: Record<string, string | number | boolean | null>
}

export interface CanvasSettings {
  showGrid: boolean
  snap: boolean
  showSafeArea: boolean
  transparent: boolean
  backgroundImage: string | null
}

export interface Overlay {
  id: string
  publicId: string
  name: string
  width: number
  height: number
  elements: OverlayElement[]
  settings: CanvasSettings
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface Guide {
  axis: 'x' | 'y'
  value: number
}

export interface StorageResult<T> {
  ok: boolean
  value?: T
  error?: string
}
