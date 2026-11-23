import { wrap } from '../glsl'

/**
 * Aurora Mesh — domain-warped fBM steers a three-stop OKLab-ish palette. Two warp passes (`n1` feeds `n2`) are what
 * make the light look smeared through air instead of painted on: a single noise field always reads as clouds.
 *
 * uA = [mesh points, warp, glow, band contrast]
 */
export const fragment = wrap(`
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.09;
  float points = max(3.0, uA.x);

  vec2 q = vec2(uv.x * (1.0 + points * 0.03), uv.y * 1.18);
  float n1 = fbm(vec3(q * 1.35, t));
  float n2 = fbm(vec3(q * 1.75 + n1 * uA.y * 1.4, t * 1.25 + 4.2));
  float n3 = fbm(vec3(q * 2.3 + n2 * uA.y * 1.9, t * 1.1 + 9.7));

  // Push the palette towards the accent stop: the first two stops are near-blacks, so a plain n2 lookup reads as
  // smoke. The curtain term is what gives the bright, vertical aurora bands.
  vec3 col = palette(0.16 + n2 * 0.98);
  float curtain = smoothstep(0.46, 0.84, n3) * smoothstep(0.30, 0.82, n2);
  col += uColor2 * curtain * 0.62 * uA.z;
  col = mix(col, uColor1 * 1.6, pow(clamp(n1, 0.0, 1.0), 2.0) * 0.35);

  // A slowly orbiting key light gives the mesh a focal point instead of uniform brightness.
  vec2 focus = vec2(cos(t * 0.7) * 0.45 - 0.22, sin(t * 0.55) * 0.26 + 0.1);
  float dd = length(uv - focus);
  col += uColor2 * 0.34 * exp(-dd * dd * 3.6) * uA.z;
  col += uColor1 * 0.30 * exp(-length(uv - vec2(0.42, -0.28)) * 2.4);

  vec2 pd = uv - uPointer * 0.55;
  col += uColor2 * 0.22 * exp(-dot(pd, pd) * 5.0) * uPointerAmp;

  col *= 1.12;
  col = (col - 0.5) * uA.w + 0.5;
  outColor = vec4(finish(col), 1.0);
}
`)
