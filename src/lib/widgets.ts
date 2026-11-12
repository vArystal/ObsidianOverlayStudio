/**
 * CP24 widget registry: the single description of every widget the studio offers.
 *
 * The palette, the inspector and "reset to defaults" all read this file, so a widget cannot be listed in the
 * library but missing an inspector, or shipped without a reset. Rendering is deliberately NOT here: one renderer
 * (src/components/widgets) serves the editor canvas and the OBS runtime, and duplicating its logic per widget
 * would be the drift this checkpoint is meant to prevent.
 */
import type { ElementType } from '../types'

export type WidgetGroup = 'Stream' | 'Community' | 'Alerts' | 'Goals' | 'Content' | 'Planning'

/** Inspector sections a widget can expose. A widget lists only the groups it genuinely has settings for. */
export type WidgetControlGroup =
  | 'content' | 'typography' | 'colors' | 'surface' | 'layout' | 'data'
  | 'behavior' | 'sound' | 'countdown' | 'goal' | 'community' | 'social'

export type WidgetIcon =
  | 'text' | 'image' | 'shape' | 'container' | 'frame' | 'capture' | 'webcam' | 'chat' | 'alert' | 'goal'
  | 'counter' | 'countdown' | 'viewer' | 'followers' | 'follower' | 'supporter' | 'title' | 'status'
  | 'category' | 'duration' | 'subscribers' | 'activity' | 'clock' | 'links'

export interface WidgetDefinition {
  type: ElementType
  label: string
  blurb: string
  group: WidgetGroup
  icon: WidgetIcon
  width: number
  height: number
  controls: WidgetControlGroup[]
  /** `kick` needs a connected channel; `local` works from the overlay alone; `none` is layout chrome. */
  data: 'kick' | 'local' | 'none'
  availability: 'available' | 'requires-kick' | 'unsupported'
  /** Honest capability statement, shown in the library and in the inspector. Never promotional. */
  note?: string
  defaults: Record<string, string | number | boolean | null>
}

const KICK = 'Reads the connected Kick channel through this project’s own backend.'

export const WIDGETS: WidgetDefinition[] = [
  /* ---------------------------------------------------------------- stream */
  {
    type: 'streamTitle', label: 'Stream title', group: 'Stream', icon: 'title', width: 720, height: 130,
    blurb: 'The title Kick reports for your current or last stream', controls: ['content', 'typography', 'colors', 'surface'],
    data: 'kick', availability: 'requires-kick', note: `${KICK} Shows a "not reported" state until Kick sends a livestream event.`,
    defaults: {
      label: 'NOW STREAMING', fallback: 'Stream title not reported', color: '#f6f6f4', backgroundColor: '#121214',
      backgroundOpacity: 0.72, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, textAlign: 'left',
      maxLines: 2, fontFamily: 'inter', fontSize: 38, fontWeight: 700, showLabel: true,
    },
  },
  {
    type: 'liveStatus', label: 'Live status', group: 'Stream', icon: 'status', width: 300, height: 84,
    blurb: 'LIVE / OFFLINE / unknown, from the livestream event stream', controls: ['content', 'colors', 'surface', 'typography'],
    data: 'kick', availability: 'requires-kick', note: `${KICK} Three distinct states: live, offline, and unknown (never guessed).`,
    defaults: {
      label: 'STATUS', liveText: 'LIVE', offlineText: 'OFFLINE', unknownText: 'UNKNOWN',
      color: '#f6f6f4', liveColor: '#f6f6f4', offlineColor: '#a5a5a2', backgroundColor: '#121214', backgroundOpacity: 0.72,
      borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, showPulse: true, fontSize: 26, fontWeight: 700,
      fontFamily: 'inter',
    },
  },
  {
    type: 'streamCategory', label: 'Category / game', group: 'Stream', icon: 'category', width: 420, height: 96,
    blurb: 'The game or category Kick reports for the broadcast', controls: ['content', 'typography', 'colors', 'surface'],
    data: 'kick', availability: 'requires-kick', note: `${KICK} Comes from livestream metadata; hidden until Kick reports one.`,
    defaults: {
      label: 'CATEGORY', fallback: 'Category not reported', color: '#f6f6f4', backgroundColor: '#121214',
      backgroundOpacity: 0.72, borderColor: '#2a2a2e', borderWidth: 1, radius: 16, shadow: true, fontSize: 26, fontWeight: 600,
      fontFamily: 'inter',
    },
  },
  {
    type: 'streamDuration', label: 'Stream duration', group: 'Stream', icon: 'duration', width: 340, height: 96,
    blurb: 'Time since the broadcast started, ticking every second', controls: ['content', 'typography', 'colors', 'surface'],
    data: 'kick', availability: 'requires-kick', note: 'Counts from the real start time Kick reports. Offline shows the last known duration or a clear state.',
    defaults: {
      label: 'UPTIME', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderColor: '#2a2a2e',
      borderWidth: 1, radius: 16, shadow: true, fontSize: 30, fontWeight: 700, fontFamily: 'jetbrains-mono', showHours: true,
    },
  },
  {
    type: 'subscriberCount', label: 'Active subscribers', group: 'Community', icon: 'subscribers', width: 300, height: 104,
    blurb: 'Kick’s active subscriber count', controls: ['content', 'typography', 'colors', 'surface'],
    data: 'kick', availability: 'requires-kick', note: 'Kick reports active subscribers only. A total follower number does not exist in its public API.',
    defaults: {
      label: 'SUBSCRIBERS', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', backgroundOpacity: 0.72,
      borderColor: '#2a2a2e', borderWidth: 1, radius: 16, shadow: true, fontSize: 34, fontWeight: 700, fontFamily: 'inter',
      unavailableText: 'Not reported',
    },
  },
  /* ------------------------------------------------------------- community */
  {
    type: 'recentFollowers', label: 'Recent followers', group: 'Community', icon: 'followers', width: 420, height: 340,
    blurb: 'The last real follow events this overlay received', controls: ['content', 'typography', 'colors', 'surface', 'community'],
    data: 'kick', availability: 'requires-kick', note: 'Built from channel.followed deliveries. Empty until someone actually follows.',
    defaults: {
      label: 'NEW FOLLOWERS', maxItems: 5, color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214',
      backgroundOpacity: 0.76, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, showAvatars: true,
      emptyText: 'No follows yet', fontSize: 22, fontWeight: 600, fontFamily: 'inter', showTimestamps: true,
    },
  },
  {
    type: 'recentSubscribers', label: 'Recent subscribers', group: 'Community', icon: 'subscribers', width: 420, height: 300,
    blurb: 'New, renewed and gifted subscriptions as they arrive', controls: ['content', 'typography', 'colors', 'surface', 'community'],
    data: 'kick', availability: 'requires-kick', note: 'Built from channel.subscription.* deliveries; each row keeps its own kind.',
    defaults: {
      label: 'NEW SUBSCRIBERS', maxItems: 4, color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214',
      backgroundOpacity: 0.76, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, emptyText: 'No subscribers yet',
      fontSize: 22, fontWeight: 600, fontFamily: 'inter', showKinds: true, showTimestamps: false,
    },
  },
  {
    type: 'activityFeed', label: 'Recent activity', group: 'Community', icon: 'activity', width: 440, height: 360,
    blurb: 'Follows, subscriptions, gifts and chat in one stream', controls: ['content', 'typography', 'colors', 'surface', 'community'],
    data: 'kick', availability: 'requires-kick', note: 'Mixed feed ordered by arrival. Chat lines are included only when you switch them on.',
    defaults: {
      label: 'ACTIVITY', maxItems: 6, color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214',
      backgroundOpacity: 0.76, borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, includeChat: true,
      includeFollows: true, includeSubs: true, emptyText: 'Waiting for the first event', fontSize: 20, fontWeight: 500,
      fontFamily: 'inter', showTimestamps: true,
    },
  },
  /* ----------------------------------------------------------------- local */
  {
    type: 'clock', label: 'Clock', group: 'Content', icon: 'clock', width: 320, height: 108,
    blurb: 'Wall clock in any time zone, 12 or 24 hour', controls: ['content', 'typography', 'colors', 'surface'],
    data: 'local', availability: 'available', note: 'Runs from the viewer’s clock, so it is correct in OBS without a backend.',
    defaults: {
      label: '', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderColor: '#2a2a2e',
      borderWidth: 1, radius: 16, shadow: true, fontSize: 40, fontWeight: 700, fontFamily: 'jetbrains-mono',
      hour12: false, showSeconds: true, timeZone: '', showLabel: false,
    },
  },
  {
    type: 'socialLinks', label: 'Social links', group: 'Content', icon: 'links', width: 420, height: 150,
    blurb: 'A titled list of your channels and handles', controls: ['content', 'typography', 'colors', 'surface', 'social'],
    data: 'local', availability: 'available', note: 'Plain text, no outbound links in OBS output: a browser source cannot be clicked reliably.',
    defaults: {
      label: 'FIND ME', color: '#f6f6f4', accentColor: '#e8e8e6', backgroundColor: '#121214', backgroundOpacity: 0.76,
      borderColor: '#2a2a2e', borderWidth: 1, radius: 18, shadow: true, fontSize: 22, fontWeight: 600, fontFamily: 'inter',
      handlePrefix: '@', layout: 'list',
    },
  },
  /* ------------------------------------------------------- existing widgets */
  {
    type: 'text', label: 'Text', group: 'Content', icon: 'text', width: 600, height: 126, blurb: 'Custom copy with the full typography studio',
    controls: [], data: 'local', availability: 'available', defaults: {},
  },
  {
    type: 'image', label: 'Image / logo', group: 'Content', icon: 'image', width: 360, height: 220, blurb: 'PNG, JPEG or WebP',
    controls: [], data: 'local', availability: 'available', defaults: {},
  },
  {
    type: 'shape', label: 'Shape / border', group: 'Content', icon: 'shape', width: 420, height: 240, blurb: 'Decorative visual layer',
    controls: [], data: 'none', availability: 'available', defaults: {},
  },
  {
    type: 'container', label: 'Empty container', group: 'Content', icon: 'container', width: 560, height: 320, blurb: 'Blank box you can style',
    controls: [], data: 'none', availability: 'available', defaults: {},
  },
  {
    type: 'frame', label: 'Ornamental frame', group: 'Content', icon: 'frame', width: 720, height: 420, blurb: 'Independent border layer',
    controls: [], data: 'none', availability: 'available', defaults: {},
  },
  {
    type: 'capture', label: 'Game capture plan', group: 'Planning', icon: 'capture', width: 1280, height: 720,
    blurb: 'Layout guide for an OBS source, not a capture', controls: [], data: 'none', availability: 'available',
    note: 'A browser source cannot read another application’s window, so this is geometry to align OBS with.', defaults: {},
  },
  {
    type: 'webcam', label: 'Webcam frame', group: 'Planning', icon: 'webcam', width: 480, height: 270, blurb: 'Frame, or this browser’s camera',
    controls: [], data: 'local', availability: 'available', defaults: {},
  },
  {
    type: 'chat', label: 'Kick chat', group: 'Community', icon: 'chat', width: 460, height: 560, blurb: 'Live chat with badges and timestamps',
    controls: ['content', 'typography', 'colors', 'surface', 'community'], data: 'kick', availability: 'requires-kick',
    note: 'Real chat.message.sent deliveries only. Nothing is invented when chat is quiet.', defaults: { emptyText: 'Chat messages appear here', fontFamily: 'vazirmatn', fontSize: 20, textColor: '#f6f6f4', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 18, padding: 14, shadow: true, fontWeight: 600, textAlign: 'left', messageSpacing: 14, maxMessages: 7, messageDuration: 28, showUsernames: true, showTimestamps: false, showAvatars: true, showBadges: true, entrance: 'ornamental', exit: 'fade', scrolling: true, dataSource: 'kick', direction: 'auto' },
  },
  {
    type: 'alert', label: 'Event alert', group: 'Alerts', icon: 'alert', width: 560, height: 280, blurb: 'Queued follow and subscription alerts',
    controls: ['behavior', 'sound'], data: 'kick', availability: 'requires-kick',
    note: 'Queue is drained by event identity, so repeated and simultaneous events each play once.', defaults: {},
  },
  {
    type: 'goal', label: 'Goal progress', group: 'Goals', icon: 'goal', width: 580, height: 132, blurb: 'Manual or event-driven progress bar',
    controls: ['content', 'colors', 'goal', 'data', 'surface'], data: 'local', availability: 'available', defaults: { title: 'هدف حمایت', target: 1000, current: 0, currency: '€', trackColor: '#232326', fillColor: '#e8e8e6', textColor: '#f6f6f4', dataSource: 'preview', includePreviewOutput: false, backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'counter', label: 'Custom counter', group: 'Goals', icon: 'counter', width: 320, height: 138, blurb: 'A number you set yourself',
    controls: ['content', 'colors', 'surface'], data: 'local', availability: 'available', defaults: { label: 'پیروزی‌ها', value: 12, color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'countdown', label: 'Countdown', group: 'Content', icon: 'countdown', width: 390, height: 145, blurb: 'Counts to an absolute deadline',
    controls: ['content', 'colors', 'countdown'], data: 'local', availability: 'available', defaults: { label: 'شروع استریم تا', minutes: 10, targetAt: '', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'viewerCount', label: 'Live viewers', group: 'Stream', icon: 'viewer', width: 300, height: 104, blurb: 'Kick viewer count with honest states',
    controls: ['content', 'typography', 'colors', 'surface'], data: 'kick', availability: 'requires-kick',
    note: 'Stale, offline, unreachable and unconnected are four different states and are labelled as such.', defaults: { label: 'بیننده زنده', offlineText: 'آفلاین', unavailableText: '', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'sessionFollowers', label: 'Follows this session', group: 'Community', icon: 'followers', width: 300, height: 104,
    blurb: 'Counted client-side since this page loaded', controls: ['content', 'typography', 'colors', 'surface'], data: 'kick',
    availability: 'requires-kick', note: 'Never the backend lifetime total, which is what made this widget jump on reload.', defaults: { label: 'دنبال‌کننده این نشست', startValue: 0, color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'latestFollower', label: 'Latest follower', group: 'Community', icon: 'follower', width: 430, height: 108,
    blurb: 'The newest real follow', controls: ['content', 'typography', 'colors', 'surface'], data: 'kick', availability: 'requires-kick',
    defaults: { label: 'آخرین دنبال‌کننده', emptyText: 'منتظر رویداد واقعی Kick', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
  {
    type: 'supporter', label: 'Latest supporter', group: 'Goals', icon: 'supporter', width: 430, height: 108,
    blurb: 'Donation slot', controls: ['content', 'colors', 'surface', 'data'], data: 'none', availability: 'unsupported',
    note: 'No donation provider is connected to this project, so this widget is excluded from OBS output.', defaults: { label: 'آخرین حامی', value: 'Donation provider not connected', dataSource: 'none', color: '#f6f6f4', backgroundColor: '#121214', backgroundOpacity: 0.72, borderWidth: 1, borderColor: '#2a2a2e', borderOpacity: 1, radius: 16, padding: 18, shadow: true, fontFamily: 'inter', fontSize: 22, fontWeight: 600, textAlign: 'left' },
  },
]

export const WIDGET_GROUPS: WidgetGroup[] = ['Stream', 'Community', 'Alerts', 'Goals', 'Content', 'Planning']

const BY_TYPE = new Map<ElementType, WidgetDefinition>(WIDGETS.map((widget) => [widget.type, widget]))

export function widgetFor(type: ElementType): WidgetDefinition | undefined { return BY_TYPE.get(type) }

export function widgetLabel(type: ElementType): string { return BY_TYPE.get(type)?.label ?? String(type) }

export function isKickWidget(type: ElementType): boolean { return BY_TYPE.get(type)?.data === 'kick' }

/** Library search: matches the label, the group and the blurb, because "followers" should find recent followers. */
export function searchWidgets(query: string, list: WidgetDefinition[] = WIDGETS): WidgetDefinition[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return list
  return list.filter((widget) =>
    widget.label.toLowerCase().includes(needle)
    || widget.group.toLowerCase().includes(needle)
    || widget.blurb.toLowerCase().includes(needle)
    || widget.type.toLowerCase().includes(needle))
}

/** Default props for a new widget instance, cloned so two instances never share a bag. */
export function createWidgetProps(type: ElementType): Record<string, string | number | boolean | null> {
  return { ...(BY_TYPE.get(type)?.defaults ?? {}) }
}

/**
 * Reset restores a widget's own settings and keeps nothing bespoke. Text content is a setting here, not an
 * identity: a reset text widget shows its placeholder again, which is what "reset" promises.
 */
export function resetWidgetProps(type: ElementType): Record<string, string | number | boolean | null> {
  return createWidgetProps(type)
}

/** Human label for an availability state, used by the library badge and the inspector notice. */
export function availabilityLabel(widget: WidgetDefinition): string {
  if (widget.availability === 'unsupported') return 'Not available'
  if (widget.availability === 'requires-kick') return 'Needs Kick'
  return 'Offline-ready'
}
