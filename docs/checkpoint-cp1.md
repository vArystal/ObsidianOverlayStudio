# CP1 — Design system and application surface redesign

Date: 2026-10-28. Branch: `arena/35be064d-jubilant-octo-lamp` (production).

## Scope

Replace the generic violet-on-grey admin look with a coherent studio identity (royal aubergine,
refined gold, warm ivory, restrained girih ornament) and give every shared surface a single
token source, without touching overlay artwork, stored overlays, routes or the runtime contract.

## Evidence before implementation

- `src/styles.css` + `src/premium.css` held 192 distinct hex literals across a neutral grey and
  `#8b5cf6` violet palette; no design tokens, no semantic scale.
- `index.html` and both stylesheets contained **no font loading at all**, while element defaults
  asked for `Vazirmatn`. Every Persian label therefore rendered in a fallback face: the "premium
  Persian" claim was not backed by a font that existed in the page.
- Destructive delete used `window.confirm`, which ignores the design system and cannot be styled.

## Implementation

| File | Change |
| --- | --- |
| `src/assets/fonts/*.woff2` | Self-hosted Vazirmatn 400/500/700 and Playfair Display 600 (≈176 kB total). No third-party request at stream time, works offline in OBS. |
| `src/styles/fonts.css` | `@font-face` declarations with `font-display: swap` and Persian/Arabic unicode ranges. |
| `src/styles/tokens.css` | Full token set: aubergine ramp, royal and gold ramps, ivory text, semantic states, surfaces/hairlines, type scale, spacing, radii, shadows, motion, density. Legacy variable names (`--bg`, `--accent`, `--line`, …) are re-pointed at the new palette so every pre-existing rule inherits the identity. |
| `src/styles/studio.css` | Studio surface layer: ornamented ground, gold-hairline header, display-serif headings, gold primary buttons with dark ink text, aubergine panels and cards, field focus rings, status pills, empty states, scrollbars, dialog, and explicit runtime-safety rules (`body.runtime-root` stays transparent with no background image). |
| `src/components/ConfirmDialog.tsx` | Accessible confirmation dialog (`role="dialog"`, `aria-modal`, labelled heading, Escape and backdrop cancel, focus on confirm). |
| `src/pages/OverlayList.tsx` | Delete now routes through the dialog; thumbnail tints use tokens; new four-tile workspace summary (compositions, layers, published, Kick connection from the real integration config); onboarding empty state teaches the three real steps. |
| `src/styles.css` | Base font now resolves from the token layer instead of hardcoding Inter. |

## Verification (measured, not asserted)

`scripts/probes/cp1-visual-probe.mjs`, headless Chromium, production build served from `dist/`.

| Check | Result |
| --- | --- |
| Fonts actually loaded | `Vazirmatn:400/500/700 loaded`, `Studio Display:600 loaded`, `document.fonts.check` true for both families |
| Heading type applied | `h1` computed family = `"Studio Display", Vazirmatn, Georgia, serif` |
| Library renders | 2 seeded overlays → 2 cards, 4 summary tiles |
| Horizontal overflow | 0 px at 1440×900 and at 390×844 |
| Contrast (WCAG) | ivory/ink 18.27, muted/ink 9.15, ivory-300/surface 11.73, gold-300/ink 14.57, button text on gold 8.24 |
| Delete dialog | opens, focus lands on "Delete overlay", Escape closes it, both overlays still in storage afterwards |
| Published runtime isolation | body background `rgba(0,0,0,0)`, `background-image: none`, 0 overflow — the studio ground does not leak into OBS output |
| Uncaught page errors | 0 across library, integrations, editor, runtime |
| Automated tests | vitest 44/44, tsc clean, build green |

Screens captured for the record: `artifacts/cp1/{library,integrations,editor,runtime,dialog,library-390}.png`.

## Decisions

- **Self-hosted fonts over a CDN link.** A Google Fonts request would add a third-party dependency and
  a failure mode inside OBS. 176 kB of woff2 is cheaper than a missing typeface at stream time.
- **Legacy variable alias remap instead of rewriting 192 literals.** One token file changes the palette
  everywhere; component rules keep working, so no layout behaviour moves in a design checkpoint.
- **Tokens only for UI chrome.** Overlay content classes are untouched by `studio.css`, so user artwork
  colours (element defaults such as `#d8ad55` on `#170b20`) remain exactly as saved.

## Honest gaps (not done in CP1)

- Asset library is still **MISSING**; images remain data-URLs held in local storage (CP4).
- Preview/diagnostics surface is unchanged beyond styling (CP6).
- Persian **UI** is not localised because the product has no UI i18n layer; Persian exists in element
  content. Adding a UI locale switch would be new product scope, not a redesign.
- Remaining raw hex literals in `styles.css`/`premium.css` are unchanged; the token layer covers the
  shared chrome and the palette, but a full literal sweep is tracked for CP7 cleanup.

## Result

PASS for the design-system foundation and shared surfaces. Screens that are structurally finished
(library, integrations, editor chrome, runtime) render in the new identity with measured contrast,
loaded type and no overflow. Element-completeness and asset work continue in CP3/CP4.
