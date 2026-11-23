/**
 * The WebGL2 backend: one program per variant, one fullscreen triangle, a handful of uniforms per frame.
 *
 * Deliberately boring: no framebuffers, no textures, no readbacks. A backdrop that misses a frame is visible; a
 * backdrop that allocates per frame eventually stutters, so this path allocates nothing after setup.
 */
import type { Frame, ResolvedParams, VariantId } from '../types'
import { VERTEX_SHADER } from './glsl'

export interface GLRenderer {
  render(frame: Frame): void
  resize(width: number, height: number, scale: number, dpr: number): void
  dispose(): void
}

export type Packer = (params: ResolvedParams) => [number[], number[]]

const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // A rejected shader must never take the overlay down: log once, fall back to the poster.
    console.warn('[motion] shader failed to compile', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function createGLRenderer(canvas: HTMLCanvasElement, variant: VariantId, fragment: string, pack: Packer): GLRenderer | null {
  const gl = canvas.getContext('webgl2', CONTEXT_OPTIONS)
  if (!gl) return null

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  // Each variant module already wraps its body with the shared prelude (`wrap`), exactly once.
  const pixel = compile(gl, gl.FRAGMENT_SHADER, fragment)
  if (!vertex || !pixel) {
    if (vertex) gl.deleteShader(vertex)
    if (pixel) gl.deleteShader(pixel)
    return null
  }
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, pixel)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(pixel)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[motion] program failed to link', variant, gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  gl.useProgram(program)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const locations = new Map<string, WebGLUniformLocation | null>()
  const loc = (name: string) => {
    if (locations.has(name)) return locations.get(name) ?? null
    const found = gl.getUniformLocation(program, name)
    locations.set(name, found)
    return found
  }

  let ready = false

  const set1 = (name: string, value: number) => {
    const at = loc(name)
    if (at) gl.uniform1f(at, value)
  }
  const setVec = (name: string, value: number[]) => {
    const at = loc(name)
    if (!at) return
    if (value.length === 2) gl.uniform2f(at, value[0], value[1])
    else if (value.length === 3) gl.uniform3f(at, value[0], value[1], value[2])
    else gl.uniform4f(at, value[0], value[1], value[2], value[3])
  }

  return {
    resize(nextWidth, nextHeight, scale, dpr) {
      const w = Math.max(1, Math.round(nextWidth * dpr * scale))
      const h = Math.max(1, Math.round(nextHeight * dpr * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      ready = true
    },
    render(frame) {
      if (!ready || gl.isContextLost()) return
      const [a, b] = pack(frame.params)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      // The shader works in device pixels, which is exactly the drawing buffer.
      setVec('uRes', [canvas.width, canvas.height])
      set1('uTime', frame.time)
      set1('uIntensity', frame.params.intensity)
      set1('uOpacity', 1)
      set1('uGrain', frame.params.grain)
      set1('uVignette', frame.params.vignette)
      set1('uSeed', frame.params.seed)
      setVec('uColor0', frame.params.colors[0])
      setVec('uColor1', frame.params.colors[1])
      setVec('uColor2', frame.params.colors[2])
      setVec('uPointer', [frame.pointer.x, -frame.pointer.y])
      set1('uPointerAmp', frame.pointer.strength * frame.params.pointer)
      setVec('uA', a)
      setVec('uB', b)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteProgram(program)
      if (vao) gl.deleteVertexArray(vao)
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    },
  }
}
