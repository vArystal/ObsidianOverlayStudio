# CP43 — The motion-background drawer no longer empties the element rail

`npm run check` green: 311 vitest, 54 server, 34 worker, contract PASS.

## What the owner reported
"After we turn on the motion background button, the element section got empty and nothing appears on the overlay."

## What was measured
With the background drawer open, the widget list is squeezed by the drawer body, which used to be a `<details>`
body of **608px mounted inside the footer**:

| viewport | list height, drawer open | widgets visible |
| --- | --- | --- |
| 1600x1000 | 322px | 8 |
| 1366x768 | 197px | 6 |
| 1093x614 (125% zoom) | 114px | 4 |
| 900x600 | 80px | 4 |

On the pre-CP42 build the same drawer body was 608px tall, so opening it left the list with almost no height: an
empty-looking section with headings scrolled out of view. That is the "element section got empty" report.

## Fix
- The drawer body is now an overlay: `position: absolute; bottom: 100%`, capped at `min(58vh, 420px)` with its own
  scroll and a shadow. It floats above the rail instead of shrinking it.
- `.editor-panel > .panel-scroll { min-height: 180px }` so the widget list always keeps a usable floor.
- Drawer content still mounts only while open (CP42), so a closed drawer costs nothing.

## What was NOT the cause
- The renderer is fine: every one of the six scenes renders with elements present, `z-index: 2` above the
  background's `z-index: 0`, zero page errors, at 1600x1000.
- `none` is not a registered scene, so `normalizeBackground` already resolves a stored `none` to `aurora-flow`;
  an enabled background always paints something. A test now pins that instead of a dead promotion branch.
- Still unproven: "nothing appears on the overlay" as seen by the owner in OBS. If their published snapshot predates
  the elements, or the OBS browser source is cached, the output can lag the editor. Needs their screenshot.
