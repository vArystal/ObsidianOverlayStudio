/**
 * CP25 alert model.
 *
 * One definition of what an alert is, how a real Kick delivery maps onto it, and how a template turns that
 * delivery into copy. The editor preview, the runtime stage and the tests all read this file, so an alert cannot
 * look one way in the studio and another on air.
 *
 * Nothing here invents data: `renderAlertCopy` only formats fields the delivery actually carried, and a missing
 * field renders its absence instead of a plausible placeholder.
 */
import type { LiveOverlayEvent } from '../types'
import { resolveFontId } from './typography'

export type AlertKind = 'follow' | 'subscribe' | 'resubscribe' | 'gift' | 'kicks' | 'milestone'

export interface AlertKindInfo {
  id: AlertKind
  label: string
  /** Kick (or derived) event types that produce this alert. Empty means the backend derives it. */
  eventTypes: string[]
  /** What the data source is, shown verbatim in the studio so nobody assumes a metric exists. */
  source: string
}

/** The event support matrix. Every row is a real, delivered event type; nothing is aspirational. */
export const ALERT_KINDS: AlertKindInfo[] = [
  { id: 'follow', label: 'New follower', eventTypes: ['channel.followed'], source: 'Kick webhook: channel.followed' },
  { id: 'subscribe', label: 'New subscriber', eventTypes: ['channel.subscription.new'], source: 'Kick webhook: channel.subscription.new' },
  { id: 'resubscribe', label: 'Subscription renewal', eventTypes: ['channel.subscription.renewal'], source: 'Kick webhook: channel.subscription.renewal' },
  { id: 'gift', label: 'Gifted subscription', eventTypes: ['channel.subscription.gifts'], source: 'Kick webhook: channel.subscription.gifts' },
  { id: 'kicks', label: 'KICKs gift', eventTypes: ['kicks.gifted'], source: 'Kick webhook: kicks.gifted (Kick currency, not money donations)' },
  { id: 'milestone', label: 'Milestone', eventTypes: ['alert.milestone'], source: 'Derived from durable per-type webhook counters you configure' },
]

export const ALERT_KIND_IDS = ALERT_KINDS.map((kind) => kind.id)

export interface AlertAudio {
  enabled: boolean
  /** Data URL of the uploaded cue. Empty means no cue, which the runtime reports rather than fakes. */
  src: string
  name: string
  /** 0..1, applied on top of the global alert volume. */
  volume: number
}

export type AlertLayout = 'stack' | 'split' | 'banner'
export type AlertOrnament = 'none' | 'rule' | 'corners' | 'double'
export type AlertEnter = 'fade' | 'slide' | 'scale' | 'pop' | 'ornamental'
export type AlertExit = 'fade' | 'slide' | 'scale'

export interface AlertTemplate {
  enabled: boolean
  /** Supports {username} {amount} {gift} {count} {target} {metric}. */
  headline: string
  message: string
  showHeadline: boolean
  showMessage: boolean
  showAvatar: boolean
  layout: AlertLayout
  align: 'left' | 'center'
  fontId: string
  headlineSize: number
  messageSize: number
  usernameSize: number
  textColor: string
  mutedColor: string
  accentColor: string
  backgroundColor: string
  backgroundOpacity: number
  borderColor: string
  borderWidth: number
  radius: number
  ornament: AlertOrnament
  icon: 'none' | 'glyph' | 'image'
  imageSrc: string
  enter: AlertEnter
  exit: AlertExit
  enterDuration: number
  exitDuration: number
  holdDuration: number
  audio: AlertAudio
}

export interface MilestoneTarget {
  metric: 'followers' | 'subscribers'
  target: number
  enabled: boolean
}

export interface AlertSettings {
  version: 2
  /** Play one alert at a time. Overlap is opt-in and never the default. */
  sequential: boolean
  /** Quiet time between two alerts when sequential. */
  gapMs: number
  maxQueued: number
  overflow: 'drop-oldest' | 'drop-newest'
  /** Floor for hold duration, so a 200ms alert cannot blink past on air. */
  minDurationMs: number
  /** Ignore the same event id arriving again inside this window (webhook retries, reconnect replays). */
  dedupeWindowMs: number
  muted: boolean
  volume: number
  /** Unlocked by a real click in the editor; the runtime reports browser policy instead of pretending. */
  audioUnlockHint: boolean
  milestones: MilestoneTarget[]
  templates: Record<AlertKind, AlertTemplate>
}

/* ------------------------------------------------------------------ defaults */

const NO_AUDIO: AlertAudio = { enabled: false, src: '', name: '', volume: 0.8 }

/** One template per kind, all built from the same shape so the studio can edit any of them identically. */
function template(overrides: Partial<AlertTemplate>): AlertTemplate {
  return {
    enabled: true, headline: '', message: '', showHeadline: true, showMessage: true, showAvatar: true,
    layout: 'stack', align: 'left', fontId: 'inter', headlineSize: 26, messageSize: 18, usernameSize: 22,
    textColor: '#f6f6f4', mutedColor: '#a5a5a2', accentColor: '#e8e8e6', backgroundColor: '#101012',
    backgroundOpacity: 0.92, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, ornament: 'rule',
    icon: 'glyph', imageSrc: '', enter: 'ornamental', exit: 'fade', enterDuration: 620, exitDuration: 380,
    holdDuration: 5200, audio: { ...NO_AUDIO },
    ...overrides,
  }
}

export interface AlertPreset {
  id: string
  name: string
  description: string
  /** Appearance only: geometry and material, never a claim about data. */
  apply: (base: AlertTemplate) => AlertTemplate
}

export const ALERT_PRESETS: AlertPreset[] = [
  {
    id: 'obsidian', name: 'Obsidian', description: 'Graphite panel, hairline rule, silver type',
    apply: (base) => ({ ...base, backgroundColor: '#101012', backgroundOpacity: 0.92, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, ornament: 'rule', accentColor: '#e8e8e6', textColor: '#f6f6f4', mutedColor: '#a5a5a2', layout: 'stack' }),
  },
  {
    id: 'monolith', name: 'Monolith', description: 'Square slab, hard corner marks, high contrast',
    apply: (base) => ({ ...base, backgroundColor: '#141416', backgroundOpacity: 0.97, borderColor: '#f6f6f4', borderWidth: 2, radius: 2, ornament: 'corners', accentColor: '#f6f6f4', textColor: '#f6f6f4', mutedColor: '#c9c9c6', layout: 'banner', align: 'center' }),
  },
  {
    id: 'nocturne', name: 'Nocturne', description: 'Cocoa-bronze wash, double border, editorial split',
    apply: (base) => ({ ...base, backgroundColor: '#151210', backgroundOpacity: 0.94, borderColor: '#4a3c30', borderWidth: 2, radius: 14, ornament: 'double', accentColor: '#d8c3a5', textColor: '#f4efe8', mutedColor: '#b8a894', layout: 'split' }),
  },
  {
    id: 'aurora', name: 'Aurora', description: 'Cool slate panel, teal-silver accent, soft radius',
    apply: (base) => ({ ...base, backgroundColor: '#0f1416', backgroundOpacity: 0.9, borderColor: '#28403f', borderWidth: 1, radius: 22, ornament: 'rule', accentColor: '#bfe3dd', textColor: '#f2f7f6', mutedColor: '#9fb3b0', layout: 'stack' }),
  },
]

export function createAlertSettings(presetId = 'obsidian'): AlertSettings {
  const preset = ALERT_PRESETS.find((item) => item.id === presetId) ?? ALERT_PRESETS[0]
  const base = (overrides: Partial<AlertTemplate>) => preset.apply(template(overrides))
  return {
    version: 2,
    sequential: true,
    gapMs: 900,
    maxQueued: 12,
    overflow: 'drop-oldest',
    minDurationMs: 2500,
    dedupeWindowMs: 10 * 60_000,
    muted: false,
    volume: 0.85,
    audioUnlockHint: true,
    milestones: [{ metric: 'followers', target: 100, enabled: false }, { metric: 'subscribers', target: 25, enabled: false }],
    templates: {
      follow: base({ headline: 'دنبال‌کننده جدید', message: '{username} به ما پیوست', fontId: 'vazirmatn' }),
      subscribe: base({ headline: 'اشتراک جدید', message: '{username} مشترک شد', fontId: 'vazirmatn' }),
      resubscribe: base({ headline: 'تمدید اشتراک', message: '{username} اشتراک خود را تمدید کرد', fontId: 'vazirmatn' }),
      gift: base({ headline: 'هدیه اشتراک', message: '{username} اشتراک هدیه داد', fontId: 'vazirmatn' }),
      kicks: base({ headline: 'KICKs هدیه', message: '{username} · {amount} {gift}', fontId: 'vazirmatn' }),
      milestone: base({ headline: 'نقطه عطف', message: '{count} {metric} — با همراهی شما', fontId: 'vazirmatn', holdDuration: 6500, ornament: 'corners' }),
    },
  }
}

/* --------------------------------------------------------------- normalising */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (typeof value === 'string' && (options as readonly string[]).includes(value) ? value as T : fallback)

const LAYOUTS = ['stack', 'split', 'banner'] as const
const ORNAMENTS = ['none', 'rule', 'corners', 'double'] as const
const ENTERS = ['fade', 'slide', 'scale', 'pop', 'ornamental'] as const
const EXITS = ['fade', 'slide', 'scale'] as const
const ICONS = ['none', 'glyph', 'image'] as const
const ALIGNS = ['left', 'center'] as const

/**
 * Audio is carried as a data URL inside the overlay document, which rides in the published URL. Anything larger
 * than this budget cannot reach OBS through a snapshot, so it is rejected at upload time instead of silently
 * shipping a source that fails to load on air.
 */
export const ALERT_AUDIO_MAX_BYTES = 600 * 1024
export const ALERT_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'] as const

export function normalizeAudio(raw: unknown, fallback: AlertAudio = NO_AUDIO): AlertAudio {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    enabled: bool(value.enabled, fallback.enabled),
    src: str(value.src, fallback.src),
    name: str(value.name, fallback.name),
    volume: clamp(num(value.volume, fallback.volume), 0, 1),
  }
}

export function normalizeTemplate(raw: unknown, fallback: AlertTemplate): AlertTemplate {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    enabled: bool(value.enabled, fallback.enabled),
    headline: str(value.headline, fallback.headline),
    message: str(value.message, fallback.message),
    showHeadline: bool(value.showHeadline, fallback.showHeadline),
    showMessage: bool(value.showMessage, fallback.showMessage),
    showAvatar: bool(value.showAvatar, fallback.showAvatar),
    layout: oneOf(value.layout, LAYOUTS, fallback.layout),
    align: oneOf(value.align, ALIGNS, fallback.align),
    fontId: resolveFontId(value.fontId ?? fallback.fontId),
    headlineSize: clamp(num(value.headlineSize, fallback.headlineSize), 10, 96),
    messageSize: clamp(num(value.messageSize, fallback.messageSize), 10, 72),
    usernameSize: clamp(num(value.usernameSize, fallback.usernameSize), 10, 72),
    textColor: str(value.textColor, fallback.textColor),
    mutedColor: str(value.mutedColor, fallback.mutedColor),
    accentColor: str(value.accentColor, fallback.accentColor),
    backgroundColor: str(value.backgroundColor, fallback.backgroundColor),
    backgroundOpacity: clamp(num(value.backgroundOpacity, fallback.backgroundOpacity), 0, 1),
    borderColor: str(value.borderColor, fallback.borderColor),
    borderWidth: clamp(num(value.borderWidth, fallback.borderWidth), 0, 12),
    radius: clamp(num(value.radius, fallback.radius), 0, 96),
    ornament: oneOf(value.ornament, ORNAMENTS, fallback.ornament),
    icon: oneOf(value.icon, ICONS, fallback.icon),
    imageSrc: str(value.imageSrc, fallback.imageSrc),
    enter: oneOf(value.enter, ENTERS, fallback.enter),
    exit: oneOf(value.exit, EXITS, fallback.exit),
    enterDuration: clamp(num(value.enterDuration, fallback.enterDuration), 80, 4000),
    exitDuration: clamp(num(value.exitDuration, fallback.exitDuration), 80, 4000),
    holdDuration: clamp(num(value.holdDuration, fallback.holdDuration), 300, 60_000),
    audio: normalizeAudio(value.audio, fallback.audio),
  }
}

/** Idempotent: a legacy overlay with no alerts block, or a hand-edited one with garbage, resolves to something usable. */
export function normalizeAlertSettings(raw: unknown): AlertSettings {
  const base = createAlertSettings()
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Record<string, unknown>
  const templates = (value.templates && typeof value.templates === 'object' ? value.templates : {}) as Record<string, unknown>
  const milestones = Array.isArray(value.milestones) ? value.milestones : base.milestones
  return {
    version: 2,
    sequential: bool(value.sequential, base.sequential),
    gapMs: clamp(num(value.gapMs, base.gapMs), 0, 10_000),
    maxQueued: clamp(num(value.maxQueued, base.maxQueued), 1, 50),
    overflow: oneOf(value.overflow, ['drop-oldest', 'drop-newest'] as const, base.overflow),
    minDurationMs: clamp(num(value.minDurationMs, base.minDurationMs), 500, 15_000),
    dedupeWindowMs: clamp(num(value.dedupeWindowMs, base.dedupeWindowMs), 1000, 60 * 60_000),
    muted: bool(value.muted, base.muted),
    volume: clamp(num(value.volume, base.volume), 0, 1),
    audioUnlockHint: bool(value.audioUnlockHint, base.audioUnlockHint),
    milestones: milestones.slice(0, 6).map((item, index) => {
      const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      return {
        metric: oneOf(entry.metric, ['followers', 'subscribers'] as const, index === 0 ? 'followers' : 'subscribers'),
        target: clamp(num(entry.target, 100), 1, 1_000_000),
        enabled: bool(entry.enabled, false),
      }
    }),
    templates: Object.fromEntries(ALERT_KIND_IDS.map((kind) => [kind, normalizeTemplate(templates[kind], base.templates[kind])])) as Record<AlertKind, AlertTemplate>,
  }
}

/* ------------------------------------------------------- event → alert mapping */

export function alertKindFor(event: Pick<LiveOverlayEvent, 'type'>): AlertKind | null {
  for (const kind of ALERT_KINDS) if (kind.eventTypes.includes(event.type)) return kind.id
  return null
}

export interface AlertPayload {
  username: string
  usernameColor: string | null
  avatar: string | null
  amount: string
  gift: string
  count: string
  target: string
  metric: string
  eventType: string
}

/** Reads only fields the delivery carried. Absent means absent, never an invented name or number. */
export function alertPayload(event: LiveOverlayEvent): AlertPayload {
  const data = (event.data ?? {}) as Record<string, any>
  const person = data.follower ?? data.subscriber ?? data.gifter ?? data.sender ?? null
  const giftees = Array.isArray(data.giftees) ? data.giftees.length : 0
  const metric = typeof data.metric === 'string' ? data.metric : ''
  return {
    username: typeof person?.username === 'string' ? person.username : '',
    usernameColor: typeof person?.usernameColor === 'string' ? person.usernameColor : null,
    avatar: typeof person?.avatar === 'string' ? person.avatar : null,
    amount: data.gift?.amount != null ? String(data.gift.amount) : '',
    gift: typeof data.gift?.name === 'string' ? data.gift.name : '',
    count: data.count != null ? String(data.count) : '',
    target: data.target != null ? String(data.target) : '',
    metric: metric === 'followers' ? 'دنبال‌کننده' : metric === 'subscribers' ? 'مشترک' : metric,
    eventType: event.type,
  }
}

const TOKEN = /\{(username|amount|gift|count|target|metric)\}/g

/** Replaces known tokens and leaves anything else alone, so a typo shows on screen instead of vanishing. */
export function fillTemplate(template: string, payload: AlertPayload): string {
  return template.replace(TOKEN, (_match, key: keyof AlertPayload) => {
    const value = payload[key]
    return typeof value === 'string' ? value : ''
  }).replace(/\s{2,}/g, ' ').trim()
}

export interface AlertCopy { headline: string; message: string; username: string; hasUsername: boolean }

export function renderAlertCopy(settings: AlertSettings, event: LiveOverlayEvent): AlertCopy {
  const kind = alertKindFor(event)
  const template = kind ? settings.templates[kind] : settings.templates.follow
  const payload = alertPayload(event)
  const headline = fillTemplate(template.headline, payload)
  const message = fillTemplate(template.message, payload)
  // With {username} in the message the name is already on screen; otherwise it gets its own line.
  const inlineName = /\{username\}/.test(template.message)
  return { headline, message, username: payload.username, hasUsername: Boolean(payload.username) && !inlineName }
}

/* ------------------------------------------------------------------- previews */

/**
 * Test-mode copy. It is generated client-side from the template and never stored, so a test can never appear in
 * the production event table or in a counter.
 */
export const TEST_ALERT_SAMPLES: Record<AlertKind, AlertPayload> = {
  follow: { username: 'Nova', usernameColor: null, avatar: null, amount: '', gift: '', count: '', target: '', metric: '', eventType: 'channel.followed' },
  subscribe: { username: 'Kage', usernameColor: null, avatar: null, amount: '', gift: '', count: '', target: '', metric: '', eventType: 'channel.subscription.new' },
  resubscribe: { username: 'Aria', usernameColor: null, avatar: null, amount: '', gift: '', count: '', target: '', metric: '', eventType: 'channel.subscription.renewal' },
  gift: { username: 'Rostam', usernameColor: null, avatar: null, amount: '', gift: '', count: '', target: '', metric: '', eventType: 'channel.subscription.gifts' },
  kicks: { username: 'Sahar', usernameColor: null, avatar: null, amount: '25', gift: 'KICKs', count: '', target: '', metric: '', eventType: 'kicks.gifted' },
  milestone: { username: '', usernameColor: null, avatar: null, amount: '', gift: '', count: '100', target: '100', metric: 'دنبال‌کننده', eventType: 'alert.milestone' },
}

export function testAlertEvent(kind: AlertKind, overrides: Partial<AlertPayload> = {}, id?: string): LiveOverlayEvent {
  const payload = { ...TEST_ALERT_SAMPLES[kind], ...overrides }
  return {
    id: id ?? `test_${kind}_${Date.now().toString(36)}`,
    type: payload.eventType,
    receivedAt: new Date().toISOString(),
    test: true,
    data: {
      ...(kind === 'follow' ? { follower: { username: payload.username, avatar: payload.avatar } } : {}),
      ...(kind === 'subscribe' || kind === 'resubscribe' ? { subscriber: { username: payload.username, avatar: payload.avatar } } : {}),
      ...(kind === 'gift' ? { gifter: { username: payload.username, avatar: payload.avatar }, giftees: [] } : {}),
      ...(kind === 'kicks' ? { sender: { username: payload.username, avatar: payload.avatar }, gift: { amount: payload.amount || '1', name: payload.gift || 'KICKs' } } : {}),
      ...(kind === 'milestone' ? { metric: 'followers', count: Number(payload.count || 100), target: Number(payload.target || 100) } : {}),
    },
  } as LiveOverlayEvent
}

/** The kinds a settings block actually enables, in the order the studio lists them. */
export function enabledKinds(settings: AlertSettings): AlertKind[] {
  return ALERT_KIND_IDS.filter((kind) => settings.templates[kind].enabled)
}
