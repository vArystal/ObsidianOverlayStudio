# CP27 — Advanced animation and effects engine

Date: 2026-11-06. Site https://varystal.github.io/ObsidianOverlayStudio · commits `59faf59` (engine) and `746d272`
(effects UI, loop durability, benchmark). Deployed bundle `index-B-yDi_39.js`, verified live.

## Architecture

One sampler, one host, one effects model. The editor canvas and the OBS runtime both mount `MotionHost`, which reads
`element.motion` and calls `sampleMotion`; there is no preview-only code path.

- `src/lib/motion.ts` — types (`MotionClip`, `MotionTrack`, `MotionKeyframe`, `ElementEffects`), CSS cubic-bezier
  solver (`cubicBezier`, Newton with bisection fallback), `evaluateEasing`, `sampleTrack`, `clipLocalTime`
  (delay / repeat / alternate / repeatDelay), `sampleMotion`, `motionSpan`, `motionStyle`, 22 presets,
  `createMotion`, `normalizeMotion`, `rgba`, `effectsStyle`, keyframe upsert/remove helpers.
- `src/components/MotionHost.tsx` — subscribes to a single module-level rAF loop (not one per element), writes
  transform/opacity/filter straight to the node, unsubscribes itself when its clips are exhausted, pauses on
  `visibilitychange`, and honours reduced motion by sampling the end state.
- `src/components/editor/MotionStudio.tsx` — preset library, clip list, per-property keyframe chips, effects panel,
  and a compact timeline (ruler, playhead, transport, scrub, zoom) that previews through the same sampler.
- Serialisation: `normalizeOverlay` re-attaches `motion` only when an element really carries it, so legacy overlays
  round-trip byte-identically.

## Engine capabilities

Entrance, exit, idle/loop, hover and trigger clips; multiple clips per element that layer per property (the last clip
to emit a property wins); delay, duration, repeat count, repeat delay, alternate direction; keyframes for x, y,
scaleX, scaleY, rotate, opacity, blur, skewX, skewY; linear, ease-in/out/in-out and cubic-bezier easing.

Presets (22): fade, slide, zoom, pop, bounce, elastic, pulse, shake, flip, rotate, blur-reveal, typewriter, glitch,
neon-glow, shimmer, floating, breathing, gradient-motion, particle-reveal, plus the exit variants the library generates
from the same builders.

Triggers: `load`, `reveal`, `interaction`, `alert`, `queue-complete`, `custom`. The alert trigger is a filter over the
existing alert pipeline; no second event system exists.

## Effects

`shadow` (colour, opacity, blur, X/Y offset), `glow` (colour, intensity, blur, spread), `neon`, `blur`, `gradient`,
`mask` (fade-bottom, fade-top, radial, ellipse with softness and reach) and `clip` (inset, circle, hex). All fields are
serialised and applied by `effectsStyle`, so the studio preview and the OBS source compute identical CSS.

## Performance (1920×1080, headless Chromium + SwiftShader)

`scripts/probes/cp27-motion-perf.mjs` seeds overlays of 5, 10 and 20 elements, each with a looping `floating` clip and
a glow effect, then samples rAF for 5 seconds.

| widgets | local fps | p95 | janky | production fps | p95 | janky | moving hosts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 60.0 | 16.7 | 0 | 60.2 | 16.7 | 0 | 5/5 |
| 10 | 60.0 | 16.8 | 0 | 59.8 | 16.8 | 1 | 10/10 |
| 20 | 60.0 | 16.8 | 0 | 60.0 | 16.7 | 0 | 20/20 |
| 20 static | 60.2 | 16.8 | 0 | 60.2 | 16.8 | 0 | — |

The CP24 target (≈60fps with 20 widgets) holds with every widget animating.

## Defect found and fixed

Clips stored `repeat: Infinity`. JSON turns that into `null`, so a saved loop was read back as a single pass and an
overlay that looped in the studio stopped after one cycle on air. `repeat` is now `-1` for forever, every reader
handles it, and a round-trip regression test pins it.

## Tests

239 vitest (17 motion-specific: easing, interpolation, clip timing, presets, normalisation, durability, host parity),
49 legacy server, 34 worker, TypeScript project build and Vite production build all pass.

## Deployment

- `746d272` pushed to `main` and `arena/35be064d-jubilant-octo-lamp`.
- Live bundle confirmed equal to the local build (`index-B-yDi_39.js`); the production probe then showed every
  seeded host moving at ~60fps on the deployed site.

## Screenshots

- `artifacts/cp27-runtime-motion.png` — published runtime at 1920×1080, three animated elements mid-motion with
  shadow and glow applied.
- Studio panel is covered by automated tests and the probe's `studio` assertion; no separate capture was committed.

## Known limitations

- Motion animates transform, opacity and filter only. Filter animation in particular is expensive on weak GPUs, so blur
  and glow are static per element rather than keyframed.
- Particle reveal is a discrete particle preset, not a physics system; nothing generates unbounded particles.
- The timeline edits one element at a time. Multi-element coordinated sequences are possible by copying clips, not by a
  shared track view.
- Reduced motion collapses to the end state, which is the correct accessibility behaviour but means a "motion off"
  overlay shows no entrance at all.
