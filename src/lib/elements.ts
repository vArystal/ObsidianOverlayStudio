import type { ElementType, Overlay, OverlayElement } from '../types'

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: 'Text',
  image: 'Image / Logo',
  webcam: 'Webcam Frame',
  capture: 'Screen / Game plan',
  chat: 'Chat Box',
  alert: 'Alert Box',
  goal: 'Donation Goal',
  shape: 'Shape / Border',
  counter: 'Custom Counter',
  countdown: 'Countdown Timer',
  supporter: 'Latest Supporter',
}

const uid = (prefix = 'item') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export function createEmptyOverlay(name = 'Untitled overlay'): Overlay {
  const now = new Date().toISOString()
  return {
    id: uid('overlay'),
    publicId: uid('pub'),
    name,
    width: 1920,
    height: 1080,
    elements: [],
    settings: {
      showGrid: false,
      snap: true,
      showSafeArea: false,
      transparent: true,
      backgroundImage: null,
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  }
}

const base = (type: ElementType, index: number): OverlayElement => ({
  id: uid(type),
  type,
  name: ELEMENT_LABELS[type],
  x: 96 + (index % 5) * 28,
  y: 96 + (index % 5) * 28,
  width: 420,
  height: 180,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  includeInOutput: true,
  maintainAspectRatio: false,
  animation: { type: 'none', duration: 450 },
  props: {},
})

export function createElement(type: ElementType, index = 0): OverlayElement {
  const item = base(type, index)
  switch (type) {
    case 'text':
      return {
        ...item,
        width: 560,
        height: 120,
        props: {
          text: 'Your stream, your story.',
          fontFamily: 'Inter',
          fontSize: 54,
          fontWeight: 700,
          color: '#ffffff',
          textAlign: 'left',
          lineHeight: 1.15,
          direction: 'auto',
        },
      }
    case 'image':
      return {
        ...item,
        width: 360,
        height: 220,
        maintainAspectRatio: true,
        props: { src: '', alt: 'Uploaded overlay asset', fit: 'contain' },
      }
    case 'webcam':
      return {
        ...item,
        name: 'Webcam frame',
        width: 480,
        height: 270,
        includeInOutput: false,
        props: {
          shape: 'rounded',
          borderWidth: 8,
          borderColor: '#8b5cf6',
          borderRadius: 28,
          fillColor: '#15151d',
          fillOpacity: 0.48,
          label: 'WEBCAM — PLANNING PLACEHOLDER',
        },
      }
    case 'capture':
      return {
        ...item,
        name: 'Game capture plan',
        x: 150,
        y: 120,
        width: 1280,
        height: 720,
        includeInOutput: false,
        maintainAspectRatio: true,
        props: {
          borderColor: '#64748b',
          borderWidth: 3,
          fillColor: '#0b0b10',
          fillOpacity: 0.72,
          label: 'GAME / DISPLAY CAPTURE — ADD THIS SOURCE IN OBS',
        },
      }
    case 'chat':
      return {
        ...item,
        width: 420,
        height: 520,
        props: {
          fontFamily: 'Inter',
          fontSize: 20,
          textColor: '#f8fafc',
          backgroundColor: '#0d0d13',
          backgroundOpacity: 0.76,
          messageSpacing: 14,
          maxMessages: 5,
          showUsernames: true,
          showTimestamps: false,
          showAvatars: true,
          entrance: 'fade',
          scrolling: false,
          dataSource: 'preview',
          borderRadius: 20,
        },
      }
    case 'alert':
      return {
        ...item,
        x: 700,
        y: 100,
        width: 520,
        height: 260,
        props: {
          title: 'New supporter!',
          message: 'Thanks for supporting the stream',
          textColor: '#ffffff',
          accentColor: '#a78bfa',
          backgroundColor: '#111118',
          imageSrc: '',
          soundName: 'No sound selected',
          provider: 'none',
        },
        animation: { type: 'scale', duration: 500 },
      }
    case 'goal':
      return {
        ...item,
        width: 560,
        height: 116,
        props: {
          title: 'Studio upgrade goal',
          target: 1000,
          current: 420,
          currency: '€',
          trackColor: '#242433',
          fillColor: '#8b5cf6',
          textColor: '#ffffff',
          dataSource: 'preview',
          borderRadius: 16,
        },
      }
    case 'shape':
      return {
        ...item,
        width: 420,
        height: 240,
        props: {
          shape: 'rectangle',
          fillColor: '#8b5cf6',
          fillOpacity: 0.18,
          borderColor: '#8b5cf6',
          borderWidth: 3,
          borderRadius: 24,
        },
      }
    case 'counter':
      return {
        ...item,
        width: 300,
        height: 120,
        props: {
          label: 'Wins',
          value: 12,
          color: '#ffffff',
          backgroundColor: '#111118',
          accentColor: '#22d3ee',
        },
      }
    case 'countdown':
      return {
        ...item,
        width: 360,
        height: 130,
        props: {
          label: 'STREAM STARTS IN',
          minutes: 10,
          color: '#ffffff',
          backgroundColor: '#111118',
          accentColor: '#8b5cf6',
        },
      }
    case 'supporter':
      return {
        ...item,
        width: 400,
        height: 96,
        props: {
          label: 'LATEST SUPPORTER',
          value: 'Waiting for integration',
          color: '#ffffff',
          accentColor: '#a78bfa',
          backgroundColor: '#111118',
          dataSource: 'none',
        },
      }
  }
}

export function duplicateElement(element: OverlayElement, index: number): OverlayElement {
  return {
    ...structuredClone(element),
    id: uid(element.type),
    name: `${element.name} copy`,
    x: element.x + 32,
    y: element.y + 32,
    props: { ...element.props },
    animation: { ...element.animation },
  }
}

export function cloneOverlay(source: Overlay): Overlay {
  const clone = structuredClone(source)
  const now = new Date().toISOString()
  return {
    ...clone,
    id: uid('overlay'),
    publicId: uid('pub'),
    name: `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    elements: clone.elements.map((element, index) => duplicateElement(element, index)),
  }
}
