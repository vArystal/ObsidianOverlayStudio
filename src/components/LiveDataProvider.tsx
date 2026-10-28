import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LiveChatMessage, LiveIntegrationConfig, LiveOverlayEvent, ViewerMetric } from '../types'

interface LiveDataState {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  messages: LiveChatMessage[]
  viewer: ViewerMetric
  latestFollower: { username: string; avatar?: string | null } | null
  sessionFollowerCount: number
  alerts: LiveOverlayEvent[]
  lastEventAt: string | null
  /** False when no Kick connection is attached at all, which is not the same as a failed API call. */
  configured?: boolean
  /** True only when this page was opened for a test preview; synthetic events are ignored otherwise. */
  testMode?: boolean
}

const initial: LiveDataState = { state: 'disconnected', messages: [], viewer: { status: 'unavailable', count: null, updatedAt: null }, latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null, configured: false, testMode: false }
const LiveContext = createContext<LiveDataState>(initial)
/** Exported so tests can inject a live snapshot without opening a real SSE stream. */
export const LiveDataContext = LiveContext
export type { LiveDataState }
export const useLiveData = () => useContext(LiveContext)

/**
 * `testMode` is the only door synthetic events have into this state. A live overlay must never show a
 * fabricated follower, subscription or chat line next to real ones, so by default a frame marked
 * `test` proves the stream is alive and changes nothing else.
 */
export function LiveDataProvider({ config, children, testMode = false }: { config: LiveIntegrationConfig | null; children: ReactNode; testMode?: boolean }) {
  const [data, setData] = useState(initial)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!config || !config.runtimeKey) { setData(initial); return }
    let cancelled = false
    const backend = config.backendUrl.replace(/\/$/, '')
    setData((value) => ({ ...value, state: 'connecting', configured: true }))
    const loadState = () => fetch(`${backend}/api/runtime/${encodeURIComponent(config.runtimeKey)}/state`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Runtime unavailable')))
      .then((state) => {
        if (cancelled) return
        setData((value) => ({
          ...value,
          // A successful poll says nothing about the event channel, so it must not overwrite
          // 'reconnecting' or 'error' with a softer state and hide a stream that is still down.
          state: value.state === 'disconnected' || value.state === 'connecting' ? 'connecting' : value.state,
          viewer: state.viewer ?? value.viewer,
          latestFollower: state.latestFollower ? { username: state.latestFollower.username, avatar: state.latestFollower.avatar } : null,
          // Deliberately not state.sessionFollowerCount: that is a lifetime total kept by the backend,
          // and adopting it mid-session made a widget labelled "this session" jump to an old number.
          lastEventAt: state.lastEventAt ?? value.lastEventAt,
        }))
      })
      .catch(() => !cancelled && setData((value) => ({ ...value, state: value.state === 'connected' ? 'connected' : 'error' })))
    void loadState()
    // Viewer counts and offline transitions arrive on a slow cadence; refresh so a reconnected overlay is never stale.
    const refresh = window.setInterval(() => { if (!cancelled) void loadState() }, 60_000)

    // An OBS browser source runs for hours unattended, so the stream has to repair itself twice over.
    // A transient drop is handled by EventSource's own retry, but a CLOSED stream is fatal and never
    // retries, and an idle NAT can leave a stream open that will never deliver again. Both leave a dead
    // overlay until somebody reloads the page, which on a stream means until the stream ends.
    const RETRY_STEPS = [1000, 2000, 5000, 10000, 20000, 30000]
    const STALL_AFTER_MS = 150_000
    let retry = 0
    let retryTimer = 0
    let retryPending = false
    let source: EventSource | null = null
    let lastSignalAt = Date.now()

    const signal = () => { lastSignalAt = Date.now() }

    const scheduleReconnect = () => {
      // Single flight: the watchdog ticks every 30s and the backoff ceiling is also 30s, so without this
      // guard each tick would cancel and re-arm the pending retry and recovery could be postponed forever.
      if (cancelled || retryPending) return
      retryPending = true
      const delay = RETRY_STEPS[Math.min(retry, RETRY_STEPS.length - 1)]
      retry += 1
      // Keep retrying either way; past five failures 'error' is the honest label, because the overlay
      // is not coming back on its own and the streamer should see that it is broken, not just slow.
      setData((value) => ({ ...value, state: retry > 5 ? 'error' : 'reconnecting' }))
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => { if (!cancelled) connect() }, delay)
    }

    const connect = () => {
      if (cancelled) return
      retryPending = false
      // A fresh attempt starts its own stall clock; otherwise the watchdog would judge the new, still
      // silent connection by the old one's silence and reconnect in a loop.
      lastSignalAt = Date.now()
      source?.close()
      const stream = new EventSource(`${backend}/api/runtime/${encodeURIComponent(config.runtimeKey)}/events`)
      source = stream
      stream.onopen = () => {
        if (cancelled) return
        retry = 0
        signal()
        setData((value) => ({ ...value, state: 'connected' }))
        void loadState()
      }
      stream.onerror = () => {
        if (cancelled) return
        // Both cases are "reconnecting" to the viewer, but only a CLOSED stream needs our own retry;
        // EventSource already retries the transient kind.
        setData((value) => ({ ...value, state: 'reconnecting' }))
        if (stream.readyState === EventSource.CLOSED) scheduleReconnect()
      }
      // Heartbeats are how a quiet channel stays trusted; without them the watchdog would reconnect
      // every couple of minutes during slow chat.
      stream.addEventListener('heartbeat', signal)
      stream.addEventListener('overlay-event', (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as LiveOverlayEvent
        signal()
        if (seen.current.has(event.id)) return
        seen.current.add(event.id)
        if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-250))
        // A synthetic event still proves the channel works, but it must not become data.
        if (event.test && !testMode) {
          setData((value) => (value.state === 'connected' ? value : { ...value, state: 'connected' as const }))
          return
        }
        setData((value) => {
          const next = { ...value, state: 'connected' as const, lastEventAt: event.receivedAt }
          if (event.type === 'chat.message.sent') {
            const sender = event.data.sender as Record<string, unknown>
            next.messages = [...value.messages, { id: String(event.data.messageId ?? event.id), username: String(sender?.username ?? 'Unknown'), content: String(event.data.content ?? ''), avatar: sender?.avatar ? String(sender.avatar) : null, usernameColor: sender?.usernameColor ? String(sender.usernameColor) : null, badges: Array.isArray(sender?.badges) ? sender.badges as LiveChatMessage['badges'] : [], createdAt: String(event.data.createdAt ?? event.receivedAt), test: event.test }].slice(-50)
          } else if (event.type === 'metric.viewer.updated') next.viewer = event.data as unknown as ViewerMetric
          else if (event.type === 'channel.followed') {
            const follower = event.data.follower as Record<string, unknown>
            next.latestFollower = { username: String(follower?.username ?? ''), avatar: follower?.avatar ? String(follower.avatar) : null }
            next.sessionFollowerCount = value.sessionFollowerCount + 1
            next.alerts = [...value.alerts, event].slice(-20)
          } else if (event.type.startsWith('channel.subscription.') || event.type === 'kicks.gifted') next.alerts = [...value.alerts, event].slice(-20)
          return next
        })
      } catch { /* Ignore malformed runtime frames; EventSource will continue. */ }
      })
    }
    connect()

    const watchdog = window.setInterval(() => {
      if (cancelled) return
      if (Date.now() - lastSignalAt < STALL_AFTER_MS) return
      scheduleReconnect()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(refresh)
      window.clearInterval(watchdog)
      window.clearTimeout(retryTimer)
      source?.close()
    }
  }, [config?.backendUrl, config?.runtimeKey, testMode])

  const value = useMemo(() => ({ ...data, testMode }), [data, testMode])
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
