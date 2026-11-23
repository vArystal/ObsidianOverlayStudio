/**
 * Shared GLSL for every fragment-shader variant. One prelude means one noise implementation, one palette, one
 * finishing pass (vignette, grain, 8-bit dither, opacity) — so the ten variants read as one family and no shader can
 * band or flash on its own.
 *
 * Written for WebGL2 / GLSL ES 3.00. No textures, no readbacks, no per-frame uploads beyond a handful of uniforms.
 */
export const VERTEX_SHADER = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID: three vertices, no buffers, no attribute state.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAGMENT_PRELUDE = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uIntensity;
uniform float uOpacity;
uniform float uGrain;
uniform float uVignette;
uniform float uSeed;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec2 uPointer;
uniform float uPointerAmp;
uniform vec4 uA;
uniform vec4 uB;

out vec4 outColor;

const float PI = 3.141592653589793;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    norm += amp;
    p *= 2.03;
    p += vec3(1.7, 9.2, 4.1);
    amp *= 0.5;
  }
  return sum / norm;
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(uColor0, uColor1, smoothstep(0.0, 0.58, t));
  return mix(c, uColor2, smoothstep(0.46, 1.0, t));
}

vec3 finish(vec3 col) {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv - 0.5;
  col *= 1.0 - smoothstep(0.32, 0.95, length(p * vec2(1.0, 0.9))) * uVignette;
  // Fine grain keeps large gradients from looking like plastic, and doubles as dither seed.
  float g = (hash12(gl_FragCoord.xy + fract(uSeed) * 91.0) - 0.5) * uGrain;
  col += g;
  // One LSB of noise per channel: the cheapest possible anti-banding pass.
  col += (hash12(gl_FragCoord.xy * 1.37 + 3.1) - 0.5) / 255.0;
  return clamp(col * uOpacity, 0.0, 1.0);
}
`

export const wrap = (body: string) => `${FRAGMENT_PRELUDE}\n${body}`
