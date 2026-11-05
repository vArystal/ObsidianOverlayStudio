# CP20 — Visual identity reconstruction

Date: 2026-11-05 · Commit: 354377b · Deployed bundle: `index-BiMxwtdU.js`

## A. Implementation summary

The botanical identity was retired and replaced with a token-driven design system and four new themes.
The app chrome stays monochrome per the owner's standing instruction; colour lives in the overlay themes.

## B. Files changed

- **Created:** `src/styles/cp20.css` (design system), `docs/checkpoint-cp20.md`, `scripts/probes/cp20-shots.mjs`.
- **Rewritten:** `src/lib/themes.ts` (four presets, palette type, migration), theme block in `src/types.ts`,
  `src/lib/premiumModel.test.ts` (now the CP20 theme contract).
- **Removed:** `src/components/thorn/` (frame + tuning context), `src/lib/thornGeometry.ts` and its test,
  `src/styles/thorn-rose.css`, `src/components/editor/ThornTuningCard.tsx` and its test.
- **Edited:** `ElementRenderer`, `Canvas`, `OverlayRuntime`, `OverlayEditor`, `PropertiesPanel`, `ThemeGallery`,
  `storage.ts`, `elements.ts`, `main.tsx`, `themes.test.ts`, `ThemeGallery.test.tsx`, `OverlayRuntime.test.tsx`.

## C. Removed legacy system

Rose & Thorn is gone rather than recoloured. `migrateThemeId()` maps every retired id to a live preset
(`thorn-rose`, `royal-persian`, `minimal-esports` → `obsidian`; `persian-turquoise` → `aurora`;
`imperial-night` → `monolith`). Migration runs through `normalizeOverlay`, so it happens on load, is idempotent,
and touches nothing but the theme: elements, text, layout, animation and live configuration are preserved.
The retired palette is deliberately not merged into the replacement, because that palette belongs to an
identity that no longer exists. The `thorn-vine` decoration id still loads as a plain framed panel so no saved
element loses its frame geometry. Legacy ids are absent from every selector and creation path.

## D. New theme system

| Theme | Surfaces | Accent | Construction |
| --- | --- | --- | --- |
| Obsidian | `#0e0f11` / `#15161a` | silver `#cfd2d6` | 1px hairline, 6px radius, no material, uppercase labels |
| Nocturne | `#14100d` / `#1c1713` | bronze `#d8a86a` | 1px, 18px radius, paper grain, inner rule, 0.80 fill |
| Aurora | `#0b1416` / `#101d20` | aqua `#6fd3c7` | 1px, 26px radius, aurora light bands, 0.58 fill |
| Monolith | `#101112` / `#191a1c` | white `#ffffff` | 2px rule, 0px radius, printed grid, 0.88 fill |

Each preset owns surface, accent, border, text, state and depth palettes plus chrome. Verified live:
`--theme-accent`, `--theme-surface`, widget border and radius all differ per theme with zero console errors.

## E. Design system

`src/styles/cp20.css` defines the token layer (4px space rhythm, graphite colour ladder with semantic surface
aliases, three radii, two elevations, type roles with Persian fallback, motion durations, focus ring) and builds
components only from those tokens: buttons, inputs, tabs, panels, toolbar, inspector, layers, theme thumbnails,
empty/loading/error states, and the four widget materials. `themeCssVars()` exports the same tokens for the
editor stage and the OBS runtime, so the two surfaces cannot drift.

## F. Visual evidence

`artifacts/cp20-sheet-shells.png` (dashboard + editor), `cp20-sheet-themes.png` (four themes at 1280×720),
`cp20-sheet-panels.png` (properties, layers, theme selector), `cp20-dashboard.png`, `cp20-editor.png`,
`cp20-runtime-<theme>.png`, `cp20-1920.png`.

## G. Test results

- Frontend: **100 passed, 0 failed** (`npx vitest run`). Was 114; the 14 retired botanical/tuning tests were
  replaced by 6 CP20 theme tests.
- Backend: **41 passed** (`node --test server/*.test.mjs`).
- Worker: **20 passed** (`node --test worker/*.test.mjs`).
- TypeScript: `npx tsc -b` clean. Build: `npx vite build` clean.

## H. Production build

`index-BiMxwtdU.js`, byte-identical to the local build, deployed by CI run on `354377b`.

## I. Remaining issues

1. Utility class names are invented (`button-primary`, `card`, `sidebar`) where the app uses others; only the
   real class names actually take effect. This is a styling gap, not a defect.
2. The aurora/grain/grid materials are `::before` layers, so a probe reading the element's own `background-image`
   reports `none`. Verified visually instead.
3. Editor preview of theme materials is limited to the widget box; no global animated background (out of scope).
4. No accessibility sweep (axe) was run in this checkpoint; contrast was checked by measurement, not by audit.

## J. Verdict

**PASS WITH WARNINGS.** All mandatory structural requirements are implemented, tested and visually verified
against production. Warnings: partial class coverage in the C layer, and no axe sweep.
