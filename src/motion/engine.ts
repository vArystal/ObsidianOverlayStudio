/**
 * The engine behind every motion background.
 *
 * One RAF loop, one quality governor and one set of lifecycle guarantees serve all ten variants. The engine owns the
 * frame clock, pointer smoothing, visibility/offscreen pausing, resize and the poster that paints before the renderer
 * is even loaded. A renderer only paints; it never schedules, listens or allocates per frame.
 */
import { DEFAULT_VARIANT, VARIANT_BY_ID } from './catalog'
import { cssBackendVars, defaultConfig, normaliseMotionConfig, posterCss, resolveParams } from './config'
import { createGLRenderer, type GLRenderer } from './renderers/gl'
import { CANVAS_LOADERS, GL_LOADERS, PACKERS } from './renderers'
import type { CanvasPainter } from './renderers/canvas/particleFlow'
import type { Frame, FrameStats, MotionBackgroundHandle, MotionConfig, QualityTier, VariantId } from './types'
import { clamp } from './utils'

export interface MotionEngineOptions {
  variant?: VariantId
  config?: MotionConfig
  quality?: QualityTier | 'auto'
  reducedMotion?: boolean
  paused?: boolean
  interactive?: boolean
}

const TIER_SCALE: Record<QualityTier, number> = { low: 0.55, medium: 0.75, high: 1, ultra: 1 }

/**
 * Smallest size we will burn a GPU context on. A hidden container (a collapsed inspector, an unmounted route) reports
 * zero and must not start an animation loop; it starts when the container gains size.
 */
const MIN_SIZE = 8

export function createMotionBackground(container: HTMLElement, options: MotionEngineOptions = {}): MotionBackgroundHandle {
  let variant: VariantId = options.variant ?? DEFAULT_VARIANT
  let config = normaliseMotionConfig(options.config ?? defaultConfig(variant), variant)
  let paused = options.paused === true
  let reducedMotion = options.reducedMotion === true
  let interactive = options.interactive !== false
  const qualityOption = options.quality ?? 'auto'

  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false
  let tier: QualityTier = qualityOption === 'auto' ? (coarse ? 'medium' : 'high') : qualityOption
  let resolutionScale = TIER_SCALE[tier]

  const root = document.createElement('div')
  root.className = 'mb-root'
  root.setAttribute('aria-hidden', 'true')
  root.dataset.motionVariant = variant
  const canvas = document.createElement('canvas')
  canvas.className = 'mb-canvas'
  const veil = document.createElement('div')
  veil.className = 'mb-veil'
  root.append(canvas, veil)
  container.appendChild(root)

  let width = 0
  let height = 0
  let dpr = 1
  let gl: GLRenderer | null = null
  let painter: CanvasPainter | null = null
  let ctx2d: CanvasRenderingContext2D | null = null
  let cssLayer: HTMLDivElement | null = null
  let loadToken = 0
  let destroyed = false
  let raf = 0
  let running = false
  let onScreen = true
  let tabVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  let time = 0
  let last = 0
  let frameMs = 16.7
  let fps = 60
  let stable = 0
  let statTimer = 0

  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, targetStrength: 0 }
  let bounds: DOMRect | null = null

  const paintPoster = () => {
    root.style.backgroundImage = posterCss(config, variant)
    root.style.opacity = String(config.opacity)
    veil.style.opacity = String(0.04 + config.intensity * 0.12)
    canvas.style.filter = config.blur > 0 ? `blur(${config.blur}px)` : ''
    canvas.style.transform = config.scale !== 1 ? `scale(${config.scale})` : ''
  }

  const applyCssVars = () => {
    const def = VARIANT_BY_ID[variant]
    if (def?.backend !== 'css') return
    if (!cssLayer) {
      cssLayer = document.createElement('div')
      cssLayer.className = 'mb-orbs'
      const count = Math.round(Number(config.params['orbs'] ?? 5))
      for (let i = 0; i < count; i += 1) {
        const orb = document.createElement('span')
        orb.className = 'mb-orb'
        orb.style.setProperty('--i', String(i))
        cssLayer.appendChild(orb)
      }
      root.insertBefore(cssLayer, veil)
    }
    const vars = cssBackendVars(config, variant)
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
    root.dataset.motionReady = 'true'
  }

  const teardownSurface = () => {
    gl?.dispose()
    gl = null
    painter?.dispose()
    painter = null
    ctx2d = null
    canvas.width = 0
    canvas.height = 0
    canvas.style.display = 'none'
    if (cssLayer) {
      cssLayer.remove()
      cssLayer = null
    }
    root.dataset.motionReady = 'false'
  }

  const resize = () => {
    if (destroyed) return
    const rect = container.getBoundingClientRect()
    width = Math.max(0, Math.round(rect.width))
    height = Math.max(0, Math.round(rect.height))
    bounds = rect
    if (width < MIN_SIZE || height < MIN_SIZE) return
    dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, coarse ? 1.6 : 2)
    if (gl) gl.resize(width, height, resolutionScale, dpr)
    if (painter) {
      const w = Math.max(1, Math.round(width * resolutionScale))
      const h = Math.max(1, Math.round(height * resolutionScale))
      const ratio = dpr * resolutionScale
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx2d?.setTransform(ratio, 0, 0, ratio, 0, 0)
      painter.resize(width, height)
      void w
      void h
    }
  }

  const buildSurface = async (token: number) => {
    const def = VARIANT_BY_ID[variant]
    if (!def || token !== loadToken || destroyed) return
    root.dataset.motionBackend = def.backend
    paintPoster()

    if (def.backend === 'css') {
      applyCssVars()
      return
    }

    // Nothing is worth a GPU context until the layer actually has pixels.
    if (width < MIN_SIZE || height < MIN_SIZE) return
    canvas.style.display = 'block'
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    try {
      if (def.backend === 'gl') {
        const loader = GL_LOADERS[variant]
        if (!loader) return
        const module = await loader()
        if (token !== loadToken || destroyed) return
        const renderer = createGLRenderer(canvas, variant, module.fragment, PACKERS[variant as Exclude<VariantId, 'css-orbs'>])
        if (!renderer) {
          // No WebGL2 (or a rejected shader): the poster stays, and the layer is honest about it in the DOM.
          canvas.style.display = 'none'
          root.dataset.motionBackend = 'poster'
          return
        }
        gl = renderer
        gl.resize(width, height, resolutionScale, dpr)
      } else {
        const loader = CANVAS_LOADERS[variant]
        if (!loader) return
        const module = await loader()
        if (token !== loadToken || destroyed) return
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
        if (!context) {
          canvas.style.display = 'none'
          root.dataset.motionBackend = 'poster'
          return
        }
        ctx2d = context
        painter = module.default(context)
        painter.resize(width, height)
      }
      root.dataset.motionReady = 'true'
      resize()
    } catch (error) {
      console.warn('[motion] renderer failed to load', variant, error)
      canvas.style.display = 'none'
      root.dataset.motionBackend = 'poster'
    }
  }

  const frameNow = () => {
    if (destroyed) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 0.016
    last = now
    frameMs = frameMs * 0.92 + dt * 1000 * 0.08
    fps = 1000 / Math.max(1, frameMs)

    time += dt * config.speed
    const params = resolveParams(config, variant)

    // Pointer spring: one lerp per frame, no listeners doing maths.
    pointer.x += (pointer.targetX - pointer.x) * 0.12
    pointer.y += (pointer.targetY - pointer.y) * 0.12
    pointer.strength += (pointer.targetStrength - pointer.strength) * (pointer.targetStrength > pointer.strength ? 0.18 : 0.03)

    const frame: Frame = {
      time,
      dt,
      width,
      height,
      dpr,
      quality: tier,
      params,
      pointer: { x: pointer.x, y: pointer.y, strength: pointer.strength * (interactive ? 1 : 0) },
    }
    if (gl) gl.render(frame)
    else if (painter && ctx2d) {
      ctx2d.save()
      painter.render(frame)
      ctx2d.restore()
    }

    // Governor: step resolution down when frames run long, creep back up only after a long stable stretch.
    if (qualityOption === 'auto' && now - statTimer > 500) {
      statTimer = now
      if (frameMs > 24 && resolutionScale > 0.55) {
        resolutionScale = Math.max(0.55, resolutionScale - 0.12)
        tier = resolutionScale > 0.8 ? 'high' : resolutionScale > 0.65 ? 'medium' : 'low'
        stable = 0
        resize()
      } else if (frameMs < 12.5) {
        stable += 1
        if (stable > 4 && resolutionScale < 1) {
          resolutionScale = Math.min(1, resolutionScale + 0.04)
          tier = resolutionScale > 0.92 ? 'high' : 'medium'
          stable = 0
          resize()
        }
      } else {
        stable = 0
      }
    }

    raf = requestAnimationFrame(frameNow)
  }

  const schedule = () => {
    const shouldRun = !destroyed && !paused && !reducedMotion && onScreen && tabVisible && (gl !== null || painter !== null)
    if (shouldRun && !running) {
      running = true
      last = 0
      raf = requestAnimationFrame(frameNow)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  // A static frame is still a frame: reduced motion gets the real composition, not an empty rectangle.
  const renderStill = () => {
    if (reducedMotion) {
      const params = resolveParams(config, variant)
      const frame: Frame = { time: 12, dt: 0, width, height, dpr, quality: tier, params, pointer: { x: 0, y: 0, strength: 0 } }
      if (gl) gl.render(frame)
      else if (painter && ctx2d) {
        ctx2d.save()
        painter.render(frame)
        ctx2d.restore()
      }
      return true
    }
    return false
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!bounds) bounds = container.getBoundingClientRect()
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (!inside) {
      pointer.targetStrength = 0
      return
    }
    pointer.targetX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1
    pointer.targetY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1
    pointer.targetStrength = 1
  }

  const onPointerLeave = () => {
    pointer.targetStrength = 0
  }

  const onVisibility = () => {
    tabVisible = document.visibilityState !== 'hidden'
    schedule()
  }

  const onWinResize = () => resize()

  let observer: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      schedule()
    }, { rootMargin: '120px' })
    observer.observe(container)
  }

  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      const grew = rect.width >= MIN_SIZE && rect.height >= MIN_SIZE && (gl === null && painter === null && !cssLayer)
      resize()
      if (grew) {
        void buildSurface(loadToken)
      }
    })
    resizeObserver.observe(container)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerMove, { passive: true })
    window.addEventListener('resize', onWinResize)
    window.addEventListener('scroll', () => {
      bounds = null
    }, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
  }
  if (interactive) {
    root.addEventListener('pointerleave', onPointerLeave)
  }

  resize()
  paintPoster()
  void buildSurface(loadToken).then(() => {
    if (!renderStill()) schedule()
  })

  return {
    async setVariant(next, transition = 0) {
      if (next === variant || destroyed) return
      teardownSurface()
      variant = next
      config = normaliseMotionConfig({ ...config, params: {} }, next)
      root.dataset.motionVariant = next
      loadToken += 1
      const token = loadToken
      if (transition > 0) {
        root.style.transition = `opacity ${transition}ms ease`
        root.style.opacity = '0'
        await new Promise((resolve) => setTimeout(resolve, transition))
      }
      await buildSurface(token)
      root.style.opacity = String(config.opacity)
      if (!renderStill()) schedule()
    },
    update(patch) {
      if (destroyed) return
      config = normaliseMotionConfig({ ...config, ...patch }, variant)
      paintPoster()
      applyCssVars()
      if (reducedMotion) renderStill()
    },
    play() {
      paused = false
      schedule()
    },
    pause() {
      paused = true
      schedule()
    },
    resize,
    snapshot() {
      if (destroyed || canvas.style.display === 'none') return null
      const frame: Frame = {
        time, dt: 0, width, height, dpr, quality: tier,
        params: resolveParams(config, variant),
        pointer: { x: pointer.x, y: pointer.y, strength: pointer.strength },
      }
      if (gl) gl.render(frame)
      else if (painter && ctx2d) painter.render(frame)
      try {
        return canvas.toDataURL('image/webp', 0.9)
      } catch {
        return null
      }
    },
    destroy() {
      destroyed = true
      running = false
      cancelAnimationFrame(raf)
      observer?.disconnect()
      resizeObserver?.disconnect()
      teardownSurface()
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerdown', onPointerMove)
        window.removeEventListener('resize', onWinResize)
        document.removeEventListener('visibilitychange', onVisibility)
      }
      root.remove()
    },
    stats(): FrameStats {
      return {
        fps,
        frameMs,
        scale: resolutionScale,
        quality: tier,
        tier: gl ? 'gl' : painter ? '2d' : cssLayer ? 'css' : 'poster',
      }
    },
  }
}
