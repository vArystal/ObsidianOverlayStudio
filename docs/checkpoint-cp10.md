# CP10 — runtime frame budget

OBS renders the published overlay as a browser source. If the page cannot hold frame time, the stream
drops frames, and no amount of visual polish survives that. Nothing had measured it.

Probe: `scripts/probes/cp10-runtime-perf.mjs` builds a 33-layer composition (30 text layers plus chat,
countdown and viewer count), loads it in the runtime, and measures frames with `requestAnimationFrame`
over 5 seconds plus long tasks over 50ms. `SITE=production` runs the same measurement against the
deployed site instead of the local build.

## Measured, before

| Run | fps | p95 frame | worst | janky frames (>20ms) |
| --- | --- | --- | --- | --- |
| static, 33 layers | 60.2 | 16.7ms | 17ms | 0 |
| animated: glow + ornate frame on 30 layers | 47.0 | 50ms | 67ms | 46 |

Cost of decoration alone: 13.2fps. Layer count was not the problem; property choice was.

## Root cause

- Idle glow animated `filter: drop-shadow(...)`, which repaints the element on every frame.
- Idle sparkle animated `background-position`, which also repaints.
- Neither can run on the compositor, so 30 of them fought for the main thread.

## Fix

- Glow is now a static shadow on its own layer with animated `opacity`; the widget keeps a constant,
  cheap drop-shadow so the look is unchanged.
- Sparkle is the same three glints on their own layer, drifting with `translate3d`.
- Both layers carry `will-change: opacity, transform`.
- `.canvas-element` and `.runtime-element` gained `contain: layout paint style`, so one element's repaint
  cannot invalidate the other 32.

## Measured, after

| Run | fps | p95 frame | worst | janky frames |
| --- | --- | --- | --- | --- |
| animated, local build | 60.0 | 16.8ms | 17ms | 0 |
| animated, production | 59.8 | 16.8ms | 17ms | 1 |

Idle-animation cost: 0.2fps local, 0.4fps production. Effects verified still rendering (glow halo,
sparkle glints, shimmer sweep, float) and no `elegant-glow` / `sparkle-breathe` animations remain.

## Second defect, found by the probe crashing on its own data

The first probe run rendered an error page instead of an overlay. The synthetic overlay had a theme
without colours, and the colour helper called `undefined.replace`, which unmounted the whole runtime into
"Unexpected Application Error". Real overlays always carry colours, but older saved data or hand-edited
storage need not: on stream that blanks the source rather than losing one tint.

Fixed: the helper degrades to `transparent` for an unknown colour, and the runtime defaults
accent/primary/surface. Two tests cover it, plus one asserting the idle layers exist so a future edit
cannot quietly put the expensive animations back.

Tests: 75 vitest, tsc and build clean.
