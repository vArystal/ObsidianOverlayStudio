# CP40 — No dead controls

`npm run check` green: 293 vitest, 53 server (3 new guard tests), 34 worker, contract PASS, tsc and vite clean.

The rule for this phase: a control the UI offers must change the published output. Where the output could not
change, the control is gone and the stored field stays readable, so old overlays keep loading.

## Decisions, item by item

**1. Exit animation, exit duration, alert hold — REMOVE (fields kept).**
Nothing read `animation.exit` or `animation.exitDuration`; `.element-exit-*` in `premium.css` had no writer. All
three properties still normalise and round-trip, so a saved overlay keeps its values and a future exit runner can use
them. The alert hold field was doubly wrong: the queue times alerts from `templates[kind].holdDuration`
(`alertQueue.ts:145`), which the alert studio already edits. Removed with the three orphaned CSS classes and the
`ornamental-close` keyframe they were the only users of.

**2. Decoration gradient toggle — REMOVE (field kept).**
`decoration.gradient` had no reader in any renderer or stylesheet. The toggle offered a look that was never built.
The field remains in the model and the preset objects, so nothing that stored it breaks.

**3. thorn-vine preset — IMPLEMENT (was a latent blank).**
The preset existed in `DECORATION_PRESETS` but not in `DECORATION_PRESET_ORDER`, and the inspector's select was a
hardcoded list, which is how the two drifted. The select is now generated from `['none', ...DECORATION_PRESET_ORDER]`
with labels from `DECORATION_PRESET_LABELS`, so a preset cannot exist and be unpickable again.

**4. Motion triggers — REMOVE the unimplemented ones, keep the field.**
`MotionHost` never passed `triggers`, so every clip played on mount regardless of what it claimed to wait for. Only
`load` has an event source, so `MOTION_TRIGGERS` now offers just that, the trigger select is gone (a one-option
select is a promise, not a control), `normalizeMotion` maps every saved trigger to `load` (which is what a saved
`alert` clip actually did), and `MotionHost` now gates the sampler with `IMPLEMENTED_TRIGGERS` instead of passing
nothing. Gating is explicit rather than accidental.

**5. Neon, blur and clip effects — IMPLEMENT.**
All three already had working renderers in `effectsStyle` and no way to reach them, so the honest fix was the
inspector, not the delete key: neon gains an intensity slider and colour, blur an amount slider, clip a shape select
(none / rounded inset / circle / hexagon).

**6. The guard — IMPLEMENT.**
`server/controlConsumers.test.mjs` extracts every field the inspectors write (`prop`, `onProp`, `decorate`, `animate`,
`patchTemplate`, `patchEffect`, `patchClip`) and fails when a key never appears in a read position outside the
inspector files (quoted literal, member access, or object key, so a substring in prose does not count). Two tests
protect the guard itself: a negative control proving the detector rejects keys nothing reads, and an extraction
count so a broken regex cannot make the suite pass by finding nothing. There is one allowlist entry, `preset`, whose
consumer is `createDecoration`/`toggleDecoration`, with that reason written next to it.

## Not verified

- The guard proves a field is *read* somewhere, not that the read is reachable from the published runtime; a field
  read only by editor chrome would still pass.
- Neon, blur and clip are proven wired through `effectsStyle`, not visually diffed in OBS.
