import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { OverlayElement } from '../types'
import { effectsStyle, motionClipSpan, motionPlaybackSpan, motionStyle, sampleMotion } from '../lib/motion'

/**
 * CP27 host for keyframed motion.
 *
 * One shared requestAnimationFrame loop drives every host on the page, and each host writes straight to its DOM
 * node instead of calling setState. With twenty animated widgets that is one scheduled callback per frame rather
 * than twenty React renders per frame, which is what keeps the CP24 frame budget intact.
 */
type Subscriber = (now: number) => void

const subscribers = new Set<Subscriber>()
let frame = 0
let running = false

const pump = (now: number) => {
  for (const subscriber of subscribers) subscriber(now)
  frame = subscribers.size ? requestAnimationFrame(pump) : 0
}

function subscribe(subscriber: Subscriber) {
  subscribers.add(subscriber)
  if (!running) {
    running = true
    frame = requestAnimationFrame(pump)
  }
  return () => {
    subscribers.delete(subscriber)
    if (!subscribers.size) {
      cancelAnimationFrame(frame)
      frame = 0
      running = false
    }
  }
}

/** Pauses the loop while the page is hidden so a backgrounded OBS tab cannot burn CPU. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!subscribers.size) return
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
    } else if (!frame) {
      frame = requestAnimationFrame(pump)
    }
  })
}

export const motionSubscriberCount = () => subscribers.size

/* The studio scrubs the timeline through the same sampler the runtime uses, so a preview cannot drift. */
let previewTime: number | null = null
const previewListeners = new Set<(time: number | null) => void>()
export function setMotionPreviewTime(time: number | null) {
  previewTime = time
  for (const listener of previewListeners) listener(time)
}
export function getMotionPreviewTime() { return previewTime }
function subscribeMotionPreview(listener: (time: number | null) => void) {
  previewListeners.add(listener)
  return () => { previewListeners.delete(listener) }
}

interface MotionHostProps {
  element: OverlayElement
  reducedMotion?: boolean
  /** Timeline scrubbing: a fixed local time to sample instead of the live clock. */
  timeOverride?: number | null
  /** Bumped to restart clips, for the studio's play button. */
  restartKey?: number
  children: ReactNode
}

export function MotionHost({ element, reducedMotion = false, timeOverride = null, restartKey = 0, children }: MotionHostProps) {
  const ref = useRef<HTMLDivElement>(null)
  const motion = element.motion
  // The still frame is the last frame of the last clip (one cycle of a loop); the playback span is what the loop
  // actually runs for, and it is infinite as soon as one clip repeats forever.
  const span = useMemo(() => motionClipSpan(motion), [motion])
  const playback = useMemo(() => motionPlaybackSpan(motion), [motion])
  const staticEffects = useMemo(() => (motion ? effectsStyle(motion.effects) : {}), [motion])

  useEffect(() => {
    const node = ref.current
    if (!node || !motion || !motion.clips.length) return
    const apply = (timeMs: number) => {
      const frameValue = sampleMotion(motion, timeMs, { reducedMotion })
      const style = motionStyle(frameValue)
      node.style.transform = String(style.transform ?? '')
      node.style.opacity = style.opacity === undefined ? '' : String(style.opacity)
      const blur = String(style.filter ?? '')
      node.style.filter = blur || ''
    }
    // Reduced motion renders the element at rest. The sampler drops every clip in that mode, so this writes the
    // element's own styles back rather than a paused keyframe the author never chose.
    const applyStill = () => apply(Math.max(0, span - 1))

    let started = performance.now()
    let unsubscribeLoop: (() => void) | null = null
    /**
     * A finite host unsubscribes the moment its clips are exhausted, so a static overlay schedules no work at all.
     * A looping host never reaches that point: it keeps sampling the periodic clip instead of freezing after one
     * cycle, which is what the old `elapsed > span + 60` check did to every loop preset.
     */
    const tick: Subscriber = (now) => {
      const elapsed = now - started
      if (Number.isFinite(playback) && elapsed > playback + 60) {
        apply(playback + 60)
        unsubscribeLoop?.()
        unsubscribeLoop = null
        return
      }
      apply(elapsed)
    }
    const startLoop = () => { if (!unsubscribeLoop) unsubscribeLoop = subscribe(tick) }
    const stopLoop = () => { unsubscribeLoop?.(); unsubscribeLoop = null }

    // The studio playhead wins over the live clock, and the subscription is permanent: the canvas mounts a host
    // once, so a host that only listened when it happened to mount during a scrub never moved again.
    const offPreview = subscribeMotionPreview((time) => {
      if (time === null) {
        if (reducedMotion) { applyStill(); return }
        started = performance.now()
        startLoop()
        return
      }
      stopLoop()
      apply(time)
    })

    const initial = timeOverride ?? getMotionPreviewTime()
    if (initial !== null && initial !== undefined) { apply(initial); return offPreview }
    if (reducedMotion) { applyStill(); return offPreview }
    startLoop()
    return () => { stopLoop(); offPreview() }
  }, [motion, reducedMotion, playback, span, timeOverride, restartKey])

  if (!motion) return <>{children}</>
  return (
    <div ref={ref} className="motion-host" style={{ transformOrigin: motion.origin, ...staticEffects }} data-motion-clips={motion.clips.length}>
      {children}
    </div>
  )
}
