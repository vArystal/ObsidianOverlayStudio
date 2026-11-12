/**
 * CP25 alert queue.
 *
 * Deterministic by construction: every transition is a function of the events pushed and the clock passed in, so
 * the same input produces the same order in the studio, on air and in a test. No timers live in here; the caller
 * owns scheduling, which is what makes the queue testable without fake promises.
 *
 * Production truth is the server: events live in D1, acks live in D1, and this engine only decides what to show
 * next. A reload therefore re-reads the unacknowledged tail instead of replaying everything it once saw.
 */
import type { LiveOverlayEvent } from '../types'
import { alertKindFor, normalizeAlertSettings } from './alerts'
import type { AlertKind, AlertSettings } from './alerts'

export interface QueuedAlert {
  event: LiveOverlayEvent
  kind: AlertKind
  enqueuedAt: number
}

export type AlertPhase = 'enter' | 'hold' | 'exit'

export interface AlertFrame {
  alert: QueuedAlert
  phase: AlertPhase
}

export interface QueueSnapshot {
  current: AlertFrame | null
  queued: QueuedAlert[]
  /** Milliseconds until the next transition, or null when idle. */
  dueIn: number | null
  dropped: number
  duplicates: number
}

const PHASE_AFTER_ENTER = 'enter'
const PHASE_AFTER_HOLD = 'hold'

export class AlertQueueEngine {
  private settings: AlertSettings
  private items: QueuedAlert[] = []
  private known = new Map<string, number>()
  private frame: AlertFrame | null = null
  private phaseEndsAt = 0
  private gapUntil = 0
  private pendingAck = new Set<string>()
  private droppedCount = 0
  private duplicateCount = 0
  private listeners = new Set<() => void>()

  constructor(settings?: AlertSettings) {
    this.settings = normalizeAlertSettings(settings)
  }

  /** Settings can change mid-stream (the author saves while the overlay is live). Durations are re-read live. */
  update(settings: AlertSettings) {
    this.settings = normalizeAlertSettings(settings)
    this.emit()
  }

  getSettings() { return this.settings }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit() { for (const listener of this.listeners) listener() }

  /** Accepts a batch, applies kind filters, dedupe and the overflow policy, and returns how many were queued. */
  push(events: LiveOverlayEvent[], now = Date.now()): number {
    let accepted = 0
    for (const event of events) {
      const kind = alertKindFor(event)
      if (!kind) continue
      // A disabled template means the author said "do not interrupt the stream for this", including test events.
      if (!this.settings.templates[kind].enabled) continue
      const lastSeen = this.known.get(event.id)
      if (lastSeen !== undefined && now - lastSeen < this.settings.dedupeWindowMs) { this.duplicateCount += 1; continue }
      this.known.set(event.id, now)
      // Bounded memory: the window is minutes, so anything older than an hour can be forgotten safely.
      if (this.known.size > 400) for (const [id, at] of this.known) if (now - at > 60 * 60_000) this.known.delete(id)
      const alreadyQueued = this.items.some((item) => item.event.id === event.id) || this.frame?.alert.event.id === event.id
      if (alreadyQueued) { this.duplicateCount += 1; continue }
      if (this.items.length >= this.settings.maxQueued) {
        this.droppedCount += 1
        if (this.settings.overflow === 'drop-newest') continue
        this.items.shift()
      }
      this.items.push({ event, kind, enqueuedAt: now })
      accepted += 1
    }
    if (accepted) this.emit()
    return accepted
  }

  /**
   * Advances the machine to `now`. A caller that ticks on a timer advances one phase at a time, but a page that
   * was backgrounded, throttled or resumed after a long stall must catch up rather than play a stale alert for
   * another minute. The loop is bounded so a pathological duration cannot spin.
   */
  tick(now = Date.now()): boolean {
    const before = this.frame?.alert.event.id ?? null
    const beforePhase = this.frame?.phase ?? null
    let changed = false
    for (let guard = 0; guard < 16; guard += 1) {
      if (this.frame && now >= this.phaseEndsAt) {
        if (this.frame.phase === PHASE_AFTER_ENTER) {
          this.frame = { ...this.frame, phase: PHASE_AFTER_HOLD }
          this.phaseEndsAt = now + this.durations(this.frame.alert.kind).holdDuration
        } else if (this.frame.phase === PHASE_AFTER_HOLD) {
          this.frame = { ...this.frame, phase: 'exit' }
          this.phaseEndsAt = now + this.durations(this.frame.alert.kind).exitDuration
        } else {
          // Finished: the event is only forgotten once it is acknowledged server-side, so a failed ack retries.
          this.pendingAck.add(this.frame.alert.event.id)
          this.frame = null
          this.phaseEndsAt = 0
          this.gapUntil = now + (this.settings.sequential ? this.settings.gapMs : 0)
        }
        changed = true
        continue
      }
      if (!this.frame && this.items.length && now >= this.gapUntil) {
        const next = this.items.shift() as QueuedAlert
        this.frame = { alert: next, phase: PHASE_AFTER_ENTER }
        this.phaseEndsAt = now + this.durations(next.kind).enterDuration
        changed = true
        continue
      }
      break
    }

    const after = this.frame?.alert.event.id ?? null
    const afterPhase = this.frame?.phase ?? null
    if (changed || before !== after || beforePhase !== afterPhase) this.emit()
    return changed || before !== after || beforePhase !== afterPhase
  }

  private durations(kind: AlertKind) {
    const template = this.settings.templates[kind]
    const hold = Math.max(this.settings.minDurationMs, template.holdDuration)
    // Not sequential means "do not wait for the gap"; the alert itself still has a full lifespan.
    return { enterDuration: template.enterDuration, holdDuration: hold, exitDuration: template.exitDuration }
  }

  snapshot(now = Date.now()): QueueSnapshot {
    const dueIn = this.frame ? Math.max(0, this.phaseEndsAt - now) : this.items.length ? Math.max(0, this.gapUntil - now) : null
    return { current: this.frame, queued: [...this.items], dueIn, dropped: this.droppedCount, duplicates: this.duplicateCount }
  }

  /** Ids finished but not yet acknowledged. The caller posts these and clears them on success. */
  takePendingAcks(): string[] {
    const ids = [...this.pendingAck]
    this.pendingAck.clear()
    return ids
  }

  /** Re-queues an id whose acknowledgement failed, so the server never drops into "unacked forever" silence. */
  restoreAck(ids: string[]) { ids.forEach((id) => this.pendingAck.add(id)) }

  /** True when this id already played in this engine instance (used to avoid a double ack loop). */
  hasPlayed(id: string) { return this.known.has(id) }

  reset() {
    this.items = []
    this.frame = null
    this.phaseEndsAt = 0
    this.gapUntil = 0
    this.emit()
  }

  /** Test-only escape hatch: clears dedupe memory so a suite can re-push the same id on purpose. */
  forget(id: string) { this.known.delete(id) }
}

/* ------------------------------------------------------------- run-time cursor */

const CURSOR_KEY = (runtimeKey: string) => `obsidian-alert-cursor:${runtimeKey}`

/**
 * The cursor is how the runtime asks "what arrived while I was not watching" without re-reading the whole table.
 * It is per browser on purpose: two OBS sources on the same runtime each keep their own place in the stream.
 */
export function loadAlertCursor(runtimeKey: string): number {
  try {
    const raw = localStorage.getItem(CURSOR_KEY(runtimeKey))
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch { return 0 }
}

export function saveAlertCursor(runtimeKey: string, cursor: number) {
  try { localStorage.setItem(CURSOR_KEY(runtimeKey), String(Math.max(0, Math.floor(cursor)))) } catch { /* private mode */ }
}

export interface AlertFeedItem { seq: number; event: LiveOverlayEvent }
export interface AlertFeedResponse { alerts: AlertFeedItem[]; cursor: number; truncated?: boolean }

/** Client for the public runtime alert feed: catch-up on load, then polling as a fallback for a dead stream. */
export async function fetchPendingAlerts(backendUrl: string, runtimeKey: string, after: number, limit = 20): Promise<AlertFeedResponse> {
  const base = backendUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/api/runtime/${encodeURIComponent(runtimeKey)}/alerts?after=${after}&limit=${limit}`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`alerts ${response.status}`)
  const body = await response.json() as AlertFeedResponse
  return { alerts: Array.isArray(body.alerts) ? body.alerts : [], cursor: Number(body.cursor) || after, truncated: Boolean(body.truncated) }
}

/** Acknowledges played alerts. Failure is not fatal: the next load simply offers them again. */
export async function acknowledgeAlerts(backendUrl: string, runtimeKey: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const base = backendUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/api/runtime/${encodeURIComponent(runtimeKey)}/alerts/ack`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
  })
  if (!response.ok) throw new Error(`ack ${response.status}`)
  const body = await response.json() as { acked?: number }
  return Number(body.acked) || 0
}
