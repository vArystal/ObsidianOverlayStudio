/**
 * CP25 alert runtime.
 *
 * Owns the queue while an overlay is on air: reads the unacknowledged tail from the backend, plays it one alert at
 * a time, acknowledges what played, and keeps a per-browser cursor so a refresh resumes instead of restarting.
 *
 * The editor mounts the same component with `preview`, which renders the stage from a local engine and never
 * touches the network, so authoring cannot create, acknowledge or consume a production alert.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertQueueEngine, acknowledgeAlerts, fetchPendingAlerts, loadAlertCursor, saveAlertCursor } from '../../lib/alertQueue'
import type { AlertFrame, AlertQueueEngine as Engine, QueueSnapshot } from '../../lib/alertQueue'
import { createAlertSettings } from '../../lib/alerts'
import type { AlertSettings } from '../../lib/alerts'
import type { LiveIntegrationConfig, LiveOverlayEvent } from '../../types'
import { AlertStage, previewAlert } from './AlertStage'

/** Headless engine binding: deterministic transitions driven by one timer, never by React renders. */
export function useAlertEngine(settings: AlertSettings) {
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new AlertQueueEngine(settings)
  const engine = engineRef.current
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(() => engine.snapshot())

  useEffect(() => {
    engine.update(settings)
    setSnapshot(engine.snapshot())
  }, [engine, settings])

  useEffect(() => engine.subscribe(() => setSnapshot(engine.snapshot())), [engine])

  useEffect(() => {
    let timer = 0
    let cancelled = false
    const run = () => {
      if (cancelled) return
      engine.tick()
      setSnapshot(engine.snapshot())
      const dueIn = engine.snapshot().dueIn
      // One timer at a time: the queue never runs two clocks, which is what makes an on-air alert clock-stable.
      timer = window.setTimeout(run, Math.max(30, Math.min(dueIn ?? 500, 2000)))
      if (dueIn === null) { window.clearTimeout(timer); timer = window.setTimeout(run, 500) }
    }
    timer = window.setTimeout(run, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [engine])

  return { engine, snapshot }
}

export interface AlertAudioStatus {
  state: 'idle' | 'played' | 'blocked' | 'missing' | 'muted' | 'error'
  /** The browser refused: this is reported, never papered over. */
  message: string
}

export interface AlertRuntimeProps {
  settings: AlertSettings
  live: LiveIntegrationConfig | null
  testMode?: boolean
  reducedMotion?: boolean
  /** Editor mounting: local engine only, no feed, no acks. */
  preview?: boolean
  /** Live events already received over the SSE stream, so the first alert does not wait for a poll. */
  incoming?: LiveOverlayEvent[]
  /** Test-mode queue injected by the studio's test buttons (never sent to the backend). */
  testQueue?: LiveOverlayEvent[]
  onAudioStatus?: (status: AlertAudioStatus) => void
}

export function AlertRuntime({ settings, live, testMode = false, reducedMotion = false, preview = false, incoming = [], testQueue = [], onAudioStatus }: AlertRuntimeProps) {
  const { engine, snapshot } = useAlertEngine(settings)
  const cursorRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playedRef = useRef('')
  const [audioStatus, setAudioStatus] = useState<AlertAudioStatus>({ state: 'idle', message: '' })
  const [audioBlocked, setAudioBlocked] = useState(false)
  const frame = snapshot.current as AlertFrame | null

  const report = useCallback((status: AlertAudioStatus) => {
    setAudioStatus(status)
    onAudioStatus?.(status)
  }, [onAudioStatus])

  // ---------------------------------------------------------------- seed + feed
  useEffect(() => { if (!preview && live?.runtimeKey) cursorRef.current = loadAlertCursor(live.runtimeKey) }, [preview, live?.runtimeKey])

  useEffect(() => {
    if (preview || testMode || !live?.runtimeKey) return
    let cancelled = false
    const pull = async () => {
      try {
        const feed = await fetchPendingAlerts(live.backendUrl, live.runtimeKey as string, cursorRef.current, 20)
        if (cancelled) return
        if (feed.alerts.length) {
          engine.push(feed.alerts.map((item) => item.event))
          const highest = Math.max(cursorRef.current, ...feed.alerts.map((item) => item.seq))
          cursorRef.current = Math.max(cursorRef.current, feed.cursor, highest)
          saveAlertCursor(live.runtimeKey as string, cursorRef.current)
        }
      } catch { /* the SSE stream remains the primary path; polling retries on its own cadence */ }
    }
    void pull()
    // Polling is the fallback, not the engine: 15s, paused while the tab is hidden, plus an immediate catch-up
    // when the source becomes visible again or the browser reconnects. One loop, never two.
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void pull() }, 15_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void pull() }
    window.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible) }
  }, [preview, testMode, live?.runtimeKey, live?.backendUrl, engine])

  // SSE arrival first, then the studio's test queue. Both are pushed through the same dedupe.
  const lastIncoming = useRef<LiveOverlayEvent[]>([])
  useEffect(() => {
    if (preview || testMode) return
    if (incoming.length === lastIncoming.current.length && incoming.every((event, index) => event.id === lastIncoming.current[index]?.id)) return
    lastIncoming.current = incoming
    engine.push(incoming)
  }, [incoming, preview, testMode, engine])

  useEffect(() => {
    if (!testMode || !testQueue.length) return
    engine.push(testQueue.map((event) => ({ ...event, test: true })))
  }, [testQueue, testMode, engine])

  // ------------------------------------------------------------------- acks
  useEffect(() => {
    if (preview || testMode || !live?.runtimeKey) return
    const ids = engine.takePendingAcks()
    if (!ids.length) return
    void acknowledgeAlerts(live.backendUrl, live.runtimeKey, ids).catch(() => engine.restoreAck(ids))
  }, [snapshot, preview, testMode, live?.runtimeKey, live?.backendUrl, engine])

  // ------------------------------------------------------------------ audio
  const unlock = useCallback(() => { setAudioBlocked(false); report({ state: 'idle', message: '' }) }, [report])
  useEffect(() => {
    if (preview) return
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [preview, unlock])

  useEffect(() => {
    const id = frame?.alert.event.id
    if (!id || id === playedRef.current) return
    const template = settings.templates[frame.alert.kind]
    if (!template.audio.enabled || !template.audio.src) { playedRef.current = id; report({ state: template.audio.enabled ? 'missing' : 'idle', message: '' }); return }
    if (settings.muted) { playedRef.current = id; report({ state: 'muted', message: '' }); return }
    playedRef.current = id
    const audio = new Audio(template.audio.src)
    audio.volume = Math.min(1, Math.max(0, settings.volume * template.audio.volume))
    audioRef.current = audio
    audio.play().then(() => report({ state: 'played', message: '' })).catch((error: unknown) => {
      const name = error instanceof Error ? error.name : 'Error'
      setAudioBlocked(true)
      // 'NotAllowedError' is the browser's autoplay policy, not a bug and not silence we can hide.
      report({ state: 'blocked', message: name === 'NotAllowedError' ? 'Browser blocked autoplay until this source is interacted with' : `Audio failed: ${name}` })
    })
    return () => { try { audio.pause() } catch { /* already stopped */ } }
  }, [frame?.alert.event.id, frame?.alert.kind, settings, report])

  // On air an empty queue is silence. In the studio it is the author's design state, so the template is shown
  // with a caption that says no event has arrived rather than a blank box.
  if (!frame) {
    if (!preview) return null
    return <AlertStage settings={settings} alert={previewAlert(settings, 'follow')} phase="hold" reducedMotion preview />
  }
  return (
    <>
      <AlertStage settings={settings} alert={frame.alert} phase={frame.phase} reducedMotion={reducedMotion} preview={preview} />
      {!preview && (audioBlocked && settings.templates[frame.alert.kind].audio.enabled) && (
        <small className="alert-audio-blocked" role="status">AUDIO BLOCKED · browser policy · {audioStatus.message}</small>
      )}
      {testMode && <small className="alert-test-mark" role="status">TEST ALERT · NOT STORED · NOT COUNTED</small>}
    </>
  )
}

/* ------------------------------------------------------------------ context */

export interface AlertSurface {
  settings: AlertSettings
  live: LiveIntegrationConfig | null
  testMode: boolean
  reducedMotion: boolean
  /** Studio test plays. Never sent to the backend, never counted. */
  testQueue: LiveOverlayEvent[]
}

const EMPTY_SURFACE: AlertSurface = {
  settings: createAlertSettings(), live: null, testMode: false, reducedMotion: false, testQueue: [],
}

const AlertContext = createContext<AlertSurface>(EMPTY_SURFACE)

/**
 * The editor canvas and the published runtime both mount this provider, so an alert element renders through one
 * code path. A surface that forgets to provide it still gets a usable default document instead of crashing.
 */
export function AlertProvider({ value, children }: { value: AlertSurface; children: React.ReactNode }) {
  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
}

export const useAlertSurface = () => useContext(AlertContext)
