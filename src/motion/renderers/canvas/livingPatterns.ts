import { clamp, createRng, mixOklab, parseHex } from '../../utils'
import type { CanvasPainter } from './particleFlow'

/** 64-entry palette, mixed in OKLab so the coral crests stay saturated instead of greying out. */
function buildLut(colors: [string, string, string]): Uint8ClampedArray {
  const [a, b, c] = colors.map((hex) => parseHex(hex))
  const lut = new Uint8ClampedArray(64 * 3)
  for (let i = 0; i < 64; i += 1) {
    const t = i / 63
    const rgb = t < 0.5 ? mixOklab(a, b, t * 2) : mixOklab(b, c, (t - 0.5) * 2)
    lut[i * 3] = rgb.r
    lut[i * 3 + 1] = rgb.g
    lut[i * 3 + 2] = rgb.b
  }
  return lut
}

const wrap = (value: number, size: number) => (value + size) % size

/**
 * Gray-Scott reaction-diffusion.
 *
 * Two chemicals (U feed, V consume) diffuse and react on a low-resolution wrapping grid. The grid is deliberately
 * small — a few tens of thousands of cells — and upscaled with smoothing, which is both the cheap way to run a
 * simulation on the CPU and the reason the result reads as a soft organic growth rather than pixel soup.
 */
export function createLivingPatterns(ctx: CanvasRenderingContext2D): CanvasPainter {
  let width = 1
  let height = 1
  let gw = 0
  let gh = 0
  let u = new Float32Array(0)
  let v = new Float32Array(0)
  let u2 = new Float32Array(0)
  let v2 = new Float32Array(0)
  let off: HTMLCanvasElement | null = null
  let offCtx: CanvasRenderingContext2D | null = null
  let image: ImageData | null = null
  let lut = new Uint8ClampedArray(192)
  let lastLut = ''
  let lastMode = ''
  let lastSeed = -1
  let lastGw = 0
  let lastGh = 0

  const seedGrid = (mode: string, seed: number) => {
    const rng = createRng(seed + mode.length * 7919)
    u.fill(1)
    v.fill(0)
    for (let i = 0; i < u.length; i += 1) u[i] = 1
    const blobs = mode === 'maze' ? 26 : mode === 'spots' ? 60 : 44
    for (let b = 0; b < blobs; b += 1) {
      const cx = Math.floor(rng() * gw)
      const cy = Math.floor(rng() * gh)
      const radius = Math.max(1, Math.floor((mode === 'mitosis' ? 1.5 : 2.5) + rng() * 3))
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue
          const x = wrap(cx + dx, gw)
          const y = wrap(cy + dy, gh)
          v[y * gw + x] = 0.8 + rng() * 0.2
          u[y * gw + x] = 0.2
        }
      }
    }
  }

  const allocate = (cols: number, rows: number) => {
    gw = cols
    gh = rows
    u = new Float32Array(gw * gh)
    v = new Float32Array(gw * gh)
    u2 = new Float32Array(gw * gh)
    v2 = new Float32Array(gw * gh)
    const doc = ctx.canvas.ownerDocument
    off = doc.createElement('canvas')
    off.width = gw
    off.height = gh
    offCtx = off.getContext('2d', { alpha: false })
    if (offCtx) image = offCtx.createImageData(gw, gh)
    lastMode = ''
    lastSeed = -1
  }

  /** One explicit Euler step of the Gray-Scott pair, nine-point Laplacian, wrapping edges. */
  const step = (feed: number, kill: number, dt: number) => {
    const du = 0.16
    const dv = 0.08
    for (let y = 0; y < gh; y += 1) {
      const up = wrap(y - 1, gh) * gw
      const down = wrap(y + 1, gh) * gw
      const row = y * gw
      for (let x = 0; x < gw; x += 1) {
        const left = wrap(x - 1, gw)
        const right = wrap(x + 1, gw)
        const i = row + x
        const uu = u[i]
        const vv = v[i]
        const lapU = (
          u[row + left] + u[row + right] + u[up + x] + u[down + x]
          + 0.5 * (u[up + left] + u[up + right] + u[down + left] + u[down + right])
          - 6 * uu
        )
        const lapV = (
          v[row + left] + v[row + right] + v[up + x] + v[down + x]
          + 0.5 * (v[up + left] + v[up + right] + v[down + left] + v[down + right])
          - 6 * vv
        )
        const reaction = uu * vv * vv
        u2[i] = clamp(uu + (du * lapU - reaction + feed * (1 - uu)) * dt, 0, 1)
        v2[i] = clamp(vv + (dv * lapV + reaction - (kill + feed) * vv) * dt, 0, 1)
      }
    }
    const swap = u
    u = u2
    u2 = swap
    const swapV = v
    v = v2
    v2 = swapV
  }

  return {
    resize(w, h) {
      width = Math.max(1, w)
      height = Math.max(1, h)
    },
    render(frame) {
      const { params, pointer } = frame
      const detail = params.num('detail')
      const aspect = width / height
      const targetGw = Math.round((120 + detail * 170) * clamp(aspect, 0.6, 2.4))
      const targetGh = Math.max(48, Math.round(targetGw / aspect))
      const cols = clamp(targetGw, 96, 420)
      const rows = clamp(targetGh, 54, 300)
      if (cols !== lastGw || rows !== lastGh) {
        allocate(cols, rows)
        lastGw = cols
        lastGh = rows
      }
      const mode = params.str('mode')
      let seeded = false
      if (mode !== lastMode || params.seed !== lastSeed) {
        seedGrid(mode, params.seed)
        lastMode = mode
        lastSeed = params.seed
        seeded = true
      }

      const feed = clamp(params.num('feed'), 0.005, 0.1)
      const kill = clamp(params.num('kill'), 0.035, 0.075)
      // A freshly seeded grid is a handful of blobs. Fast-forwarding it here means the first visible frame is the
      // settled coral, not the seed pattern slowly blooming over several seconds.
      if (seeded) for (let s = 0; s < 160; s += 1) step(feed, kill, 1)
      const steps = frame.quality === 'low' ? 1 : frame.quality === 'medium' ? 2 : frame.quality === 'ultra' ? 5 : 3
      const dt = clamp(frame.dt * 60, 0.5, 1.6)
      for (let s = 0; s < steps; s += 1) step(feed, kill, dt)

      // Paint with the pointer: a small dose of V is what makes the pattern bloom where the cursor is.
      if (pointer.strength > 0.03) {
        const cx = Math.round(((pointer.x * 0.5 + 0.5) * gw))
        const cy = Math.round(((pointer.y * 0.5 + 0.5) * gh))
        const radius = Math.max(2, Math.round(gw / 26))
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > radius * radius) continue
            const x = wrap(cx + dx, gw)
            const y = wrap(cy + dy, gh)
            v[y * gw + x] = 1
            u[y * gw + x] = 0.1
          }
        }
      }

      const lutKey = params.hex.join('')
      if (lutKey !== lastLut) {
        lut = buildLut(params.hex)
        lastLut = lutKey
      }
      if (!offCtx || !image || !off) return

      const data = image.data
      for (let y = 0; y < gh; y += 1) {
        const row = y * gw
        for (let x = 0; x < gw; x += 1) {
          const i = row + x
          // Keep the ramp broad: V sits around 0.3–0.5 in a grown colony, and multiplying it up too far turns the
          // whole pattern into flat accent blobs with no internal structure.
          const value = clamp(v[i] * 2.4, 0, 1)
          const lutIndex = Math.min(63, Math.max(0, Math.round(value * 63))) * 3
          const offset = i * 4
          data[offset] = lut[lutIndex]
          data[offset + 1] = lut[lutIndex + 1]
          data[offset + 2] = lut[lutIndex + 2]
          data[offset + 3] = 255
        }
      }
      offCtx.putImageData(image, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, width, height)
    },
    dispose() {
      off = null
      offCtx = null
      image = null
      u = v = u2 = v2 = new Float32Array(0)
    },
  }
}
