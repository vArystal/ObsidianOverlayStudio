import type { AnimationType, DecorationPresetId, ElementType, Overlay, OverlayAnimation, OverlayElement } from '../types'
import { createDecoration, DEFAULT_THEME } from './themes'
import { DEFAULT_BACKGROUND } from './backgrounds'

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: 'Text', image: 'Image / Logo', webcam: 'Webcam Frame', capture: 'Screen / Game plan',
  chat: 'Kick Chat', alert: 'Kick Event Alert', goal: 'Donation Goal', shape: 'Shape / Border', container: 'Empty container',
  frame: 'Decorative Persian Frame', counter: 'Custom Counter', countdown: 'Countdown Timer',
  supporter: 'Latest Supporter', viewerCount: 'Kick Viewer Count', sessionFollowers: 'Session Follows', latestFollower: 'Latest Kick Follower',
}

const uid = (prefix = 'item') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export function createAnimation(type: AnimationType = 'fade'): OverlayAnimation {
  return {
    type, exit: 'fade', idle: 'none', duration: 550, exitDuration: 420, delay: 0,
    direction: 'up', easing: 'ease-out', intensity: 0.65, holdDuration: 5200, reducedMotion: 'respect',
  }
}

export function createEmptyOverlay(name = 'Untitled overlay'): Overlay {
  const now = new Date().toISOString()
  return {
    id: uid('overlay'), publicId: uid('pub'), name, width: 1920, height: 1080, elements: [],
    settings: { showGrid: false, snap: true, showSafeArea: false, transparent: true, backgroundImage: null },
    theme: structuredClone(DEFAULT_THEME), background: { ...DEFAULT_BACKGROUND }, staticMotion: false, live: null,
    createdAt: now, updatedAt: now, publishedAt: null,
  }
}

function decorationFor(type: ElementType, preset?: DecorationPresetId) {
  if (preset) return createDecoration(preset)
  if (type === 'text' || type === 'image' || type === 'shape') return createDecoration('none')
  if (type === 'frame' || type === 'webcam' || type === 'capture') return createDecoration('ornamental-frame')
  return createDecoration('royal-panel')
}

const base = (type: ElementType, index: number): OverlayElement => ({
  // A 28px cascade buries the layer below it: a 420x180 element added on top leaves a 28px sliver
  // of the one underneath, which is not selectable on canvas. A 120px stride keeps the top edge of
  // every earlier layer reachable while still clustering new work near the top left.
  id: uid(type), type, name: ELEMENT_LABELS[type], x: 96 + (index % 6) * 120, y: 96 + (index % 6) * 120,
  width: 420, height: 180, rotation: 0, opacity: 1, visible: true, locked: false,
  includeInOutput: true, maintainAspectRatio: false, animation: createAnimation(), decoration: decorationFor(type), props: {},
})

export function createElement(type: ElementType, index = 0): OverlayElement {
  const item = base(type, index)
  switch (type) {
    case 'text':
      return { ...item, width: 600, height: 126, props: { text: 'به استریم من خوش آمدید', fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 52, fontWeight: 700, color: '#f6f6f4', textAlign: 'right', lineHeight: 1.3, direction: 'rtl' } }
    case 'image':
      return { ...item, width: 360, height: 220, maintainAspectRatio: true, props: { src: '', alt: 'Uploaded overlay asset', fit: 'contain' } }
    case 'webcam':
      return { ...item, name: 'Persian webcam frame', width: 480, height: 270, includeInOutput: false, props: { shape: 'rounded', borderWidth: 0, borderColor: '#e8e8e6', borderRadius: 24, fillColor: '#121214', fillOpacity: 0.22, label: 'وب‌کم — راهنمای چیدمان' } }
    case 'capture':
      return { ...item, name: 'Persian game frame', x: 150, y: 120, width: 1280, height: 720, includeInOutput: false, maintainAspectRatio: true, props: { borderColor: '#e8e8e6', borderWidth: 0, fillColor: '#101012', fillOpacity: 0.34, label: 'GAME / DISPLAY CAPTURE — ADD IN OBS' } }
    case 'chat':
      return { ...item, width: 460, height: 560, props: { fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 20, textColor: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, messageSpacing: 14, maxMessages: 7, messageDuration: 28, showUsernames: true, showTimestamps: false, showAvatars: true, showBadges: true, entrance: 'ornamental', exit: 'fade', scrolling: true, dataSource: 'kick', borderRadius: 18, direction: 'auto' }, animation: { ...createAnimation('ornamental'), idle: 'none' } }
    case 'alert':
      return { ...item, x: 700, y: 100, width: 560, height: 280, props: { title: 'رویداد جدید', message: 'از همراهی شما سپاسگزاریم', textColor: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', imageSrc: '', soundName: 'No sound selected', soundEnabled: false, provider: 'kick', eventTypes: 'channel.followed,channel.subscription.new,channel.subscription.gifts,kicks.gifted' }, animation: { ...createAnimation('pop'), exit: 'scale', idle: 'sparkle', holdDuration: 5500 } }
    case 'goal':
      return { ...item, width: 580, height: 132, props: { title: 'هدف حمایت', target: 1000, current: 0, currency: '€', trackColor: '#232326', fillColor: '#e8e8e6', textColor: '#f6f6f4', dataSource: 'preview', borderRadius: 12, includePreviewOutput: false } }
    case 'shape':
      return { ...item, width: 420, height: 240, props: { shape: 'rectangle', fillColor: '#6d28a8', fillOpacity: 0.16, borderColor: '#e8e8e6', borderWidth: 2, borderRadius: 24 } }
    case 'container':
      // A container owns its whole look in props, so a preset is appearance-only and the user keeps the geometry.
      return { ...item, width: 560, height: 320, props: { ...CONTAINER_PRESETS[0].props, preset: CONTAINER_PRESETS[0].id } }
    case 'frame':
      return { ...item, width: 720, height: 420, decoration: createDecoration('ornamental-frame'), props: { label: 'Decorative frame' }, animation: { ...createAnimation('ornamental'), idle: 'shimmer', duration: 900 } }
    case 'counter':
      return { ...item, width: 320, height: 138, props: { label: 'پیروزی‌ها', value: 12, color: '#f6f6f4', backgroundColor: '#121214', accentColor: '#e8e8e6' }, animation: { ...createAnimation('pop'), idle: 'glow' } }
    case 'countdown':
      return { ...item, width: 390, height: 145, props: { label: 'شروع استریم تا', minutes: 10, color: '#f6f6f4', backgroundColor: '#121214', accentColor: '#e8e8e6' } }
    case 'supporter':
      return { ...item, width: 430, height: 108, props: { label: 'آخرین حامی', value: 'Donation provider not connected', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', dataSource: 'none' } }
    case 'viewerCount':
      return { ...item, width: 300, height: 126, props: { label: 'بیننده زنده', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', offlineText: 'آفلاین' }, animation: { ...createAnimation('fade'), idle: 'glow' } }
    case 'sessionFollowers':
      return { ...item, width: 330, height: 126, props: { label: 'دنبال‌کننده این نشست', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', startValue: 0 }, animation: createAnimation('pop') }
    case 'latestFollower':
      return { ...item, width: 430, height: 108, props: { label: 'آخرین دنبال‌کننده', emptyText: 'منتظر رویداد واقعی Kick', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214' }, animation: { ...createAnimation('slide'), idle: 'shimmer' } }
  }
}

export function duplicateElement(element: OverlayElement, _index: number): OverlayElement {
  return { ...structuredClone(element), id: uid(element.type), name: `${element.name} copy`, x: element.x + 32, y: element.y + 32, props: { ...element.props }, animation: { ...element.animation }, decoration: { ...element.decoration } }
}

export function cloneOverlay(source: Overlay): Overlay {
  const clone = structuredClone(source)
  const now = new Date().toISOString()
  return { ...clone, id: uid('overlay'), publicId: uid('pub'), name: `${source.name} copy`, createdAt: now, updatedAt: now, publishedAt: null, elements: clone.elements.map((element, index) => duplicateElement(element, index)) }
}

export interface ContainerPreset {
  id: string
  label: string
  blurb: string
  props: Record<string, string | number>
}

/** Appearance-only presets. Geometry, position and layer order stay whatever the author set. */
export const CONTAINER_PRESETS: ContainerPreset[] = [
  {
    id: 'clean-frame', label: 'Clean Frame', blurb: 'Hairline card, nothing else',
    props: { fill: 'solid', fillColor: '#0e0e10', fillOpacity: 0.42, fillColor2: '#17171a', gradientAngle: 160, borderStyle: 'solid', borderWidth: 1, borderColor: '#e8e8e6', borderOpacity: 0.32, radius: 10, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 },
  },
  {
    id: 'glass-panel', label: 'Glass Panel', blurb: 'Frosted plate with a lit edge',
    props: { fill: 'gradient', fillColor: '#20232a', fillColor2: '#101114', gradientAngle: 140, fillOpacity: 0.36, borderStyle: 'solid', borderWidth: 1, borderColor: '#ffffff', borderOpacity: 0.24, radius: 18, shadow: 'soft', glow: 'none', inner: 'subtle', blur: 10 },
  },
  {
    id: 'cinematic-panel', label: 'Cinematic Panel', blurb: 'Deep slab with a wide falloff',
    props: { fill: 'gradient', fillColor: '#141416', fillColor2: '#050506', gradientAngle: 180, fillOpacity: 0.82, borderStyle: 'none', borderWidth: 0, borderColor: '#000000', borderOpacity: 0, radius: 4, shadow: 'deep', glow: 'none', inner: 'none', blur: 0 },
  },
  {
    id: 'neon-outline', label: 'Neon Outline', blurb: 'Empty box that only glows',
    props: { fill: 'transparent', fillColor: '#0e0e10', fillOpacity: 0, fillColor2: '#17171a', gradientAngle: 160, borderStyle: 'solid', borderWidth: 2, borderColor: '#7ce7ff', borderOpacity: 0.75, radius: 14, shadow: 'none', glow: 'subtle', inner: 'none', blur: 0 },
  },
  {
    id: 'minimal-divider', label: 'Minimal Divider', blurb: 'A single rule, horizontal or vertical',
    props: { fill: 'solid', fillColor: '#ffffff', fillOpacity: 0.22, fillColor2: '#ffffff', gradientAngle: 90, borderStyle: 'none', borderWidth: 0, borderColor: '#ffffff', borderOpacity: 0, radius: 1, shadow: 'none', glow: 'none', inner: 'none', blur: 0 },
  },
  {
    id: 'soft-gradient', label: 'Soft Gradient', blurb: 'Two-tone wash with a quiet edge',
    props: { fill: 'gradient', fillColor: '#1b2430', fillColor2: '#0c1014', gradientAngle: 120, fillOpacity: 0.58, borderStyle: 'solid', borderWidth: 1, borderColor: '#cfd2d6', borderOpacity: 0.18, radius: 24, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 },
  },
  {
    id: 'dark-info', label: 'Dark Information Panel', blurb: 'Opaque enough to read over gameplay',
    props: { fill: 'solid', fillColor: '#0b0b0c', fillOpacity: 0.88, fillColor2: '#17171a', gradientAngle: 160, borderStyle: 'solid', borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 6, shadow: 'soft', glow: 'none', inner: 'none', blur: 0 },
  },
  {
    id: 'blank', label: 'Custom / Blank', blurb: 'Invisible until you style it',
    props: { fill: 'transparent', fillColor: '#0e0e10', fillOpacity: 0, fillColor2: '#17171a', gradientAngle: 160, borderStyle: 'none', borderWidth: 0, borderColor: '#e8e8e6', borderOpacity: 0, radius: 0, shadow: 'none', glow: 'none', inner: 'none', blur: 0 },
  },
]

export const CONTAINER_DEFAULT_PROPS = CONTAINER_PRESETS[0].props

/**
 * Coerces a saved or hand-edited container into something renderable. Every value has a range, so a bad number
 * from an older build cannot produce a broken box or, worse, a crash on load.
 */
export function normalizeContainerProps(props: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const raw = props ?? {}
  const pick = (key: string, fallback: string | number) => raw[key] ?? fallback
  const number = (key: string, min: number, max: number, fallback: number) => {
    const value = Number(pick(key, fallback))
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  }
  const fill = ['transparent', 'solid', 'gradient'].includes(String(pick('fill', 'solid'))) ? String(pick('fill', 'solid')) : 'solid'
  const borderStyle = ['none', 'solid', 'dashed', 'dotted'].includes(String(pick('borderStyle', 'solid'))) ? String(pick('borderStyle', 'solid')) : 'solid'
  return {
    ...raw,
    fill,
    borderStyle,
    fillColor: String(pick('fillColor', '#0e0e10')),
    fillColor2: String(pick('fillColor2', '#17171a')),
    borderColor: String(pick('borderColor', '#e8e8e6')),
    gradientAngle: number('gradientAngle', 0, 360, 160),
    fillOpacity: number('fillOpacity', 0, 1, 0.42),
    borderOpacity: number('borderOpacity', 0, 1, 0.32),
    borderWidth: number('borderWidth', 0, 24, 1),
    radius: number('radius', 0, 400, 10),
    blur: number('blur', 0, 24, 0),
    shadow: ['none', 'soft', 'deep'].includes(String(pick('shadow', 'soft'))) ? String(pick('shadow', 'soft')) : 'soft',
    glow: ['none', 'subtle', 'strong'].includes(String(pick('glow', 'none'))) ? String(pick('glow', 'none')) : 'none',
    inner: ['none', 'subtle'].includes(String(pick('inner', 'none'))) ? String(pick('inner', 'none')) : 'none',
  }
}

/** The CSS a container renders with, shared by the editor and the public runtime so the two cannot drift. */
export function containerStyle(props: Record<string, unknown> | undefined, opacity = 1): Record<string, string | number> {
  const value = normalizeContainerProps(props)
  const fill = String(value.fill)
  const background = fill === 'transparent'
    ? 'transparent'
    : fill === 'gradient'
      ? `linear-gradient(${value.gradientAngle}deg, ${hexToRgba(String(value.fillColor), Number(value.fillOpacity))}, ${hexToRgba(String(value.fillColor2), Number(value.fillOpacity))})`
      : hexToRgba(String(value.fillColor), Number(value.fillOpacity))
  const casts = fill !== 'transparent' || value.borderStyle !== 'none'
  const shadow = !casts ? 'none' : value.shadow === 'deep' ? '0 26px 60px -18px rgba(0,0,0,.75)' : value.shadow === 'soft' ? '0 14px 32px -16px rgba(0,0,0,.55)' : 'none'
  const glow = value.glow === 'strong' ? `0 0 34px ${hexToRgba(String(value.borderColor), .55)}` : value.glow === 'subtle' ? `0 0 20px ${hexToRgba(String(value.borderColor), .35)}` : 'none'
  const inner = value.inner === 'subtle' ? 'inset 0 1px 0 rgba(255,255,255,.14)' : 'none'
  return {
    background,
    borderStyle: String(value.borderStyle),
    borderWidth: `${value.borderWidth}px`,
    borderColor: hexToRgba(String(value.borderColor), Number(value.borderOpacity)),
    borderRadius: `${value.radius}px`,
    boxShadow: [shadow, glow, inner].filter((part) => part !== 'none').join(', ') || 'none',
    backdropFilter: Number(value.blur) > 0 ? `blur(${value.blur}px)` : 'none',
    opacity: String(opacity),
  }
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const int = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(int)) return `rgba(255,255,255,${alpha})`
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
}
