# Motion background rebuild — progress

Replacing the old CSS-scene backdrop system with one premium, fully tunable motion system: ten variants, one engine,
one typed contract. Design and API notes live in [`docs/motion-backgrounds.md`](docs/motion-backgrounds.md).

## Status

- [x] Typed schema (`src/motion/types.ts`), catalog with five presets per variant (`src/motion/catalog.ts`)
- [x] Config resolution, paper/poster CSS, OKLab palette helpers (`config.ts`, `utils.ts`)
- [x] Engine: one RAF scheduler, lazy renderer import, quality governor, resize, visibility/offscreen pause, pointer,
      reduced motion, snapshot, `stats()`
- [x] Six WebGL2 fragment shaders sharing a GLSL prelude — no textures, no FBOs, fullscreen triangle from `gl_VertexID`
- [x] Three Canvas2D painters and one pure-CSS scene
- [x] React integration (`MotionBackground`, `BackgroundLayer`, `BackgroundSection`) and gallery at `/#/motion`
- [x] Document integration + migration map (`src/lib/backgrounds.ts`, `LEGACY_KIND_MAP`)
- [x] Tests: `src/motion/motion.test.ts` (13), `src/lib/backgrounds.test.ts` (13); full suite 343 green
- [x] Visual verification in Chrome at desktop size; all ten render
- [x] Real frame-time measurement per variant (no virtual time)
- [x] Bundle check: nine lazy variant chunks, 1.15–2.69 kB each
- [x] Docs: this file + `docs/motion-backgrounds.md`
- [ ] Optional polish: richer particle trails, more organic living-pattern seeding

## Variant mapping

| old scene            | new variant      | why                                                         |
| -------------------- | ---------------- | ----------------------------------------------------------- |
| `aurora-flow`        | `aurora-mesh`    | same ribboned aurora, now a real domain-warped mesh         |
| `light-rays`         | `aurora-mesh`    | rays become mesh curtains                                    |
| `liquid-light`       | `liquid-glass`   | rebuilt as refractive sphere lenses                         |
| `frosted-glass`      | `liquid-glass`   | frosted mass reads as soft glass lenses                     |
| `cinematic-particles`| `particle-flow`  | curl-noise flow field with square motes                     |
| `rose-vines`         | `fluid-ink`      | advected dye gives the organic bloom                       |
| `smoke-drift`        | `fluid-ink`      | same dye field, different preset                            |
| `neon-grid`          | `reactive-grid`  | spring lattice replaces the static neon grid                |
| `deep-space`         | `deep-space`     | kept the id; rebuilt with nebula bands and parallax stars   |
| `storm-clouds`       | `deep-space`     | nebula/dust mass reads as cloud                             |
| `ambient-gradient`   | `css-orbs`       | gradient field becomes blurred CSS orbs                     |
| `bokeh-lights`       | `css-orbs`       | orbs are the honest bokeh                                   |

Stored documents are migrated by `normalizeBackground`; colours, speed, opacity and `enabled` survive, only the scene
name is rewritten. The legacy `containers.test.ts` assertion was updated to test that migration instead of snapshotting
the old string.

## Performance

Measured in headless Chrome (`--headless=new --enable-unsafe-swiftshader`, window 1400×900) against Vite at
1280×720 per variant, 4 s per variant, one engine at a time, after the page was warm. Numbers are the engine's own
`stats()` EMA of RAF deltas — i.e. *delivered* frame time, capped at the 60 Hz display rate.

| variant          | tier  | frameMs | note                                                        |
| ---------------- | ----- | ------- | ----------------------------------------------------------- |
| aurora-mesh      | gl    | 16.7    |                                                             |
| liquid-glass     | gl    | 16.7    |                                                             |
| particle-flow    | 2d    | 16.8    |                                                             |
| fluid-ink        | gl    | 16.6    |                                                             |
| dither-print     | gl    | 16.6    | was 29.6 ms before dropping per-pixel fBm to two octaves     |
| contour-lines    | gl    | 16.7    |                                                             |
| deep-space       | gl    | 16.7    |                                                             |
| reactive-grid    | 2d    | 16.7    |                                                             |
| css-orbs         | css   | 16.7    | no JS frame cost; the value is the page clock                |
| living-patterns  | 2d    | 16.6    | governor had stepped it to 0.76× / medium before the fix run |

All ten sit at the vsync ceiling on an Intel UHD (ANGLE/D3D11), so this run establishes "keeps 60 fps at 720p", not
headroom. The `dither-print` regression was real and is fixed: the fBm was being evaluated per pixel even though the
print field is constant inside each dither cell. `frameMs` alone cannot show GPU headroom; a GPU timer query would be
the honest next step.

Bundle (production build):

- main `index-*.js` 579.30 kB (gzip 173.50 kB) — the app, not the motion system
- lazy variant chunks: `contourLines` 1.15 kB, `auroraMesh` 1.37 kB, `fluidInk` 1.43 kB, `particleFlow` 1.53 kB,
  `ditherPrint` 1.99 kB, `liquidGlass` 2.01 kB, `deepSpace` 2.20 kB, `reactiveGrid` 2.29 kB,
  `livingPatterns` 2.69 kB (gzip 0.6–1.4 kB each). `css-orbs` ships no JS.
- shared GLSL prelude and engine live in the main chunk; each variant chunk is only its fragment body / painter.

## Verification commands

```bash
npx tsc -b
npx vitest run --pool=threads --no-file-parallelism
npm run build
```

Gallery: `/#/motion` (live cards, per-variant `frameMs`, preset row, seed shuffle, reduced-motion toggle).

## Assumptions

- WebGL2 is the baseline; without it the engine shows the poster instead of a half-broken canvas.
- The gallery page counts as the Studio surface: the brief asked for the system and a gallery, not a second app.
- "Reactive" means pointer-driven; there is no audio input, gyroscope or scroll timeline.
- Legacy scene ids are a closed set; unknown ids fall back to `aurora-mesh` rather than failing a load.

## Limitations

- `fluid-ink` has no pressure projection (documented approximation), so it does not produce true vortices.
- `living-patterns` is CPU-bound and resolves at 0.55–1× depending on the tier.
- `liquid-glass` uses one refraction sample plus a chromatic offset — fast, but lenses do not refract each other.
- No visual-regression screenshots in CI; the gallery plus manual stills are the visual check.
- Headless software GL numbers are delivered frame times, not GPU cost; a hardware display and GPU timer queries would
  give tighter numbers.

## Next steps

- Add GPU timer queries behind `stats()` so headroom is measurable, not inferred.
- Particle trails: accumulate into a low-resolution offscreen buffer instead of per-mote segments.
- Living patterns: seed the reaction–diffusion from the field's noise instead of sparse dots so it reads as one
  organism rather than separate colonies.
