# CP14 — Thorn & Rose

A fifth selectable theme. The four existing themes are untouched (`premiumModel.test.ts` pins both the
order of `THEMES` and the old Royal surface colour, so a regression there fails loudly).

## Palette

| token | value | role |
| --- | --- | --- |
| surface | `#0b1410` | near-black forest base |
| primary | `#1b3a2c` | deep forest panel |
| surfaceAlt | `#12211a` | raised panel |
| accent | `#c9a24a` | muted gold hairlines |
| accentSoft / text | `#f4efe4` | ivory type |
| glow | `#2f7a5f` | emerald |
| muted | `#a9b9ad` | sage |
| rose accents | `#b3425a` / `#7d2334` | blooms, never used for type |

## How the artwork is built

No raster assets and no new payload in the published snapshot: the frame is vector work in CSS and one
small React component.

- Two hand-drawn SVG tiles (`--thorn-h`, `--thorn-v`) — a weeping stem with thorns, three leaves with gold
  midribs and two highlight dots. Each edge is drawn from its own tile (`repeat-x` on top and bottom,
  `repeat-y` on the sides), so a 900px webcam frame and a 300px counter both keep the artwork at native
  proportions instead of stretching it.
- Three rose sprigs (`ThornRoseSprig`) placed at irregular offsets, sizes and rotations: 40px at the top
  22%, 33px at the bottom 17%, 28px on the right at 38%. They are deliberately not mirrored, which is
  what stops the frame reading as clip art.
- Depth from a translucent panel gradient, an inner gold hairline inset 7px, a soft drop shadow on each
  sprig, and two very slow breathing animations that are suppressed under `prefers-reduced-motion`.
- Content legibility is protected by the decoration's 24px padding plus a 20px edge band, so no vine ever
  crosses text, chat lines or counters. Persian geometric corner runners are replaced by the botanical
  edge art only for this theme.

## Integration

- `ThemeId` gains `thorn-rose`; both selectors (toolbar and inspector) now render `Object.values(THEMES)`
  instead of hardcoded options, so a future preset needs one edit.
- A new thumbnail gallery (`ThemeGallery`) sits under the theme preset: every theme is a card with a
  miniature of its real frame, Thorn & Rose drawing its own vine and bloom. Radio semantics, keyboard
  focus ring, `aria-checked` on the active card.
- Selection persists like any theme: it is part of the overlay record, survives reload, and travels into
  the published snapshot.

## Verification

`scripts/probes/cp14-theme-shots.mjs` seeds a 1600×900 overlay built entirely from Thorn & Rose widgets —
a wide webcam frame, a chat box, a compact counter, an alert panel — and asserts in Chromium:

- theme gallery shows 5 cards, active card "Thorn & Rose"; the saved overlay keeps `thorn-rose`
- editor preview: 4 widgets, 4 framed, 12 sprigs (3 per widget), vine tile present in `background-image`
- published output: page background stays `rgba(0, 0, 0, 0)`, widgets framed, edges resolved
- pixel census of the published screenshot: 724 stem-green, 80 rose, 1621 gold, 332 ivory samples, i.e.
  the artwork really renders rather than sitting in a stylesheet nobody applied
- 0 page errors

Two defects found by that probe and fixed: the data URI was unencoded (`<` and `>` silently invalidated
the whole declaration, so no vine drew at all), and `.decorated-widget.has-highlight` sets the
`background` shorthand with equal specificity, which erased the tiles — the `.thorn-framed` class now
raises specificity and keeps panel fill and vines in one stack.

Screenshots: `artifacts/cp14-editor.png`, `artifacts/cp14-editor-preview.png`, `artifacts/cp14-runtime.png`.
