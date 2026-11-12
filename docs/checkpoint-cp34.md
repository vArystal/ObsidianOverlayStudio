# CP34 — One stage renderer for editor and OBS runtime

Branch `cp34-overlay-stage` (off `cp33-hook-safety`), commits `db1a9f3`-class work in two changes plus docs.

## Defect

`src/components/editor/Canvas.tsx` and `src/pages/OverlayRuntime.tsx` each built the element wrapper by hand.
They had already drifted in four ways:

| # | Drift | Effect |
| --- | --- | --- |
| 1 | Runtime rendered `<span class="idle-layer idle-glow|idle-sparkle">`, Canvas did not | `premium.css` idle glow and sparkle rules never applied while authoring, so two inspector effects looked broken |
| 2 | `AlertProvider` was constructed inside the element map, and `normalizeAlertSettings(overlay.alerts)` ran per element per render | A 20-layer overlay normalised the alert document 20 times a frame and produced 20 provider instances |
| 3 | Runtime ignored `overlay.staticMotion` for `BackgroundLayer` | A source set to "static / reduced-motion output" still had a moving backdrop on air |
| 4 | Each path assembled its own theme CSS variables | Two places to forget when a theme gains a variable |

## Fix

`src/components/OverlayStage.tsx` is now the only element renderer. Props carry the mode and the few real
differences: `mode`, `scale`, `scaleMode`, `staticElements`, `reducedMotion`, `selectedId`,
`onElementPointerDown`, `renderElementChrome`, `children` (guides, empty hint, safe area), `alertTests`,
`motionHost`, `stageAttributes`.

- Alert settings are normalised once with `useMemo` and one `AlertProvider` wraps the whole stage.
- Idle layers are rendered from the shared wrapper in both modes.
- `reducedMotion` drives `BackgroundLayer` in both modes; the runtime passes
  `overlay.staticMotion || prefersReducedMotion`, the editor passes `overlay.staticMotion`.
- Both callers pass a resolved `theme` and the stage applies `themeCssVars` itself.
- The stage keeps the `canvas-stage` / `runtime-stage` class names so no CSS rule moved.
- `includeInOutput` filtering is a mode rule inside the stage: the editor shows every visible layer, the runtime
  only what the composition sends to air.

**MotionHost** stays runtime-only behind `motionHost={false}` in the editor. Wiring the canvas to the motion
host is CP35's scope; the seam is a prop on the shared component rather than a second wrapper.

## Regression tests

`src/components/OverlayStage.test.tsx` (6 tests):

1. Identical `.element-content` markup for text and clock elements in both modes. Chat, image placeholders and
   alerts are excluded because they differ by design (sample copy versus nothing until a real event); the alert
   test asserts the wrapper chain matches and only the inner data differs.
2. Idle glow and sparkle layers present in editor and runtime.
3. `normalizeAlertSettings` called exactly once with the overlay document for a two-alert overlay (identity filter).
4. `staticMotion` renders `is-still` backgrounds in both modes.
5. `includeInOutput: false` layer appears in the editor and not in the runtime.

## Verification

```
npx tsc -b                          # clean
npx vitest run                      # 254 passed, 32 files
node --test server/*.test.mjs       # 49 pass
node --test worker/index.test.mjs   # 34 pass
npx vite build                      # built in 407ms
npm run check                       # green
node scripts/probes/cp0-runtime-probe.mjs
  1920x1080 stage 1920x1080 elem 400x100 expected 400x100, 0 errors
  1280x720  stage 1280x720  elem 267x67  expected 267x67,  0 errors
  1000x1000 stage 1000x563  elem 208x52  expected 208x52,  0 errors
```

## Not verified

- The OBS journey probe (`cp8-journey-probe.mjs`) needs a served build. It was not run against this branch
  locally because no preview server was started; it runs against production after deploy.
- No screenshot comparison of the editor against a previous build was taken. The canvas element class list and
  geometry are unchanged (probe above), and the added idle layers are the intended visual difference while
  authoring.
- CP33 and CP34 are on branches; `main` does not contain them yet in this branch's history.
