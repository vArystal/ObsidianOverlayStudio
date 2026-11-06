import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { OverlayElement } from '../types'
import { effectsStyle, motionSpan, motionStyle, sampleMotion } from '../lib/motion'

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
  const span = useMemo(() => motionSpan(motion), [motion])
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
    // The studio playhead wins over the live clock, so what the author scrubs is exactly what samples later.
    const scrubTime = timeOverride ?? getMotionPreviewTime()
    if (scrubTime !== null && scrubTime !== undefined) {
      apply(scrubTime)
      return subscribeMotionPreview((time) => {
        if (time === null) return
        const node2 = ref.current
        if (!node2) return
        const style = motionStyle(sampleMotion(motion, time, { reducedMotion }))
        node2.style.transform = String(style.transform ?? '')
        node2.style.opacity = style.opacity === undefined ? '' : String(style.opacity)
        node2.style.filter = String(style.filter ?? '')
      })
    }
    const started = performance.now()
    if (reducedMotion) {
      apply(span + 1)
      return
    }
    // The host unsubscribes itself the moment its clips are exhausted, so a static overlay schedules no work at all.
    const tick: Subscriber = (now) => {
      const elapsed = now - started
      if (elapsed > span + 60) {
        apply(span + 60)
        unsubscribe()
        return
      }
      apply(elapsed)
    }
    const unsubscribe = subscribe(tick)
    return unsubscribe
  }, [motion, reducedMotion, span, timeOverride, restartKey])

  if (!motion) return <>{children}</>
  return (
    <div ref={ref} className="motion-host" style={{ transformOrigin: motion.origin, ...staticEffects }} data-motion-clips={motion.clips.length}>
      {children}
    </div>
  )
}
