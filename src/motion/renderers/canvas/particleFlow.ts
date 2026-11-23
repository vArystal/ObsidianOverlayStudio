import type { Frame } from '../../types'
import { clamp, createRng, curl2, parseHex } from '../../utils'

export interface CanvasPainter {
  render(frame: Frame): void
  resize(width: number, height: number): void
  dispose(): void
}

const MAX = 4000

const rgb = (hex: string): [number, number, number] => {
  const { r, g, b } = parseHex(hex)
  return [r, g, b]
}

/**
 * Curl-noise particle flow, drawn in Canvas2D.
 *
 * Trails come from fading the previous frame (destination-out) instead of storing history: one full-screen composite
 * per frame, then additive strokes. That is far cheaper than per-particle histories and gives softer trails than
 * polyline ribbons.
 */
export function createParticleFlow(ctx: CanvasRenderingContext2D): CanvasPainter {
  let width = 1
  let height = 1
  let count = 0
  let seed = -1
  const x = new Float32Array(MAX)
  const y = new Float32Array(MAX)
  const speed = new Float32Array(MAX)
  const phase = new Float32Array(MAX)

  const ensure = (wanted: number, nextSeed: number) => {
    const n = Math.min(MAX, Math.round(wanted))
    if (n === count && nextSeed === seed) return
    const rng = createRng(nextSeed || 1)
    for (let i = 0; i < n; i += 1) {
      x[i] = rng() * 2 - 1
      y[i] = rng() * 2 - 1
      speed[i] = 0.35 + rng() * 0.9
      phase[i] = rng() * Math.PI * 2
    }
    count = n
    seed = nextSeed
  }

  return {
    resize(w, h) {
      width = Math.max(1, w)
      height = Math.max(1, h)
    },
    render(frame) {
      const { params, pointer } = frame
      ensure(params.num('count'), params.seed)
      const trail = params.num('trail')
      const swirl = params.num('swirl')
      const mote = params.num('grain')
      const bright = rgb(params.hex[2])
      const muted = rgb(params.hex[1])

      const unit = Math.min(width, height)
      const fade = clamp(0.34 / Math.max(1, trail), 0.015, 0.5)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'lighter'
      const pointerX = (pointer.x * 0.5 + 0.5) * width
      const pointerY = (pointer.y * 0.5 + 0.5) * height

      // Two batched passes keep state changes out of the loop: cool motes, then the hot fifth.
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.beginPath()
        for (let i = 0; i < count; i += 1) {
          const hot = i % 5 === 0
          if (hot !== (pass === 1)) continue
          const nx = x[i] * width * 0.55
          const ny = y[i] * height * 0.55
          const sx = width * 0.5 + nx
          const sy = height * 0.5 + ny

          const flow = curl2(nx * 0.0016, ny * 0.0016, frame.time * 0.6 + phase[i] * 0.02, params.seed)
          let vx = flow.x * 0.9 * swirl * speed[i]
          let vy = flow.y * 0.9 * swirl * speed[i]

          // Pointer pushes motes away, which is what makes the field feel responsive rather than decorative.
          const dx = sx - pointerX
          const dy = sy - pointerY
          const pull = Math.exp(-(dx * dx + dy * dy) / (unit * unit * 0.02)) * pointer.strength * 1.8
          vx -= dx * pull * 0.02
          vy -= dy * pull * 0.02

          x[i] += vx * 0.018
          y[i] += vy * 0.018
          if (x[i] > 1.1) x[i] = -1.1
          else if (x[i] < -1.1) x[i] = 1.1
          if (y[i] > 1.1) y[i] = -1.1
          else if (y[i] < -1.1) y[i] = 1.1

          const ex = width * 0.5 + x[i] * width * 0.55
          const ey = height * 0.5 + y[i] * height * 0.55
          // A soft square mote: at 2–3 px a square reads as a round dot, and fillRect is far cheaper than an arc
          // path of a thousand circles. The fade pass turns consecutive positions into the trail.
          const size = Math.max(0.5, mote * (hot ? 1.9 : 1.15))
          const half = size * 0.5
          ctx.rect(ex - half, ey - half, size, size)
        }
        ctx.fillStyle = pass === 1
          ? `rgba(${bright[0]},${bright[1]},${bright[2]},0.95)`
          : `rgba(${muted[0]},${muted[1]},${muted[2]},0.62)`
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {
      count = 0
      seed = -1
    },
  }
}
