import { memo, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { OverlayBackground } from '../types'
import { backgroundCssVars, isAnimated } from '../lib/backgrounds'

interface BackgroundLayerProps {
  background: OverlayBackground
  /** The runtime honours the OS setting; the editor keeps motion so an author can judge the effect. */
  reducedMotion?: boolean
  className?: string
}

/** Deterministic pseudo-random field so a given density always produces the same scene. */
function field(count: number, seed: number) {
  let state = seed
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: next() * 100,
    y: next() * 100,
    size: 0.4 + next() * 1.8,
    delay: -next() * 40,
    depth: next(),
  }))
}

/**
 * Scenes built from stacked gradient bands, and how many bands each one paints. Keeping the count here means a
 * scene is either fully constructed or absent, never half-rendered because a branch was forgotten.
 */
const BAND_SCENES: Partial<Record<string, number>> = {
  'aurora-flow': 3,
  'ambient-gradient': 3,
  'liquid-light': 4,
  'rose-vines': 4,
  'smoke-drift': 4,
  'storm-clouds': 3,
  'light-rays': 1,
}
const BAND_NAMES = ['band-a', 'band-b', 'band-c', 'band-d'] as const

/**
 * The single implementation behind both the editor canvas and the OBS runtime. It is a sibling of the element
 * stage children rather than a layer: no pointer events, no selection, no coordinate space of its own.
 * Everything it animates is transform or opacity, so the compositor does the work and no JavaScript runs per frame.
 */
export const BackgroundLayer = memo(function BackgroundLayer({ background, reducedMotion = false, className = '' }: BackgroundLayerProps) {
  const animated = isAnimated(background, reducedMotion)
  const motes = useMemo(() => field(Math.round(14 + background.density * 66), 20260101), [background.density])
  const stars = useMemo(() => field(Math.round(26 + background.density * 64), 77003), [background.density])
  const bokeh = useMemo(() => field(Math.round(16 + background.density * 40), 41089), [background.density])

  if (!background.enabled || background.kind === 'none') return null

  const bands = BAND_SCENES[background.kind] ?? 0

  const style = {
    ...backgroundCssVars(background),
    ...(animated ? {} : { animationPlayState: 'paused' as const }),
  } as CSSProperties

  return (
    <div
      className={`overlay-background bg-${background.kind} ${animated ? 'is-animated' : 'is-still'} ${background.blur > 0 ? 'has-blur' : ''} ${className}`}
      style={style}
      data-background={background.kind}
      aria-hidden="true"
    >
      {bands > 0 && (
        <div className="bg-field">
          {BAND_NAMES.slice(0, bands).map((name) => <span key={name} className={`bg-band ${name}`} />)}
          {background.kind === 'light-rays' && <span className="bg-band band-rays" />}
        </div>
      )}
      {background.kind === 'cinematic-particles' && (
        <div className="bg-motes">
          {motes.map((mote, index) => (
            <span
              key={index}
              className="bg-mote"
              style={{ left: `${mote.x}%`, top: `${mote.y}%`, width: mote.size * 3, height: mote.size * 3, animationDelay: `${mote.delay}s`, opacity: 0.18 + mote.depth * 0.5 }}
            />
          ))}
        </div>
      )}
      {background.kind === 'bokeh-lights' && (
        <div className="bg-bokeh">
          {/* Big soft discs, not points: the depth comes from size and opacity, which the compositor animates. */}
          {bokeh.map((light, index) => (
            <span
              key={index}
              className="bg-bokeh-dot"
              style={{
                left: `${light.x}%`,
                top: `${light.y}%`,
                width: 8 + light.size * 22,
                height: 8 + light.size * 22,
                animationDelay: `${light.delay}s`,
                animationDuration: `${(18 + light.depth * 34).toFixed(1)}s`,
                opacity: 0.16 + light.depth * 0.4,
              }}
            />
          ))}
        </div>
      )}
      {background.kind === 'neon-grid' && (
        <div className="bg-grid">
          <span className="bg-grid-floor" />
          <span className="bg-grid-lines" />
          <span className="bg-grid-glow" />
        </div>
      )}
      {background.kind === 'deep-space' && (
        <div className="bg-space">
          <div className="bg-stars near">
            {stars.slice(0, Math.ceil(stars.length / 2)).map((star, index) => (
              <span key={index} className={`bg-star ${index % 5 === 0 ? 'hero' : ''}`} style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s` }} />
            ))}
          </div>
          <div className="bg-stars far">
            {stars.slice(Math.ceil(stars.length / 2)).map((star, index) => (
              <span key={index} className={`bg-star ${index % 5 === 0 ? 'hero' : ''}`} style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size * 0.7, height: star.size * 0.7, animationDelay: `${star.delay}s` }} />
            ))}
          </div>
          <span className="bg-nebula" />
        </div>
      )}
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
