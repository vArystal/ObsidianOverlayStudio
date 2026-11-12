/**
 * CP24 shared widget renderers.
 *
 * ElementRenderer calls `renderKickWidget()` for both the editor canvas and the published OBS runtime, so the two
 * surfaces cannot disagree about markup, typography, states or dimensions. Nothing here invents data: every value
 * comes from the LiveDataProvider snapshot, and every absence is rendered as a named state.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { CommunityPerson, OverlayElement, WidgetActivity } from '../../types'
import { useLiveData } from '../LiveDataProvider'
import { fontStack } from '../../lib/typography'
import {
  PHASE_TEXT, connectionPhase, dataPhase, fieldPhase, formatClock, formatCount, formatDuration, widgetSnapshot,
} from '../../lib/widgetData'
import type { WidgetPhase, WidgetSnapshot } from '../../lib/widgetData'
import { useNow } from './now'

const str = (element: OverlayElement, key: string, fallback = '') => String(element.props[key] ?? fallback)
const num = (element: OverlayElement, key: string, fallback = 0) => Number(element.props[key] ?? fallback)
const bool = (element: OverlayElement, key: string, fallback = false) => Boolean(element.props[key] ?? fallback)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function withAlpha(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return 'transparent'
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

const timeOf = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** The panel chrome every widget shares. Colours come from props, so a widget never needs its own stylesheet. */
function Shell({ element, children, className = '' }: { element: OverlayElement; children: ReactNode; className?: string }) {
  const style: CSSProperties = {
    color: str(element, 'color', '#f6f6f4'),
    background: withAlpha(str(element, 'backgroundColor', '#121214'), num(element, 'backgroundOpacity', 0.72)),
    border: num(element, 'borderWidth', 1) > 0 ? `${num(element, 'borderWidth', 1)}px solid ${withAlpha(str(element, 'borderColor', '#2a2a2e'), num(element, 'borderOpacity', 1))}` : 'none',
    borderRadius: Math.max(0, num(element, 'radius', 16)),
    boxShadow: bool(element, 'shadow', true) ? '0 18px 40px rgba(0, 0, 0, .38)' : undefined,
    fontFamily: fontStack(str(element, 'fontFamily', 'inter')),
    fontSize: Math.max(8, num(element, 'fontSize', 22)),
    fontWeight: num(element, 'fontWeight', 600),
    padding: `${Math.max(0, num(element, 'padding', 18))}px ${Math.max(0, num(element, 'padding', 18)) + 4}px`,
    textAlign: (str(element, 'textAlign', 'left') as CSSProperties['textAlign']),
  }
  return <div className={`widget-shell ${className}`.trim()} style={style}>{children}</div>
}

const Kicker = ({ element }: { element: OverlayElement }) => (
  str(element, 'label') ? <small className="widget-kicker">{str(element, 'label')}</small> : null
)

/** One named state line. `data-phase` is the contract the state tests read. */
function StateLine({ phase, text }: { phase: WidgetPhase; text: string }) {
  return <span className={`widget-state widget-state-${phase}`} data-phase={phase}>{text}</span>
}

function useSnapshot(): { snapshot: WidgetSnapshot; live: ReturnType<typeof useLiveData> } {
  const live = useLiveData()
  return { snapshot: widgetSnapshot(live), live }
}

/* ------------------------------------------------------------------ stream */

function StreamTitleWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const phase = fieldPhase(live, snapshot.stream.title)
  return (
    <Shell element={element} className="widget-stream-title">
      {bool(element, 'showLabel', true) && <Kicker element={element} />}
      {phase === 'live'
        ? <strong className="widget-headline" style={{ display: '-webkit-box', WebkitLineClamp: Math.max(1, num(element, 'maxLines', 2)), WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{snapshot.stream.title}</strong>
        : <StateLine phase={phase} text={phase === 'unavailable' ? str(element, 'fallback', 'Stream title not reported') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

function LiveStatusWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const phase = connectionPhase(live)
  const isLive = snapshot.stream.isLive
  const label = phase !== 'live' ? PHASE_TEXT[phase]
    : isLive === true ? str(element, 'liveText', 'LIVE')
      : isLive === false ? str(element, 'offlineText', 'OFFLINE')
        : str(element, 'unknownText', 'UNKNOWN')
  const color = phase !== 'live' ? str(element, 'offlineColor', '#a5a5a2')
    : isLive === true ? str(element, 'liveColor', '#f6f6f4')
      : str(element, 'offlineColor', '#a5a5a2')
  return (
    <Shell element={element} className="widget-live-status">
      <div className="widget-status-row">
        <i className={`widget-status-dot ${isLive === true && bool(element, 'showPulse', true) ? 'is-pulsing' : ''}`} style={{ background: color }} aria-hidden="true" />
        <strong className="widget-status-text" style={{ color }}>{label}</strong>
      </div>
      <Kicker element={element} />
    </Shell>
  )
}

function StreamCategoryWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const phase = fieldPhase(live, snapshot.stream.category)
  return (
    <Shell element={element} className="widget-stream-category">
      <Kicker element={element} />
      {phase === 'live' ? <strong className="widget-headline">{snapshot.stream.category}</strong>
        : <StateLine phase={phase} text={phase === 'unavailable' ? str(element, 'fallback', 'Category not reported') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

function StreamDurationWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const phase = connectionPhase(live)
  const startedAt = snapshot.stream.startedAt ? Date.parse(snapshot.stream.startedAt) : Number.NaN
  const running = phase === 'live' && snapshot.stream.isLive === true && Number.isFinite(startedAt)
  const now = useNow(1000, running)
  const elapsed = running ? Math.max(0, now - startedAt) : 0
  return (
    <Shell element={element} className="widget-stream-duration">
      <Kicker element={element} />
      {running ? <strong className="widget-metric">{formatDuration(elapsed, bool(element, 'showHours', true))}</strong>
        : <StateLine phase={phase === 'live' ? (snapshot.stream.isLive === false ? 'empty' : 'unavailable') : phase} text={phase !== 'live' ? PHASE_TEXT[phase] : snapshot.stream.isLive === false ? str(element, 'offlineText', 'Offline') : 'Start time not reported'} />}
    </Shell>
  )
}

function SubscriberCountWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const phase = connectionPhase(live)
  const value = snapshot.subscribers.active
  return (
    <Shell element={element} className="widget-subscriber-count">
      <Kicker element={element} />
      {phase === 'live' && typeof value === 'number'
        ? <strong className="widget-metric">{formatCount(value)}</strong>
        : <StateLine phase={phase === 'live' ? 'unavailable' : phase} text={phase === 'live' ? str(element, 'unavailableText', 'Not reported') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

/* --------------------------------------------------------------- community */

function PersonRow({ person, accent, showAvatars, showTimestamp }: { person: CommunityPerson; accent: string; showAvatars: boolean; showTimestamp: boolean }) {
  return (
    <li className="widget-row">
      {showAvatars && <span className="widget-avatar" style={{ borderColor: accent }} aria-hidden="true">{(person.username[0] ?? '?').toUpperCase()}</span>}
      <span className="widget-row-copy"><strong style={{ color: accent }}>{person.username}</strong>{person.kind && <em className="widget-row-kind">{person.kind}</em>}</span>
      {showTimestamp && <time className="widget-row-time" dateTime={person.at}>{timeOf(person.at)}</time>}
    </li>
  )
}

function RecentFollowersWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const max = clamp(num(element, 'maxItems', 5), 1, 20)
  const items = snapshot.followers.recent.slice(0, max)
  const phase = dataPhase(live, items.length > 0)
  return (
    <Shell element={element} className="widget-list">
      <Kicker element={element} />
      {phase === 'live'
        ? <ul className="widget-rows">{items.map((person) => <PersonRow key={`${person.username}-${person.at}`} person={person} accent={str(element, 'accentColor', '#f6f6f4')} showAvatars={bool(element, 'showAvatars', true)} showTimestamp={bool(element, 'showTimestamps', true)} />)}</ul>
        : <StateLine phase={phase} text={phase === 'empty' ? str(element, 'emptyText', 'No follows yet') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

function RecentSubscribersWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const max = clamp(num(element, 'maxItems', 4), 1, 20)
  const items = snapshot.subscribers.recent.slice(0, max)
  const phase = dataPhase(live, items.length > 0)
  return (
    <Shell element={element} className="widget-list">
      <Kicker element={element} />
      {phase === 'live'
        ? <ul className="widget-rows">{items.map((person) => <PersonRow key={`${person.username}-${person.at}`} person={{ ...person, kind: bool(element, 'showKinds', true) ? person.kind : undefined }} accent={str(element, 'accentColor', '#f6f6f4')} showAvatars showTimestamp={bool(element, 'showTimestamps', false)} />)}</ul>
        : <StateLine phase={phase} text={phase === 'empty' ? str(element, 'emptyText', 'No subscribers yet') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

const ACTIVITY_GLYPH: Record<WidgetActivity['kind'], string> = { chat: '◆', follow: '＋', subscription: '★', gift: '✦', other: '•' }

function ActivityFeedWidget({ element }: { element: OverlayElement }) {
  const { snapshot, live } = useSnapshot()
  const max = clamp(num(element, 'maxItems', 6), 1, 20)
  const wantChat = bool(element, 'includeChat', true)
  const wantFollows = bool(element, 'includeFollows', true)
  const wantSubs = bool(element, 'includeSubs', true)
  const items = snapshot.activities
    .filter((item) => (item.kind === 'chat' ? wantChat : item.kind === 'follow' ? wantFollows : item.kind === 'subscription' || item.kind === 'gift' ? wantSubs : false))
    .slice(0, max)
  const phase = dataPhase(live, items.length > 0)
  return (
    <Shell element={element} className="widget-list">
      <Kicker element={element} />
      {phase === 'live'
        ? <ul className="widget-rows widget-activity">{items.map((item) => (
          <li className="widget-row" key={item.id} data-kind={item.kind}>
            <span className="widget-glyph" aria-hidden="true" style={{ color: str(element, 'accentColor', '#f6f6f4') }}>{ACTIVITY_GLYPH[item.kind]}</span>
            <span className="widget-row-copy"><strong>{item.username}</strong><span className="widget-row-detail">{item.detail}</span></span>
            {bool(element, 'showTimestamps', true) && <time className="widget-row-time" dateTime={item.at}>{timeOf(item.at)}</time>}
          </li>
        ))}</ul>
        : <StateLine phase={phase} text={phase === 'empty' ? str(element, 'emptyText', 'Waiting for the first event') : PHASE_TEXT[phase]} />}
    </Shell>
  )
}

/* ------------------------------------------------------------------- local */

function ClockWidget({ element }: { element: OverlayElement }) {
  const now = useNow(1000)
  const text = formatClock(new Date(now), { hour12: bool(element, 'hour12', false), showSeconds: bool(element, 'showSeconds', true), timeZone: str(element, 'timeZone') })
  return (
    <Shell element={element} className="widget-clock">
      {bool(element, 'showLabel') && <Kicker element={element} />}
      <strong className="widget-metric">{text}</strong>
    </Shell>
  )
}

interface SocialRow { label: string; handle: string }

/** `links` is one row per line, `Label @handle` or `Label|handle`. Blank lines and bare handles are tolerated. */
export function parseSocialLinks(raw: string, prefix = '@'): SocialRow[] {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const split = line.includes('|') ? line.split('|') : line.match(/^(.*?)[\s:]+([^\s|]+)$/)?.slice(1) ?? [line]
    const label = (split[0] ?? '').trim()
    const handle = (split[1] ?? '').trim()
    if (!handle) return { label: '', handle: label.startsWith('@') ? label : `${prefix}${label}` }
    return { label, handle: handle.startsWith(prefix) || handle.includes('/') ? handle : `${prefix}${handle}` }
  })
}

function SocialLinksWidget({ element }: { element: OverlayElement }) {
  const rows = parseSocialLinks(str(element, 'links', ''), str(element, 'handlePrefix', '@'))
  return (
    <Shell element={element} className="widget-social">
      <Kicker element={element} />
      {rows.length === 0
        ? <StateLine phase="empty" text={str(element, 'emptyText', 'Add a channel and handle')} />
        : <ul className="widget-rows widget-social-rows">{rows.map((row) => (
          <li className="widget-row" key={`${row.label}-${row.handle}`}>
            {row.label && <span className="widget-row-label">{row.label}</span>}
            <strong style={{ color: str(element, 'accentColor', '#f6f6f4') }}>{row.handle}</strong>
          </li>
        ))}</ul>}
    </Shell>
  )
}

const REGISTRY: Record<string, (props: { element: OverlayElement }) => ReactNode> = {
  streamTitle: StreamTitleWidget,
  liveStatus: LiveStatusWidget,
  streamCategory: StreamCategoryWidget,
  streamDuration: StreamDurationWidget,
  subscriberCount: SubscriberCountWidget,
  recentFollowers: RecentFollowersWidget,
  recentSubscribers: RecentSubscribersWidget,
  activityFeed: ActivityFeedWidget,
  clock: ClockWidget,
  socialLinks: SocialLinksWidget,
}

/**
 * Returns the shared widget markup for a CP24 widget type, or `undefined` so ElementRenderer can fall through to
 * the long-standing element cases. Editor and runtime both call this exact function.
 */
export function renderKickWidget(element: OverlayElement): ReactNode | undefined {
  const Widget = REGISTRY[element.type]
  return Widget ? <Widget element={element} /> : undefined
}

/** Exported for tests: the widget types this module owns. */
export const KICK_WIDGET_TYPES = Object.keys(REGISTRY)

export type { WidgetPhase }
