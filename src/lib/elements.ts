import type { AnimationType, DecorationPresetId, ElementType, Overlay, OverlayAnimation, OverlayElement } from '../types'
import { createDecoration, DEFAULT_THEME } from './themes'

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: 'Text', image: 'Image / Logo', webcam: 'Webcam Frame', capture: 'Screen / Game plan',
  chat: 'Kick Chat', alert: 'Kick Event Alert', goal: 'Donation Goal', shape: 'Shape / Border',
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
    theme: structuredClone(DEFAULT_THEME), staticMotion: false, live: null,
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
      return { ...item, width: 600, height: 126, props: { text: 'به استریم من خوش آمدید', fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 52, fontWeight: 700, color: '#fff8e7', textAlign: 'right', lineHeight: 1.3, direction: 'rtl' } }
    case 'image':
      return { ...item, width: 360, height: 220, maintainAspectRatio: true, props: { src: '', alt: 'Uploaded overlay asset', fit: 'contain' } }
    case 'webcam':
      return { ...item, name: 'Persian webcam frame', width: 480, height: 270, includeInOutput: false, props: { shape: 'rounded', borderWidth: 0, borderColor: '#d8ad55', borderRadius: 24, fillColor: '#170b20', fillOpacity: 0.22, label: 'وب‌کم — راهنمای چیدمان' } }
    case 'capture':
      return { ...item, name: 'Persian game frame', x: 150, y: 120, width: 1280, height: 720, includeInOutput: false, maintainAspectRatio: true, props: { borderColor: '#d8ad55', borderWidth: 0, fillColor: '#0b0610', fillOpacity: 0.34, label: 'GAME / DISPLAY CAPTURE — ADD IN OBS' } }
    case 'chat':
      return { ...item, width: 460, height: 560, props: { fontFamily: 'Vazirmatn, Tahoma, sans-serif', fontSize: 20, textColor: '#fff8e7', backgroundColor: '#170b20', backgroundOpacity: 0.72, messageSpacing: 14, maxMessages: 7, messageDuration: 28, showUsernames: true, showTimestamps: false, showAvatars: true, showBadges: true, entrance: 'ornamental', exit: 'fade', scrolling: true, dataSource: 'kick', borderRadius: 18, direction: 'auto' }, animation: { ...createAnimation('ornamental'), idle: 'none' } }
    case 'alert':
      return { ...item, x: 700, y: 100, width: 560, height: 280, props: { title: 'رویداد جدید', message: 'از همراهی شما سپاسگزاریم', textColor: '#fff8e7', accentColor: '#d8ad55', backgroundColor: '#170b20', imageSrc: '', soundName: 'No sound selected', soundEnabled: false, provider: 'kick', eventTypes: 'channel.followed,channel.subscription.new,channel.subscription.gifts,kicks.gifted' }, animation: { ...createAnimation('pop'), exit: 'scale', idle: 'sparkle', holdDuration: 5500 } }
    case 'goal':
      return { ...item, width: 580, height: 132, props: { title: 'هدف حمایت', target: 1000, current: 0, currency: '€', trackColor: '#2b1238', fillColor: '#d8ad55', textColor: '#fff8e7', dataSource: 'preview', borderRadius: 12, includePreviewOutput: false } }
    case 'shape':
      return { ...item, width: 420, height: 240, props: { shape: 'rectangle', fillColor: '#6d28a8', fillOpacity: 0.16, borderColor: '#d8ad55', borderWidth: 2, borderRadius: 24 } }
    case 'frame':
      return { ...item, width: 720, height: 420, decoration: createDecoration('ornamental-frame'), props: { label: 'Decorative frame' }, animation: { ...createAnimation('ornamental'), idle: 'shimmer', duration: 900 } }
    case 'counter':
      return { ...item, width: 320, height: 138, props: { label: 'پیروزی‌ها', value: 12, color: '#fff8e7', backgroundColor: '#170b20', accentColor: '#d8ad55' }, animation: { ...createAnimation('pop'), idle: 'glow' } }
    case 'countdown':
      return { ...item, width: 390, height: 145, props: { label: 'شروع استریم تا', minutes: 10, color: '#fff8e7', backgroundColor: '#170b20', accentColor: '#d8ad55' } }
    case 'supporter':
      return { ...item, width: 430, height: 108, props: { label: 'آخرین حامی', value: 'Donation provider not connected', color: '#fff8e7', accentColor: '#d8ad55', backgroundColor: '#170b20', dataSource: 'none' } }
    case 'viewerCount':
      return { ...item, width: 300, height: 126, props: { label: 'بیننده زنده', color: '#fff8e7', accentColor: '#d8ad55', backgroundColor: '#170b20', offlineText: 'آفلاین' }, animation: { ...createAnimation('fade'), idle: 'glow' } }
    case 'sessionFollowers':
      return { ...item, width: 330, height: 126, props: { label: 'دنبال‌کننده این نشست', color: '#fff8e7', accentColor: '#d8ad55', backgroundColor: '#170b20', startValue: 0 }, animation: createAnimation('pop') }
    case 'latestFollower':
      return { ...item, width: 430, height: 108, props: { label: 'آخرین دنبال‌کننده', emptyText: 'منتظر رویداد واقعی Kick', color: '#fff8e7', accentColor: '#d8ad55', backgroundColor: '#170b20' }, animation: { ...createAnimation('slide'), idle: 'shimmer' } }
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
