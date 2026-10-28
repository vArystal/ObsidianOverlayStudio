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
}

const initial: LiveDataState = { state: 'disconnected', messages: [], viewer: { status: 'unavailable', count: null, updatedAt: null }, latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null }
const LiveContext = createContext<LiveDataState>(initial)
export const useLiveData = () => useContext(LiveContext)

export function LiveDataProvider({ config, children }: { config: LiveIntegrationConfig | null; children: ReactNode }) {
  const [data, setData] = useState(initial)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!config || !config.runtimeKey) { setData(initial); return }
    let cancelled = false
    const backend = config.backendUrl.replace(/\/$/, '')
    setData((value) => ({ ...value, state: 'connecting' }))
    fetch(`${backend}/api/runtime/${encodeURIComponent(config.runtimeKey)}/state`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Runtime unavailable')))
      .then((state) => !cancelled && setData((value) => ({ ...value, state: 'connecting', viewer: state.viewer ?? value.viewer, latestFollower: state.latestFollower ? { username: state.latestFollower.username, avatar: state.latestFollower.avatar } : null, sessionFollowerCount: state.sessionFollowerCount ?? 0, lastEventAt: state.lastEventAt ?? null })))
      .catch(() => !cancelled && setData((value) => ({ ...value, state: 'error' })))

    const source = new EventSource(`${backend}/api/runtime/${encodeURIComponent(config.runtimeKey)}/events`)
    source.onopen = () => setData((value) => ({ ...value, state: 'connected' }))
    source.onerror = () => setData((value) => ({ ...value, state: source.readyState === EventSource.CLOSED ? 'error' : 'reconnecting' }))
    source.addEventListener('overlay-event', (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as LiveOverlayEvent
        if (seen.current.has(event.id)) return
        seen.current.add(event.id)
        if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-250))
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
    return () => { cancelled = true; source.close() }
  }, [config?.backendUrl, config?.runtimeKey])

  const value = useMemo(() => data, [data])
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
