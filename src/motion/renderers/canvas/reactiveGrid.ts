import { clamp, parseHex } from '../../utils'
import type { CanvasPainter } from './particleFlow'

const rgb = (hex: string) => {
  const { r, g, b } = parseHex(hex)
  return `${r},${g},${b}`
}

/**
 * Reactive cell lattice.
 *
 * Each cell is a small spring: the pointer and a travelling ambient wave set a target offset, the spring chases it,
 * and the displacement drives both size and brightness. Cells are batched into four alpha buckets per frame, so the
 * whole lattice costs about a dozen canvas state changes rather than one per cell.
 */
export function createReactiveGrid(ctx: CanvasRenderingContext2D): CanvasPainter {
  let width = 1
  let height = 1
  let cols = 0
  let rows = 0
  let spacing = 0
  let gx = new Float32Array(0)
  let gy = new Float32Array(0)
  let ox = new Float32Array(0)
  let oy = new Float32Array(0)
  let vx = new Float32Array(0)
  let vy = new Float32Array(0)
  let lastSpacing = 0
  let lastW = 0
  let lastH = 0

  const build = (nextSpacing: number) => {
    spacing = clamp(nextSpacing, 16, 120)
    cols = Math.ceil(width / spacing) + 2
    rows = Math.ceil(height / spacing) + 2
    const total = cols * rows
    gx = new Float32Array(total)
    gy = new Float32Array(total)
    ox = new Float32Array(total)
    oy = new Float32Array(total)
    vx = new Float32Array(total)
    vy = new Float32Array(total)
    const offsetX = (width - (cols - 1) * spacing) / 2
    const offsetY = (height - (rows - 1) * spacing) / 2
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col
        gx[i] = offsetX + col * spacing
        gy[i] = offsetY + row * spacing
      }
    }
    lastSpacing = spacing
    lastW = width
    lastH = height
  }

  return {
    resize(w, h) {
      width = Math.max(1, w)
      height = Math.max(1, h)
    },
    render(frame) {
      const { params, pointer } = frame
      const wanted = params.num('spacing') * (frame.quality === 'low' ? 1.5 : 1)
      if (wanted !== lastSpacing || width !== lastW || height !== lastH || !cols) build(wanted)
      const cell = params.num('cellSize')
      const force = params.num('force')
      const wave = params.num('wave')
      const shape = params.str('shape')
      const base = rgb(params.hex[0])
      const mid = rgb(params.hex[1])
      const light = rgb(params.hex[2])
      void mid

      const pointerX = (pointer.x * 0.5 + 0.5) * width
      const pointerY = (pointer.y * 0.5 + 0.5) * height
      const t = frame.time
      const dt = clamp(frame.dt, 0.001, 0.05)
      const stiffness = 90
      const damping = Math.pow(0.0025, dt)
      const radius = spacing * 3.4
      const radius2 = radius * radius

      ctx.fillStyle = `rgb(${base})`
      ctx.fillRect(0, 0, width, height)

      // A faint lattice under the cells: without it the resting state is black dots on black, which reads as broken
      // rather than calm. It is one path for the whole grid, not a stroke per cell.
      ctx.strokeStyle = `rgba(${light},0.07)`
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let col = 0; col < cols; col += 1) {
        ctx.moveTo(gx[col], 0)
        ctx.lineTo(gx[col], height)
      }
      for (let row = 0; row < rows; row += 1) {
        const y = gy[row * cols]
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.stroke()

      ctx.globalCompositeOperation = 'lighter'
      const buckets: { path: Path2D; alpha: number }[] = [
        { path: new Path2D(), alpha: 0.34 },
        { path: new Path2D(), alpha: 0.52 },
        { path: new Path2D(), alpha: 0.74 },
        { path: new Path2D(), alpha: 1 },
      ]

      for (let i = 0; i < gx.length; i += 1) {
        const dx = gx[i] + ox[i] - pointerX
        const dy = gy[i] + oy[i] - pointerY
        const dist2 = dx * dx + dy * dy
        const influence = Math.exp(-dist2 / radius2) * pointer.strength * force
        const ambient = Math.sin(t * 1.1 - gx[i] * 0.008 + gy[i] * 0.005) * wave * 3.2
        let tx = 0
        let ty = 0
        if (influence > 0.001) {
          const dist = Math.sqrt(dist2) || 1
          tx -= (dx / dist) * influence * spacing * 0.55
          ty -= (dy / dist) * influence * spacing * 0.55
        }
        tx += ambient * 0.35
        ty += Math.cos(t * 0.9 + gy[i] * 0.007) * wave * 1.6

        vx[i] += (tx - ox[i]) * stiffness * dt
        vy[i] += (ty - oy[i]) * stiffness * dt
        vx[i] *= damping
        vy[i] *= damping
        ox[i] += vx[i] * dt
        oy[i] += vy[i] * dt

        const energy = clamp(Math.sqrt(ox[i] * ox[i] + oy[i] * oy[i]) / (spacing * 0.6), 0, 1)
        const bucket = buckets[Math.min(3, Math.floor(energy * 4))]
        const size = spacing * (0.06 + cell * 0.18) * (1 + energy * 1.1)
        const px = gx[i] + ox[i]
        const py = gy[i] + oy[i]

        if (shape === 'cross') {
          bucket.path.moveTo(px - size, py)
          bucket.path.lineTo(px + size, py)
          bucket.path.moveTo(px, py - size)
          bucket.path.lineTo(px, py + size)
        } else if (shape === 'hex') {
          for (let k = 0; k < 6; k += 1) {
            const angle = (Math.PI / 3) * k + Math.PI / 6
            const hx = px + Math.cos(angle) * size
            const hy = py + Math.sin(angle) * size
            if (k === 0) bucket.path.moveTo(hx, hy)
            else bucket.path.lineTo(hx, hy)
          }
          bucket.path.closePath()
        } else {
          bucket.path.moveTo(px + size, py)
          bucket.path.arc(px, py, size, 0, Math.PI * 2)
        }
      }

      const ink = `rgba(${light},1)`
      const glow = `rgba(${light},0.22)`
      for (const bucket of buckets) {
        ctx.fillStyle = ink
        ctx.strokeStyle = ink
        ctx.globalAlpha = bucket.alpha
        if (shape === 'cross') {
          ctx.lineWidth = Math.max(0.7, cell * 1.4)
          ctx.stroke(bucket.path)
        } else {
          ctx.fill(bucket.path)
        }
      }
      // One wide, faint pass underneath gives the lit cells a halo without a per-cell shadow blur.
      ctx.globalAlpha = 0.2
      ctx.fillStyle = glow
      ctx.fill(buckets[3].path)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {
      cols = 0
    },
  }
}
