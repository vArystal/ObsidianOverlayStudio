import { wrap } from '../glsl'

/**
 * Deep Space — fBM volumetrics for the nebula and three hashed star layers at different scales, plus one rare shooting
 * star. No raymarch loop: the nebula is a two-sample warp, which is what keeps a full-screen 1080p frame well inside
 * budget on integrated GPUs.
 *
 * uA = [nebula, star density, twinkle, shooting stars]
 */
export const fragment = wrap(`
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.03;
  vec2 par = uPointer * 0.035 * uPointerAmp;
  vec2 p = uv + par;

  float n1 = fbm(vec3(p * 0.85 + vec2(t, -t * 0.6), t * 0.8));
  float n2 = fbm(vec3(p * 1.62 - n1 * 0.9, t * 1.2 + 2.3));
  float dens = smoothstep(0.26, 0.86, n2);

  vec3 col = uColor0;
  // Two stops of the same cloud: a wide base colour and a tight, brighter core. One weight of colour reads as a stain.
  col += uColor1 * dens * 1.7 * uA.x;
  col += uColor2 * pow(dens, 2.4) * 1.05 * uA.x;
  col += uColor2 * pow(smoothstep(0.55, 0.95, n1), 3.0) * 0.35 * uA.x;
  // Dust lane: one dark band where the cloud is thickest, which is what reads as depth.
  col *= 1.0 - smoothstep(0.22, 0.55, abs(n1 - 0.52)) * 0.42;

  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 34.0 + fl * 62.0;
    vec2 gv = (uv * (0.55 + fl * 0.32) + par * fl * 1.8) * scale;
    vec2 cell = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 off = hash22(cell) - 0.5;
    float d = length(f - off * 0.72);
    float bright = hash12(cell * 1.73 + fl * 11.0);
    float tw = 0.7 + 0.3 * sin(uTime * (0.8 + bright * 2.6) + bright * 40.0) * uA.z;
    float star = smoothstep(0.085, 0.0, d) * step(1.0 - clamp(uA.y, 0.0, 1.0) * 0.82, bright) * tw;
    col += vec3(0.94, 0.96, 1.0) * star * (1.6 + fl * 0.5) * (0.65 + uA.z * 0.35);
  }

  if (uA.w > 0.01) {
    float cycle = 14.0;
    float idx = floor(uTime / cycle);
    float phase = fract(uTime / cycle);
    float rnd = hash11(idx * 7.31 + 1.7);
    if (rnd > 1.0 - uA.w * 0.45) {
      vec2 start = vec2(-1.05 + rnd * 0.9, 0.62 - phase * 1.35);
      vec2 dir = normalize(vec2(1.0, -0.62));
      vec2 rel = uv - start;
      float along = dot(rel, dir);
      float perp = abs(dot(rel, vec2(dir.y, -dir.x)));
      // A meteor, not a line: the head is a sharp point and the tail tapers quadratically to nothing. A constant-width
      // tail with a hard end reads as a rendering artefact rather than a streak.
      float head = smoothstep(0.022, 0.0, abs(along)) * smoothstep(0.006, 0.0, perp);
      float tail = smoothstep(-0.005, 0.0, along) * smoothstep(0.13, 0.0, along);
      float taper = smoothstep(0.13, 0.0, along);
      float body = smoothstep(0.007 + 0.004 * taper, 0.0, perp) * tail * taper;
      col += vec3(0.88, 0.94, 1.0) * (body * 0.55 + head) * smoothstep(1.0, 0.45, phase) * uA.w;
    }
  }

  outColor = vec4(finish(col), 1.0);
}
`)
