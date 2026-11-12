# CP23 — Typography Studio

## What changed
- `src/lib/typography.ts` — family registry, normalisation, eight presets, and the only text style builders in the app.
- `src/components/editor/TypographyStudio.tsx` — the studio panel (search, previews, weights, size, colour, advanced).
- `src/styles/fonts.css` — 34 faces across 13 families, split by `unicode-range` (latin / arabic).
- `src/assets/fonts/` — every `.woff2` plus its OFL licence text.
- `src/components/ElementRenderer.tsx` — the text element is painted by `typographyStyle()` + `textBoxStyle()`.
- `src/lib/storage.ts` — `normalizeTypography()` fills absent keys only; stored stacks are never rewritten.

## Measured
- Editor/OBS parity, seven test lines (Latin, condensed, Persian, mixed, mono, serif, outlined): identical
  computed family, weight, size, leading, tracking, alignment, direction, colour, shadow and stroke.
- 60fps, p95 17ms at 1920×1080 with seven typographic elements visible.
- axe: 0 violations on the studio and on the mobile editor drawer.
- 18 of 34 faces requested on an editor load carrying seven families; unused weights are never fetched.

## Bug found by the probe
The prop setter spread `selected.props` captured at render time, so a preset writing ~20 keys kept only the last
key. The element looked untouched. Fixed with a batched, functional prop patch (`onPropPatch`).

## Known limits
- No italic faces ship, so no italic control is offered (a toggle would have been a dead control).
- Latin-only families render Persian through glyph fallback to Vazirmatn; the studio states this in the status line.
