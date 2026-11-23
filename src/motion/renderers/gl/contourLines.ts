import { wrap } from '../glsl'

/**
 * Contour Lines — a scalar noise field draw as isolines. `fwidth` gives the pixel-space derivative, which is what
 * keeps a hairline one pixel wide at every zoom and resolution instead of aliasing into dashes.
 *
 * uA = [line density, line weight, field scale, ridged]
 * uB = [height bands, -, -, -]
 */
export const fragment = wrap(`
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.055;
  vec2 p = uv * 1.7 * max(0.2, uA.z);

  vec2 rel = uv - uPointer * 0.5;
  p += normalize(rel + 1e-5) * exp(-length(rel) * 3.0) * uPointerAmp * 0.45;

  float n = fbm(vec3(p, t));
  if (uA.w > 0.5) n = 1.0 - abs(n * 2.0 - 1.0);

  float density = clamp(uA.x, 4.0, 80.0);
  float band = n * density;
  float v = fract(band);
  float dist = min(v, 1.0 - v);
  float width = fwidth(band);
  float weight = clamp(uA.y, 0.05, 2.0) * 0.16;
  float line = 1.0 - smoothstep(weight, weight + max(width, 0.0012) * 1.5, dist);

  vec3 col = mix(uColor0, uColor1, 0.15 + n * 0.45);
  if (uB.x > 0.5) {
    // Quantised height bands under the lines: a map, not just a mesh.
    float stepIndex = floor(band) / density;
    col = mix(uColor0, uColor1, 0.25 + stepIndex * 0.65);
    col = mix(col, uColor2, pow(clamp(stepIndex, 0.0, 1.0), 3.0) * 0.28);
  }
  col = mix(col, uColor2, line * 0.92);
  col += uColor2 * exp(-dist * 55.0) * 0.05 * (1.0 - line);

  outColor = vec4(finish(col), 1.0);
}
`)
