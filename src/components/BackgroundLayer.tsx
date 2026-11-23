import { memo, useEffect, useState } from 'react'
import type { OverlayBackground } from '../types'
import { isAnimated } from '../lib/backgrounds'
import { MotionBackground } from './MotionBackground'

interface BackgroundLayerProps {
  background: OverlayBackground
  /** The runtime honours the OS setting; the editor keeps motion so an author can judge the effect. */
  reducedMotion?: boolean
  className?: string
}

/**
 * The single implementation behind both the editor canvas and the OBS runtime.
 *
 * The layer is a sibling of the element stage children, not a layer: no pointer events, no selection and no
 * coordinate space of its own. It is deliberately thin — stacking, clipping and the motion engine's host — because
 * every scene now lives in one renderer system rather than in five hand-written CSS trees.
 */
export const BackgroundLayer = memo(function BackgroundLayer({ background, reducedMotion = false, className = '' }: BackgroundLayerProps) {
  const animated = isAnimated(background, reducedMotion)
  if (!background.enabled || background.kind === 'none') return null

  return (
    <div
      className={`overlay-background bg-${background.kind} ${animated ? 'is-animated' : 'is-still'} ${className}`}
      data-background={background.kind}
      aria-hidden="true"
    >
      <MotionBackground background={background} reducedMotion={reducedMotion} />
    </div>
  )
})

/** Runtime-only: the editor keeps motion so an author can judge the effect while building. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])
  return reduced
}
