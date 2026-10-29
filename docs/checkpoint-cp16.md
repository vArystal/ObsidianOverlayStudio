# CP16 — Thorn & Rose rebuilt as a botanical illustration

The theme was a tiling vine strip with sticker roses. It is now layered vector art drawn per frame, at the
widget's own pixel size, so nothing stretches and nothing repeats.

## What the frame is made of

- **Canes** — one long path per edge plus a second strand, each drawn three times: a dark under-stroke
  offset by 1.2px for the lift, the woody body in a gradient, and a thin lit edge offset by -0.6px. No blur
  filter: the shadow is geometry.
- **Thorns** — tapered curved spikes, 7-15px, sampled along the perimeter at jittered intervals, alternating
  inward and outward, each with a pale tip highlight. Chat frames keep their right side clear.
- **Leaves** — serrated three-lobed leaves in three shades, midrib plus two veins on the front ones, and
  darker ones drawn behind the canes so foliage reads as depth.
- **Roses** — four rings of cup-shaped petals (6/5/4/3) with dark centres and light rims, a velvet sheen and
  a shadowed heart. Placement per variant: camera = hero 76px top-right, bud bottom-left, two small ones;
  alert = hero above the plaque with two flanking buds; chat = one bud; plaque = a small rose each side.
- **Filigree** — antique gold inner line, rounded corner ornaments, a 5px warm glow behind it, and a slow
  shimmer sweep.
- **Panel interior** — deep green gradient, grain baked into the background stack, inset vignette. Webcam and
  game-capture frames get `thorn-open` instead: no fill at all, so video passes through.

## Performance

Layered SVG is easy to make slow. Measured at 1920x1080 with the four widgets on screen:

| change | fps |
| --- | --- |
| first pass, group `feDropShadow` + blended grain | 12 |
| drop the group blur | 32 |
| grain without `mix-blend-mode` | 46 |
| leaves grouped instead of 69 animated leaves | 52 |
| grain baked into the background stack | 50 |
| blooms moved into composited HTML layers | **59-60** |

The lesson: an animated transform inside a big SVG repaints the whole frame on every tick, while the same
animation on an HTML layer is composited. Roses now live in their own layers; the canes and leaves stay
static inside one SVG.

## Tuning

- **Rose colour** — `--thorn-rose-shadow/-deep/-mid/-lit` in `.theme-thorn-rose` (defaults
  `#3d0610 #8e1226 #b3162f #d9304a`). Every petal gradient reads those variables.
- **Thorn density** — `THORN_TUNING` in `src/lib/thornGeometry.ts`: `density` (thorns per perimeter sample,
  default 1), `foliage`, `roseScale`, `motionScale`.
- **Animation intensity** — `--thorn-motion` in `.theme-thorn-rose` (default `1`). It multiplies every sway,
  shimmer and drift duration and delay, so `2` halves the speed and `0.5` doubles it. `0` plus
  `prefers-reduced-motion` or the editor's Static motion toggle stops the idle motion entirely.

## Verified

- 107 vitest tests, including eight for the geometry: determinism for a given seed, a hero rose on large
  frames, corner clustering, thorns inside the canvas, and no rose older than the frame.
- Browser probe, four widget shapes: 4/4 framed, 45 canes, 102 thorns, 69 leaves, 11 roses, 4 filigree lines,
  art never covers more than 3% of a content box, zero console errors.
- Canvas 1920x1080: 59-60fps with idle motion running.
