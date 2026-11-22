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
  disconnected: '—',
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

export interface CalendarCell { key: string; day: number; inMonth: boolean; isToday: boolean }

export interface CalendarMonth {
  /** Localised "November 2026". */
  title: string
  /** Seven short weekday labels, already rotated for the chosen first day. */
  weekdays: string[]
  /** Always six rows, so the widget does not resize when a month needs only five. */
  weeks: CalendarCell[][]
}

export interface CalendarOptions { weekStart?: 'monday' | 'sunday'; timeZone?: string }

const pad2 = (value: number) => String(value).padStart(2, '0')
const dayKey = (year: number, monthIndex: number, day: number) => `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`

/**
 * The calendar date in `timeZone` as plain numbers. Formatting the date first, rather than reading `getMonth()`,
 * is what keeps a widget set to another zone on the right day — and an invalid zone falls back to the viewer’s
 * zone instead of throwing, the same rule the clock follows.
 */
export function calendarDateParts(date: Date, timeZone = ''): { year: number; month: number; day: number } {
  const format = (zone?: string) => new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'numeric', day: 'numeric', ...(zone ? { timeZone: zone } : {}),
  })
  let parts: Intl.DateTimeFormatPart[]
  try { parts = format(timeZone).formatToParts(date) } catch { parts = format().formatToParts(date) }
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: pick('year'), month: pick('month') - 1, day: pick('day') }
}

/**
 * One month laid out as whole weeks. Dates are built in UTC on purpose: the grid is a calendar of day numbers, and
 * a local-midnight stride would skip or repeat a day across a DST boundary.
 */
export function buildCalendarMonth(date: Date, options: CalendarOptions = {}): CalendarMonth {
  const { weekStart = 'monday', timeZone = '' } = options
  const today = calendarDateParts(date, timeZone)
  const firstOfMonth = Date.UTC(today.year, today.month, 1)
  const offset = weekStart === 'sunday' ? new Date(firstOfMonth).getUTCDay() : (new Date(firstOfMonth).getUTCDay() + 6) % 7
  const todayKey = dayKey(today.year, today.month, today.day)
  const weeks: CalendarCell[][] = []
  for (let row = 0; row < 6; row += 1) {
    const week: CalendarCell[] = []
    for (let column = 0; column < 7; column += 1) {
      const current = new Date(firstOfMonth + (row * 7 + column - offset) * 86_400_000)
      const year = current.getUTCFullYear()
      const month = current.getUTCMonth()
      const day = current.getUTCDate()
      const key = dayKey(year, month, day)
      week.push({ key, day, inMonth: month === today.month && year === today.year, isToday: key === todayKey })
    }
    weeks.push(week)
  }
  const at = (index: number) => new Date(Date.UTC(today.year, today.month, 1 + index))
  const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' })
  // Anchor labels on a known week starting Sunday, then rotate, so every row header names the same column as its day.
  const sundayFirst = [4, 5, 6, 7, 8, 9, 10].map((day) => weekdayFormat.format(new Date(Date.UTC(2024, 0, day))))
  const weekdays = weekStart === 'sunday' ? sundayFirst : [...sundayFirst.slice(1), sundayFirst[0]]
  const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(14))
  return { title, weekdays, weeks }
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
