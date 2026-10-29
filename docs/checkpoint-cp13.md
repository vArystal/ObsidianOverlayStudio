# CP13 — the Preview bug, and what actually needs a live stream

## Root cause of the disappearing elements

Preview was not a preview: it rendered the overlay through the **published runtime** path.

1. `Canvas.tsx` filtered `element.visible && element.includeInOutput` whenever `preview` was on. Webcam
   frames and game-capture guides are created with `includeInOutput: false` (they are alignment geometry
   for an OBS source), so Preview deleted them by design.
2. Every data-gated widget returned `null` in that same mode: chat with no messages, alerts with no
   event, the goal without its publish opt-in, the supporter slot with no provider. So a normal offline
   configuration lost most of its widgets.
3. The follower widget printed the literal string `Roya · TEST PREVIEW`, and the editor told the author
   "TEST PREVIEW · NOT A REAL KICK EVENT" over the alert template. That is the "TEST" text users saw;
   it had nothing to do with the channel being live.

## What changed

`ElementRenderer` now has three distinct modes instead of a boolean:

| mode | used by | behaviour |
| --- | --- | --- |
| edit | editor canvas | guidance chips, SAMPLE ONLY chat, instruction placeholders |
| preview | Preview button | every visible layer, clean of editor chrome, designed empty states, no fabricated data |
| runtime | published overlay | data or nothing; no instructions, no placeholders, no TEST text |

Preview no longer filters `includeInOutput`, and no gate hides an element in preview: chat shows its frame
with an empty-state line, alerts show their configured title and message, goal and supporter show their
manual values, webcam runs its camera flow or shows its frame, capture shows its transparent guide.
Selection handles, safe-area guides and the grid stay out of Preview; camera dialogs and instructions
never reach OBS because runtime keeps its own path.

The theme-level labels are gone: `TEST PREVIEW` is no longer printed in the editor, `Roya` is gone, and a
synthetic event is labelled only inside the opt-in `?test=1` source.

## Does an element need a live stream?

| element | needs | offline behaviour |
| --- | --- | --- |
| text · shape · frame | nothing | fully functional |
| counter · countdown · goal | nothing (manual values) | fully functional; goal stays hidden in OBS until "Publish manual sample value" |
| image | an uploaded file | fully functional locally and in the published snapshot |
| webcam (frame mode) | an OBS camera source behind it | transparent frame, alignable offline |
| webcam (camera mode) | browser camera permission | requests permission; `CAMERA BLOCKED` if refused |
| game capture | an OBS window/game source | transparent guide only; the browser cannot capture another app |
| chat · alerts · session follows · latest follower | a verified webhook event | element renders, waits for real data |
| viewer count | one Kick API call | live / stale / offline / unavailable states |
| supporter | a donation provider | none exists: excluded from output, stated in the inspector |

Each element now carries a "What this element needs" card in the inspector naming its requirement, so the
author does not have to start a stream to discover it.

## Verification

`scripts/probes/cp13-preview-audit.mjs` seeds one overlay containing all 15 element types, opens the
editor, toggles Preview and reads the DOM:

- editing: 15 layers, no TEST text
- preview: **15/15 layers**, 0 selection handles, 0 SAMPLE chips, badge "Preview · every layer, editor
  guides hidden", capture guide and webcam frame present, alert copy and chat empty state present
- 0 page errors

## Tests

99 vitest (7 new): preview shows every configured layer including editor-only and data-gated ones; the
follower widget never prints TEST; chat preview invents no messages; capture and webcam keep their
instructions out of runtime; the synthetic-alert label appears only in test mode.
