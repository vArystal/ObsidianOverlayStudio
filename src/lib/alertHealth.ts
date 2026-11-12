/**
 * CP37: alert feed health.
 *
 * The runtime polling loop used to swallow feed and acknowledgement failures, so a backend returning 500 looked
 * exactly like a quiet channel. This module records the last failure and notifies subscribers; the editor shows it
 * as a degraded connection and the next successful call clears it.
 */
export interface AlertHealth {
  degraded: boolean
  message: string
  at: number | null
}

let health: AlertHealth = { degraded: false, message: '', at: null }
const listeners = new Set<() => void>()

const publish = (next: AlertHealth) => {
  health = next
  for (const listener of listeners) listener()
}

export function getAlertHealth(): AlertHealth { return health }

export function subscribeAlertHealth(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Record a failure. The message keeps the HTTP status so the cause is visible instead of "something went wrong". */
export function reportAlertFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  publish({ degraded: true, message: `alerts degraded · ${message}`, at: Date.now() })
}

export function clearAlertFailure() {
  if (!health.degraded) return
  publish({ degraded: false, message: '', at: null })
}

export function resetAlertHealth() { publish({ degraded: false, message: '', at: null }) }
