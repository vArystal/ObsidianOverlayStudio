/**
 * CP24 shared clock. Twenty widgets each opening their own 1s interval is twenty timers and twenty renders per
 * second; one interval per distinct cadence, fanned out to its subscribers, is a single wake-up no matter how
 * many widgets are on the canvas. Every subscriber removes itself on unmount.
 */
type Listener = (now: number) => void

const tickers = new Map<number, { timer: ReturnType<typeof setInterval>; listeners: Set<Listener>; value: number }>()

import { useEffect, useState } from 'react'

export function subscribeNow(intervalMs: number, listener: Listener): () => void {
  let entry = tickers.get(intervalMs)
  if (!entry) {
    const value = Date.now()
    const listeners = new Set<Listener>()
    const timer = setInterval(() => {
      const current = tickers.get(intervalMs)
      if (!current) return
      current.value = Date.now()
      current.listeners.forEach((fn) => fn(current.value))
    }, intervalMs)
    // A timer must never keep a Node test process or a closed tab alive.
    if (typeof timer === 'object' && timer && 'unref' in timer) (timer as unknown as { unref: () => void }).unref()
    entry = { timer, listeners, value }
    tickers.set(intervalMs, entry)
  }
  entry.listeners.add(listener)
  listener(entry.value)
  return () => {
    const current = tickers.get(intervalMs)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      clearInterval(current.timer)
      tickers.delete(intervalMs)
    }
  }
}

/** Subscribes a component to the shared ticker, and only while `active` is true (an offline countdown must idle). */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    return subscribeNow(intervalMs, setNow)
  }, [intervalMs, active])
  return now
}
