# Motion backgrounds

Ten backdrop variants, one engine. Each variant is a different construction — shader, Canvas2D simulation or pure CSS —
but they all share the same typed configuration, the same document record and the same lifecycle guarantees.

## Using it

### In React

```tsx
import { MotionBackground } from './components/MotionBackground'
import type { OverlayBackground } from './types'

// `background` is the overlay document's `background` record (colours, speed, seed, params…).
<MotionBackground background={background} reducedMotion={false} />
```

`MotionBackground` only owns mount/unmount. Changing any field of `background` is pushed through `update`; the renderer
is not rebuilt, so a slider drag never drops a GL context.

Props:

| prop          | type                        | default  | meaning                                                          |
| ------------- | --------------------------- | -------- | ---------------------------------------------------------------- |
| `background`  | `OverlayBackground`         | —        | The document record; `kind` selects the variant.                 |
| `reducedMotion` | `boolean`                 | `false`  | Stops the clock and shows a still frame (OBS runtime).            |
| `interactive` | `boolean`                   | `true`   | Enables pointer influence for variants that declare it.          |
| `quality`     | `QualityTier \| 'auto'`     | `'auto'` | Pins the resolution tier instead of letting the governor decide. |
| `onEngine`    | `(handle \| null) => void`  | —        | Receives the imperative handle for the gallery HUD/snapshots.     |

### Without React

```ts
import { createMotionBackground } from './motion/engine'
import { defaultConfig } from './motion/config'

const handle = createMotionBackground(container, {
  variant: 'aurora-mesh',
  config: defaultConfig('aurora-mesh'),
  quality: 'auto',
  interactive: true,
})

handle.update({ speed: 1.3, colors: ['#05070f', '#101a33', '#4fd1c5'] })
await handle.setVariant('fluid-ink')     // lazy-loads the new renderer, fades over 400 ms
handle.pause()
handle.play()
handle.resize()                          // normally unnecessary — a ResizeObserver does it
handle.snapshot()                        // data URL or null
handle.stats()                           // { fps, frameMs, scale, quality, tier }
handle.destroy()                         // cancels RAF, disconnects observers, removes the DOM
```

`createMotionBackground` is safe to call during SSR (it only touches `document` inside functions) and safe to call on a
zero-sized container: the loop starts when the host gains size.

## The ten variants

| id                | backend  | construction                                                                   | pointer |
| ----------------- | -------- | ------------------------------------------------------------------------------ | ------- |
| `aurora-mesh`     | WebGL2   | Domain-warped fBm mesh, five colour centres, soft curtains                     | yes     |
| `liquid-glass`    | WebGL2   | Ray-marched sphere lenses over a drifting gradient, single refraction + fake dispersion | yes |
| `particle-flow`   | Canvas2D | Curl-noise flow field, square motes with additive trails                        | yes     |
| `fluid-ink`       | WebGL2   | Curl-advected dye (no pressure projection — documented approximation)          | yes     |
| `dither-print`    | WebGL2   | Order-2/4/8 Bayer and halftone screens over a two-octave field, limited inks    | no      |
| `contour-lines`   | WebGL2   | Anti-aliased isolines of a moving scalar field, variable spacing                | yes     |
| `deep-space`      | WebGL2   | Nebula bands, dust and parallax star layers, no raymarching                     | yes     |
| `reactive-grid`   | Canvas2D | Spring lattice of cells driven by a travelling wave and the pointer             | yes     |
| `css-orbs`        | CSS      | Blurred gradient orbs sized in container query units, zero JS per frame        | no      |
| `living-patterns` | Canvas2D | Gray-Scott reaction–diffusion, 2×-upsampled, seeded and warmed up              | no      |

Every variant ships the same five presets — **Midnight**, **Pastel**, **Dopamine**, **Monochrome**, **Neon** — with
palettes and variant params chosen per mood, so a preset switch is a finished look, not a starting point.

## Configuration

`MotionConfig` is the resolved form handed to a renderer:

```ts
{
  colors: [ground, mid, light]  // OKLab-mixed by palette()
  speed, intensity, opacity, blur, density, scale, seed, pointer, grain, vignette
  params: Record<string, number | string | boolean>
}
```

- Colours, sizes, speeds and counts live in the catalog (`src/motion/catalog.ts`) or in params — no magic numbers inside
  renderers.
- `normaliseMotionConfig` clamps every field and validates every param against the variant's `ParamSpec`, so a stale
  snapshot or hand-edited share link cannot render garbage.
- `defaultConfig(variant)` gives a complete, deterministic configuration.
- Rendering is deterministic per `seed`: the same config and seed produce the same composition on every reload.

## Document integration

The overlay stores a flat record, not a renderer config:

```ts
interface OverlayBackground {
  enabled: boolean
  kind: BackgroundKind           // the ten ids + 'none'
  primary, secondary, accent: string
  opacity, speed, intensity, blur, density, scale: number
  paused: boolean
  params?: Record<string, ParamValue>
  preset?: string
  seed?: number
}
```

`normalizeBackground` migrates legacy scene names through `LEGACY_KIND_MAP`:

| legacy                 | variant          |
| ---------------------- | ---------------- |
| `aurora-flow`, `light-rays` | `aurora-mesh` |
| `liquid-light`, `frosted-glass` | `liquid-glass` |
| `cinematic-particles`  | `particle-flow`  |
| `rose-vines`, `smoke-drift` | `fluid-ink` |
| `neon-grid`            | `reactive-grid`  |
| `deep-space`, `storm-clouds` | `deep-space` |
| `ambient-gradient`, `bokeh-lights` | `css-orbs` |

Unknown values fall back to `aurora-mesh`. Existing documents keep their colours, speed, opacity and enabled state; only
the scene name is rewritten.

## Engine guarantees

- **One clock.** Every live background shares a single RAF loop; a hidden or offscreen host is paused via
  `IntersectionObserver` + `visibilitychange`.
- **Quality governor.** Frame time is an EMA; sustained overshoot steps resolution down (`high → medium → low`), and a
  comfortable run steps back up. `stats().scale` and `stats().quality` report the current state.
- **Poster first.** A CSS gradient derived from the config paints immediately; the canvas fades in when its lazily
  imported renderer is ready. Below 8 px the canvas is never created (which is also what makes jsdom tests cheap).
- **No per-frame allocation.** GL variants draw a fullscreen triangle from `gl_VertexID` with params packed into two
  `vec4`s; canvas painters own preallocated buffers.
- **Reduced motion** freezes the clock and keeps the current frame.
- **Clean teardown.** `destroy()` cancels RAF, disconnects both observers, removes listeners and the root node.

## Verifying

```bash
npx vitest run src/motion/motion.test.ts src/lib/backgrounds.test.ts
npx tsc -b
npm run build
```

Open `/#/motion` for the gallery: every variant renders live with its five presets, seed shuffle, reduced-motion toggle
and real `frameMs` per card.

## Adding a variant

1. Add the id to `VARIANT_IDS` and `BackgroundKind`; add the entry to `VARIANTS` with params, defaults and five presets.
2. Write the renderer: a fragment body for GL (`src/motion/renderers/gl/`), a `CanvasPainter` for 2D, or CSS vars.
3. Register its lazy loader in `src/motion/renderers/index.ts` and its param packer in `PACKERS`.
4. Add a legacy alias if it replaces a scene, then cover it in `backgrounds.test.ts`.

## Known limitations

- `fluid-ink` is a curl-noise dye advection, not a Navier–Stokes solve; it reads as ink, it does not conserve vorticity.
- `living-patterns` is a CPU simulation, so it is the first variant to be stepped down by the governor.
- `liquid-glass` fakes dispersion with one refraction sample and a chromatic offset; spheres do not refract each other.
- The gallery is a verification page, not a separate Studio app: no audio reactivity, tilt input, layer stacking or
  WebM export.
