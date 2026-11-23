import { wrap } from '../glsl'

/**
 * Digital Print — a procedural field pushed through an ordered-dither or halftone screen. The source is evaluated at
 * cell centres, not per pixel, so the print has honest, aligned cells; the screen pattern itself is evaluated per
 * pixel. Ink count is limited on purpose (one, two or three inks) — that restriction is the aesthetic.
 *
 * uA = [cell size, -, contrast, screen index]
 * uB = [ink index, -, -, -]
 */
export const fragment = wrap(`
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
float bayer8(vec2 a) {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float cell = clamp(uA.x, 1.0, 20.0);
  vec2 px = floor(frag / cell);
  vec2 sampleUv = (px * cell + cell * 0.5 - 0.5 * uRes) / uRes.y;

  float t = uTime * 0.11;
  // Two octaves instead of a full fBm: the field is constant inside a cell but shaded per pixel, so every extra octave
  // is paid for on every pixel of the cell. Dithering at four-plus levels hides the missing high frequencies anyway.
  float n = vnoise(vec3(sampleUv * 1.4, t)) * 0.68 + vnoise(vec3(sampleUv * 3.3, t * 1.7 + 4.2)) * 0.32;
  float bands = 0.5 + 0.5 * sin(sampleUv.x * 3.4 - sampleUv.y * 2.6 + n * 4.2 + t * 2.4);
  float src = clamp(bands * 0.68 + n * 0.55, 0.0, 1.0);
  src = clamp((src - 0.5) * uA.z + 0.5, 0.0, 1.0);

  int screen = int(uA.w + 0.5);
  int inks = int(uB.x + 0.5);
  float levels;
  float q;
  if (screen == 0) {
    levels = 8.0;
    q = src * levels + (bayer8(px) - 0.5);
  } else if (screen == 1) {
    levels = 5.0;
    q = src * levels + (bayer4(px) - 0.5);
  } else {
    vec2 g = fract(frag / cell) - 0.5;
    float dotMask = smoothstep(0.52, 0.08, length(g));
    levels = 4.0;
    q = src * levels + dotMask * 0.85;
  }

  float v = floor(clamp(q, 0.0, levels - 0.0001)) / (levels - 1.0);

  vec3 ink;
  if (inks == 2) {
    ink = mix(vec3(0.02), vec3(0.98), v);
  } else if (inks == 0) {
    ink = mix(uColor1 * 0.7, uColor2, v);
  } else {
    ink = palette(v);
  }

  // Ink only covers the upper part of the ramp: mid-tones stay as paper, which is what makes a limited-ink print read
  // as a print instead of a washed-out photograph.
  vec3 col = mix(uColor0, ink, smoothstep(0.34, 0.78, v));
  outColor = vec4(finish(col), 1.0);
}
`)
