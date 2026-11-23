import { memo, useEffect, useRef } from 'react'
import type { OverlayBackground } from '../types'
import { createMotionBackground } from '../motion/engine'
import type { MotionBackgroundHandle, QualityTier } from '../motion/types'
import { motionConfigFor, resolveKind } from '../lib/backgrounds'

interface MotionBackgroundProps {
  background: OverlayBackground
  /** True in the OBS runtime when the OS asks for reduced motion; the editor keeps motion so an author can judge it. */
  reducedMotion?: boolean
  interactive?: boolean
  quality?: QualityTier | 'auto'
  /** Handed the engine on mount and null on unmount, for the gallery's HUD and programmatic snapshots. */
  onEngine?: (handle: MotionBackgroundHandle | null) => void
}

/**
 * Thin React wrapper around the framework-agnostic engine. It owns nothing but the mount/unmount lifecycle: the
 * document's colours, speed, preset and variant params are pushed through `update`, which never rebuilds the renderer.
 */
export const MotionBackground = memo(function MotionBackground({ background, reducedMotion = false, interactive = true, quality = 'auto', onEngine }: MotionBackgroundProps) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<MotionBackgroundHandle | null>(null)
  const variant = resolveKind(background.kind)
  const config = motionConfigFor(background)
  const configKey = JSON.stringify(config)
  const paused = background.paused
  const latest = useRef({ variant, config, paused })
  latest.current = { variant, config, paused }

  useEffect(() => {
    const element = host.current
    if (!element) return
    const handle = createMotionBackground(element, {
      variant: latest.current.variant,
      config: latest.current.config,
      reducedMotion,
      paused: latest.current.paused,
      interactive,
      quality,
    })
    engine.current = handle
    onEngine?.(handle)
    return () => {
      onEngine?.(null)
      handle.destroy()
      engine.current = null
    }
    // onEngine is a ref-like callback; re-creating the engine when its identity changes would restart the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // A reduced-motion change is the one event worth a new engine: the loop itself is what must stop.
  }, [reducedMotion, interactive])

  useEffect(() => {
    void engine.current?.setVariant(variant, 240)
  }, [variant])

  useEffect(() => {
    engine.current?.update(config)
    // The key is the serialised config: an equivalent document must not repaint the poster every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  useEffect(() => {
    if (paused) engine.current?.pause()
    else engine.current?.play()
  }, [paused])

  return <div ref={host} className="motion-background" data-motion-host={variant} />
})
