# CP39 — One typography vocabulary, one normalisation policy

`npm run check` green: 293 vitest, 50 server, 34 worker, contract PASS for both backends, tsc and vite clean.

## 1. One font vocabulary

Three vocabularies existed: registry ids, raw CSS stacks written by two inspector dropdowns, and the legacy
`'Vazirmatn, Tahoma, sans-serif'` default. Now:

- `src/components/FontSelect.tsx` is the only font picker, used by the chat inspector, the decoration "Content
  font" field, `WidgetSettings`' typography group and the alert studio. All of them store a registry id.
- `createElement('text')` defaults to `vazirmatn` instead of a stack.
- `storage.ts:migrateFontId` rewrites a saved stack to its id **only when it resolves to a shipped family**. A stack
  nobody ships (say `Comic Sans MS`) is left verbatim and still reported as missing, so the honest "font missing"
  state cannot be masked by a migration.
- Renderers resolve through `fontStack()` and nothing else. This was the defect the parity test caught: chat and
  the decorated wrapper painted `font-family: inter` (an id, not a CSS family), so the migration would have
  silently dropped them to the browser default. `schemaPolicy.test.ts` now renders a legacy text layer and a legacy
  chat layer before and after migration and compares the markup byte for byte.

## 2. Registry-driven normalisation

`src/lib/propSchema.ts` validates props against the widget registry (type, band, enum, default), with the shared
bands in a leaf module `propRanges.ts` so typography can clamp without importing the widget registry.

- `normalizeWidgetProps` merges declared defaults and coerces every declared key; keys a definition does not name
  are kept but bounded (a newer build cannot lose data, a hostile one cannot smuggle a megabyte).
- `normalizeLooseProps` applies the same policy to shapes, images, frames and capture guides, which have no
  declared defaults.
- `normaliseAnimationValues` clamps the animation block, which used to be a raw spread: `duration: -5`, `1e9` and
  unknown enums can no longer reach the canvas.
- Typography clamps at storage time as well as read time, using the same bands, so what is saved is what the
  inspector can show again.

Applied on load, on snapshot decode and on duplicate/paste. Values that are not numbers at all (`Infinity`) fall
back to the declared default rather than being clamped to an edge, because there is no edge to clamp them to.

## 3. Save-time budget

`saveOverlay` now measures the serialised list and refuses a save whose snapshot the runtime could never open,
returning the same message publish uses and writing nothing. Previously such an overlay was stored happily and only
explained at publish, or failed later as a quota error.

## 4. Alert prop migration

`migrateAlertElementProps` folds the orphaned element props (`title`, `message`, `imageSrc`, `soundName`,
`soundEnabled`) into `overlay.alerts.templates`, then strips all seven (including `eventTypes` and `provider`, which
are derived from `ALERT_KINDS` now). A template the author already customised is never overwritten: the legacy
value only wins where the template still equals the shipped default. `createElement('alert')` no longer writes them.

## Not verified

- The render-parity proof covers text and chat, not every element type.
- The save budget is proven against the snapshot block size, not against a real browser quota exception; the test
  asserts nothing is written when the save is refused.
