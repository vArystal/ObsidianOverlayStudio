/**
 * CP48: every fixed string a widget can print lives here, in one language.
 *
 * Before this the registry widgets spoke English ("KICK NOT CONNECTED", "follows this session") while the legacy
 * factories spoke Persian ("بیننده زنده", "آفلاین"), so a single composition mixed both. Connection state is no
 * longer announced at all: an unconnected overlay shows the neutral placeholder and no caption, because the
 * operator already knows whether Kick is attached and the audience should never read our plumbing.
 */
export const WIDGET_COPY = {
  placeholder: '—',
  live: 'Live',
  offline: 'Offline',
  stale: 'Cached',
  unavailable: 'Unavailable',
  loading: 'Loading',
  sessionFollows: 'follows this session',
  latestFollow: 'latest follow',
  awaitingFollow: 'waiting for a follow',
  liveWhenConnected: 'live when connected',
} as const

/** States that describe our own plumbing rather than the stream; they never reach the audience. */
export const isPlumbingCaption = (caption: string) => /not connected|kick api|when connected/i.test(caption)
