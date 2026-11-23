import { wrap } from '../glsl'

/**
 * Liquid Glass — a handful of glass spheres refract a procedural backdrop. Each orb gets a true sphere normal
 * (`sqrt(1 - r²)`), so the lens edge curves smoothly instead of creasing along the medial axis the way a unioned SDF
 * does. Refraction offsets the backdrop lookup, the three channels sample tiny different offsets (dispersion), and a
 * fresnel rim plus one tight specular do the rest.
 *
 * uA = [orbs, thickness, dispersion, frost]
 * uB = [specular, -, -, -]
 */
export const fragment = wrap(`
vec3 backdrop(vec2 uv, float t) {
  float n = fbm(vec3(uv * 1.5, t * 0.16));
  // Skewed towards the accent stop so the glass has something bright to bend; otherwise refraction is invisible.
  vec3 c = palette(0.34 + n * 0.8);
  c += uColor1 * 0.55 * smoothstep(-0.2, 1.0, uv.y);
  c += uColor2 * 0.34 * smoothstep(0.55, 1.25, length(uv - vec2(0.62, 0.28)));
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.12;
  float orbs = max(3.0, uA.x);
  float thick = uA.y;
  float disp = uA.z;
  float frost = fbm(vec3(uv * 5.0, t * 1.4)) * uA.w;

  vec3 col = backdrop(uv, uTime * 0.2);

  for (int i = 0; i < 7; i++) {
    if (float(i) >= orbs) break;
    float fi = float(i);
    float a = t * (0.45 + fi * 0.11) + fi * 2.1;
    vec2 c = vec2(cos(a * 1.1 + fi) * 0.46, sin(a * 0.9 + fi * 1.7) * 0.34);
    float r = 0.15 + 0.07 * hash11(fi * 12.9898);
    vec2 d = uv - c;
    float rr = length(d) / r;

    if (rr < 1.0) {
      float z = sqrt(max(0.0, 1.0 - rr * rr));
      vec2 nxy = d / r;
      vec2 bend = nxy * thick * 0.12 * (0.35 + 0.65 * z) + vec2(frost * 0.012);
      float fres = pow(1.0 - z, 2.4);
      // One refraction lookup, with the dispersion faked as an edge tint. Three real samples per orb tripled the
      // shader's noise cost and halved the gallery's frame rate.
      vec3 refr = backdrop(uv - bend, uTime * 0.2);
      refr += vec3(disp * 0.05, 0.0, -disp * 0.05) * fres * 2.0;

      vec3 n3 = normalize(vec3(nxy, z));
      float spec = pow(max(dot(n3, normalize(vec3(-0.5, 0.7, 0.65))), 0.0), 64.0);
      vec3 lens = refr * 1.08 + uColor2 * fres * 0.30 + vec3(spec) * 0.85 * uB.x;
      float edge = smoothstep(1.0, 0.90, rr);
      col = mix(col, lens, edge * 0.92);
    } else {
      // Soft caustic halo just outside the glass.
      col += uColor2 * exp(-(rr - 1.0) * 9.0) * 0.05 * (0.4 + uIntensity);
    }
  }

  outColor = vec4(finish(col), 1.0);
}
`)
