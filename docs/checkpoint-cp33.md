# CP33 — Hook safety and build guardrails

Branch `cp33-hook-safety`, three commits. Base: `f7ee685`.

## 1. Hook after early returns (the actual defect)

**Defect.** `DecoratedWidget` in `src/components/ElementRenderer.tsx` called `useLiveData()` *after* two early
returns (`children === null`, `!decoration?.enabled`), and the value was never read. Turning decoration off and
on changed the number of hooks between renders of the same component instance, which React treats as a fatal
order violation and which unmounts the element instead of re-rendering it. The dead call also meant the
component subscribed to the live-data context it did not use.

**Fix.** The call is removed, along with `useLiveData`'s import path staying intact for the components that do
read it. No behavioural change is intended: the value had no reader.

**Regression test.** `src/components/ElementRenderer.test.tsx` "survives decoration being switched off and on":
renders a decorated text element, flips `decoration.enabled` true → false → true, asserts the markup returns
byte-identically to the first render and that `console.error` saw nothing.

**Honest note on that test.** It passes against the pre-fix file. React 18 tolerates a single `useContext`
appearing after an early return in this render sequence, so the behavioural test alone does not prove the fix.
The test that does fail before the fix is the source guard below, verified by swapping the pre-fix file back in.

## 2. Dead code removed

- `themeCssVars` import in ElementRenderer (unused).
- `testAlertNonce` threading: `ElementRendererProps.testAlertNonce` and `ElementContent`'s parameter are gone.
  Canvas still owns the nonce and still uses it as a remount key, which is where it has an effect.
- `LiveAlert`'s `preview` parameter, which the component ignored in favour of `runtime`.
- Fallout from the new compiler flags, fixed at source: unused lucide icons in `PropertiesPanel`, `Sparkles` and
  `LiveOverlayEvent` in ElementRenderer, `useMemo` in AlertRuntime, an unused type import in AlertStage,
  `LiveChatMessage`, an unused `giftees` local in `alertPayload`, `getTheme` in a test, `migrateThemeId` in
  storage, `useNavigate` in the editor, and five unused destructured fixtures in `widgets.test.tsx`.

## 3. noUnusedLocals and noUnusedParameters

Both are on in `tsconfig.app.json`. `npx tsc -b` is clean with them enabled. One deliberate exception is
documented rather than silenced: `Canvas.tsx` keeps its `MotionHost` import, which CP35 needs for the canvas
wiring, and references it through an exported `CANVAS_MOTION_HOST` constant with a comment saying why. No
`any`, no `@ts-ignore`, no rule weakened.

## 4. Hook-order guard

`src/lib/hooksOrder.test.ts` reads every non-test `.tsx` under `src` through `import.meta.glob` (no Node types
needed), splits each file into top-level function blocks, and fails when a top-level `return` precedes the first
top-level hook call. It contains two self-checks: it must flag the exact pre-fix `DecoratedWidget` shape, and it
must accept a hook placed before the return.

Verified against real code: with `git show HEAD:src/components/ElementRenderer.tsx` restored, the guard fails
naming `DecoratedWidget`; with the fix in place it passes. A scan of the other 30 component files reports no
violations. `AlertProvider` and `StateLine`, which an earlier crude scan flagged, are clean: neither calls a hook.

## Commands and output

```
npx tsc -b                     # clean with noUnusedLocals + noUnusedParameters
npx vitest run                 # 248 passed, 31 files
node --test server/*.test.mjs  # 49 pass, 0 fail
node --test worker/index.test.mjs  # 34 pass, 0 fail
npx vite build                 # built in 353ms
npm run check                  # all of the above, green
```

Pre-fix proof:

```
git show HEAD:src/components/ElementRenderer.tsx > src/components/ElementRenderer.tsx
npx vitest run src/lib/hooksOrder.test.ts
  -> FAIL, violation: component "DecoratedWidget"
```

## Not verified

- The decoration toggle is exercised in jsdom only. I did not reproduce the crash in a real browser before the
  fix, because the pre-fix code did not throw in this specific sequence; the crash React would raise depends on
  the hook that appears, and a `useState`/`useEffect` there would throw where `useContext` did not. The source
  guard covers the class of bug rather than one reproduction.
- `noUnusedParameters` currently surfaces no errors, so nothing was proven beyond it being enabled. It is on
  and will catch the first violation.
- Deployment was not run: this phase changed no runtime behaviour and the owner asked for branch work.
