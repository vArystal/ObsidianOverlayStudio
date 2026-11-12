# CP41 — Performance, mobile UX, repository hygiene

`npm run check` green: 309 vitest, 54 server, 34 worker, contract PASS, tsc and vite clean.

## 1. Undo/redo is exact under StrictMode

The editor pushed a snapshot from inside a `setOverlay` updater and drove undo/redo by nesting `setOverlay` inside
`setPast`/`setFuture`. React calls an updater twice in StrictMode to prove it is pure, so every edit recorded two
snapshots and the first undo appeared to do nothing.

History now lives in `src/lib/history.ts` as three pure transitions (`pushHistory`, `undoHistory`, `redoHistory`) and
the editor keeps the resulting state in a ref plus a render nonce. No transition runs inside an updater, so a double
invocation cannot change the answer, and `history.test.ts` asserts exactly that (same base, same input, one entry).

The `JSON.stringify(a) === JSON.stringify(b)` guard ran on every keystroke and cost the whole document, including
base64 images that never change during an edit. `src/lib/overlayDiff.ts` compares the fields that decide whether the
document renders or saves differently, taking a pointer shortcut on every untouched nested value and descending at
most six levels, so an untouched image is one identity check.

Decision on the DOM-level StrictMode proof: `OverlayEditor.test.tsx` asserts that a double mount leaves Undo and Redo
disabled (the phantom entry was the visible symptom). Exactness of each transition is proven at the transition level,
because a DOM test of counts was measuring the fixture's starter layers rather than the history and would have been a
test of the test.

## 2. Resize clamps before it applies the ratio

`Canvas` applied the aspect ratio to the raw pointer delta and clamped afterwards, so dragging past an edge shortened
one side and broke the ratio. `resizeWithAspect` in `geometry.ts` clamps first, re-derives the free dimension from the
clamped one, keeps the undragged edge pinned, and clamps once more so the anchor correction cannot leave the layer
outside the canvas. `geometry.test.ts` covers the east and west drags that used to break 2:1, the minimum-size case,
and a layer that does not maintain its ratio (unchanged behaviour).

## 3. Changing the canvas size re-clamps every layer

`applyCanvasSize` clamps each element into the new bounds, for presets and for the custom dialog alike. Previously a
smaller canvas left layers sitting outside it, visible in the inspector but never in the output.

## 4. One texture source

`styles/tokens.css` now holds all six materials, including `texture-aurora`, which only `cp20.css` defined. `cp20.css`
redefined grid, grain, hatch and sheen with different values, so which material you saw depended on import order
(`tokens` then `cp20`, so the later one won). The duplicate block is gone, `main.tsx` states the order as a rule, and
aurora's teal sheen became a white one to stay inside the monochrome identity. This is the only intentional visual
change in the phase: the grid is now the token sheet's 22px/.85 rather than cp20's 26px/.5.

## 5. No native dialogs

`window.prompt` is gone from rename and from custom canvas size. Both use the new `InputDialog`: labelled fields,
per-field numeric bounds, an inline error naming the allowed range, Escape and backdrop cancel, and 44px hit targets.
`server/nativeDialogs.test.mjs` fails the build if `window.prompt`, `confirm` or `alert` is ever called again
(comments stripped first, because the replacements describe themselves in prose).

## 6. Repository hygiene

- `artifacts/` (20MB, 103 files, 107 including nested directories) left the source tree for the `assets-screenshots`
  orphan branch, and `artifacts/` is gitignored because probes still write there at runtime.
- Not done: purging those blobs from history. A fresh clone still carries ~20MB until someone force-pushes a
  rewritten history, which would re-write the branch Pages deploys from. The command, if you want it:
  `git filter-repo --path artifacts --invert-paths` (or `git filter-branch --index-filter 'git rm -r --cached --ignore-unmatch artifacts' -- --all`).
- Default branch: `main` is now fast-forwarded to the current work. Changing which branch GitHub treats as default is
  a repository setting, not a git operation, and there is no authenticated CLI in this sandbox; it is one click in
  Settings ▸ General ▸ Default branch.

## Not verified

- The StrictMode proof is at transition level plus a double-mount assertion, not a full DOM undo journey.
- The texture change (#4) is a deliberate visual delta, not verified against a saved screenshot diff.
