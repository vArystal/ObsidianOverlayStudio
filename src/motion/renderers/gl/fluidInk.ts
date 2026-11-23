import { wrap } from '../glsl'

/**
 * Fluid Ink — dye carried by a divergence-free curl field. Sampling a warp of the noise field and advecting the dye
 * lookup along it gives the folding, marbled edges of ink in water without a pressure solve: the field is built to be
 * incompressible, so the dye swirls and never piles up.
 *
 * uA = [stir points, turbulence, dye density, flow scale]
 */
export const fragment = wrap(`
vec2 stir(vec2 p, float t, float count) {
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float a = t * (0.3 + fi * 0.07) + fi * 1.9 + hash11(fi * 3.7) * 6.28;
    vec2 c = vec2(cos(a) * 0.42, sin(a * 0.8 + fi) * 0.3);
    vec2 rel = p - c;
    float r = length(rel) + 1e-5;
    acc += vec2(-rel.y, rel.x) / r * exp(-r * 5.0) * (0.8 + hash11(fi + 1.3));
  }
  return acc;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.09;
  vec2 p = uv * 1.25 * max(0.3, uA.w);

  float w1 = fbm(vec3(p * 1.15, t));
  float w2 = fbm(vec3(p * 1.15 + 5.2, t * 1.1));
  vec2 warp = vec2(w1, w2) - 0.5;

  vec2 flow = p + warp * uA.y * 1.3 + stir(uv, t * 1.6, max(1.0, uA.x)) * 0.55;

  vec2 rel = uv - uPointer * 0.5;
  float pull = exp(-length(rel) * 3.2) * uPointerAmp;
  flow += vec2(-rel.y, rel.x) * pull * 1.6;

  float dye = fbm(vec3(flow * 1.9 + vec2(w1, w2) * 0.9, t * 1.5));
  float dye2 = fbm(vec3(flow * 2.7 - 3.7, t * 1.9 + 2.0));
  float mask = smoothstep(0.22, 0.92, dye) * clamp(uA.z, 0.0, 1.0);

  vec3 col = mix(uColor0 * 0.6, uColor1, smoothstep(0.12, 0.86, dye2));
  col = mix(col, uColor2, mask);
  col += uColor2 * pow(mask, 3.0) * 0.30;
  col += uColor1 * pow(1.0 - mask, 3.0) * 0.18 * uIntensity;

  outColor = vec4(finish(col), 1.0);
}
`)
