/**
 * CP24 widget data layer: one normalised snapshot and one state machine for every widget.
 *
 * The rule this file enforces: a widget never invents a value. `null` means "the integration did not report
 * this", `unavailable` means "this project cannot know it", and `disconnected` means "no channel is connected".
 * Those are three different sentences a streamer needs to read correctly, so they are decided here once.
 */
import type { CommunityPerson, LiveChatMessage, LiveOverlayEvent, LiveStreamInfo, ViewerMetric, WidgetActivity } from '../types'
import type { LiveDataState } from '../components/LiveDataProvider'

export type WidgetPhase = 'live' | 'loading' | 'empty' | 'disconnected' | 'unavailable' | 'error'

export interface WidgetSnapshot {
  connection: LiveDataState['state']
  configured: boolean
  stream: { title: string | null; category: string | null; isLive: boolean | null; startedAt: string | null }
  channel: { slug: string | null; activeSubscribers: number | null }
  viewer: ViewerMetric
  followers: { session: number; latest: { username: string; avatar?: string | null } | null; recent: CommunityPerson[] }
  subscribers: { active: number | null; recent: CommunityPerson[] }
  activities: WidgetActivity[]
  chat: LiveChatMessage[]
  lastEventAt: string | null
}

const EMPTY_VIEWER: ViewerMetric = { status: 'unavailable', count: null, updatedAt: null }

export function widgetSnapshot(live: LiveDataState): WidgetSnapshot {
  const stream: LiveStreamInfo | null = live.stream ?? null
  return {
    connection: live.state,
    configured: live.configured !== false,
    stream: {
      title: stream?.title ?? null,
      category: stream?.category ?? null,
      // Kick sends is_live as a boolean; anything else is "not reported" rather than assumed false.
      isLive: typeof stream?.isLive === 'boolean' ? stream.isLive : null,
      startedAt: stream?.startedAt ?? null,
    },
    channel: { slug: live.channel?.slug ?? null, activeSubscribers: typeof live.channel?.activeSubscribers === 'number' ? live.channel.activeSubscribers : null },
    viewer: live.viewer ?? EMPTY_VIEWER,
    followers: { session: live.sessionFollowerCount ?? 0, latest: live.latestFollower ?? null, recent: live.recentFollowers ?? [] },
    subscribers: { active: typeof live.channel?.activeSubscribers === 'number' ? live.channel.activeSubscribers : null, recent: live.recentSubscribers ?? [] },
    activities: live.activities ?? [],
    chat: live.messages ?? [],
    lastEventAt: live.lastEventAt ?? null,
  }
}

/** Connection-level phase: what every Kick widget shares before it looks at its own data. */
export function connectionPhase(live: Pick<LiveDataState, 'state' | 'configured'>): WidgetPhase {
  if (live.configured === false) return 'disconnected'
  switch (live.state) {
    case 'connected': return 'live'
    case 'connecting': return 'loading'
    case 'reconnecting': return 'loading'
    case 'error': return 'error'
    default: return 'disconnected'
  }
}

/**
 * Combines the connection phase with whether this widget has data. A connected channel with no events is `empty`,
 * not `disconnected`: the fix for one is "wait", for the other "connect Kick".
 */
export function dataPhase(live: Pick<LiveDataState, 'state' | 'configured'>, hasData: boolean): WidgetPhase {
  const base = connectionPhase(live)
  if (base !== 'live') return base
  return hasData ? 'live' : 'empty'
}

export const PHASE_TEXT: Record<WidgetPhase, string> = {
  live: '',
  loading: 'Connecting…',
  empty: '',
  disconnected: 'Kick not connected',
  unavailable: 'Not reported',
  error: 'Connection problem',
}

/** Stream fields are `unavailable` when the backend could not learn them, even while the channel is connected. */
export function fieldPhase(live: Pick<LiveDataState, 'state' | 'configured'>, value: string | null): WidgetPhase {
  const base = connectionPhase(live)
  if (base !== 'live') return base
  return value && value.length > 0 ? 'live' : 'unavailable'
}

/** Two-stop duration format: `1:04:09`, `04:09`. Hours are dropped only when they are zero. */
export function formatDuration(ms: number, showHours = true): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  if (hours > 0 || showHours) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

export interface ClockOptions { hour12?: boolean; showSeconds?: boolean; timeZone?: string }

/**
 * Wall clock formatting. An invalid time zone is ignored rather than throwing, which is what would otherwise
 * blank an entire OBS source because somebody typed `Asia/Tehrn`.
 */
export function formatClock(date: Date, options: ClockOptions = {}): string {
  const { hour12 = false, showSeconds = true, timeZone } = options
  const format: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit', ...(showSeconds ? { second: '2-digit' as const } : {}), hour12,
  }
  if (timeZone) {
    try { return new Intl.DateTimeFormat(undefined, { ...format, timeZone }).format(date) } catch { /* fall through */ }
  }
  return new Intl.DateTimeFormat(undefined, format).format(date)
}

/** Counts are shown as-is; a null count is never coerced to 0. */
export function formatCount(value: number | null, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : ''
}

export function activityKind(event: LiveOverlayEvent): WidgetActivity['kind'] {
  if (event.type === 'chat.message.sent') return 'chat'
  if (event.type === 'channel.followed') return 'follow'
  if (event.type.startsWith('channel.subscription.')) return 'subscription'
  if (event.type === 'kicks.gifted') return 'gift'
  return 'other'
}

const username = (value: unknown): string => {
  const person = value as Record<string, unknown> | undefined
  const name = person?.username
  return typeof name === 'string' && name.length > 0 ? name : ''
}

/** Turns an event into one activity row without inventing a name for an anonymous gift. */
export function toActivity(event: LiveOverlayEvent): WidgetActivity {
  const data = event.data as Record<string, unknown>
  const kind = activityKind(event)
  const person = kind === 'follow' ? username(data.follower)
    : kind === 'subscription' ? username(data.subscriber) || username(data.gifter)
      : kind === 'gift' ? username(data.sender)
        : username(data.sender)
  const detail = kind === 'chat' ? String(data.content ?? '')
    : kind === 'subscription' ? (event.type.endsWith('renewal') ? 'renewed a subscription' : event.type.endsWith('gifts') ? 'gifted subscriptions' : 'subscribed')
      : kind === 'gift' ? `${String((data.gift as Record<string, unknown> | undefined)?.amount ?? '')} ${String((data.gift as Record<string, unknown> | undefined)?.name ?? '')}`.trim()
        : kind === 'follow' ? 'followed' : 'event'
  return { id: event.id, kind, username: person || 'anonymous', detail, at: event.receivedAt, test: Boolean(event.test) }
}
