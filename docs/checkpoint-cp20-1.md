# CP20.1 — Design system hardening

Verdict: PASS

## 1. CSS integrity

`src/styles/cp20.css` was rewritten against real markup. The CP20 draft carried 25 class tokens with no
markup match; 24 of them were removed or replaced with the classes the application actually renders.
(`texture-*` and `static-motion` are applied at runtime from theme chrome, so they stay.)

| Draft selector (inert) | Replacement |
| --- | --- |
| `.card`, `.panel`, `.section-card` | `.editor-panel`, `.integration-card`, `.panel-heading` |
| `.sidebar` | `.left-panel`, `.right-panel` |
| `.topbar` | `.app-header` |
| `.toolbar` | `.editor-toolbar`, `.toolbar-button` |
| `.editor-page`, `.settings-page` | `.app-shell`, `.library-page`, `.integrations-page` |
| `.properties-panel` | `.right-panel`, `.properties-scroll` |
| `.section-title`, `.page-title`, `.field-label` | `.panel-heading`, `.inspector-title`, `.eyebrow` |
| `.panel-row` | `.layer-row`, `.layer-copy` |
| `.empty-state` | `.panel-empty`, `.empty-library`, `.receipts-empty` |
| `.loading-bar`, `.metric-value` | removed: no such element exists |
| `.button-primary` | `.primary-button` |

Block count went from 55 to 67, class tokens from 55 to 55 with zero dead. New coverage that CP20 lacked
entirely: `.app-header`, `.main-nav`, `.library-toolbar`, `.panel-tabs`, `.layers-list`, `.canvas-stage`
consumers, `.dialog`, `.dialog-backdrop`, `.dialog-actions`, `.publish-modal`, `.modal-close`,
`.layer-copy`, `.panel-empty`.

## 2. Accessibility (axe-core 4.10.2, WCAG 2.1 A+AA)

Probe: `scripts/probes/cp201-axe.mjs`. It records what it audited and self-tests the detector by injecting a
known low-contrast control, so a zero cannot be a false zero.

| Surface | Nodes | Dialogs | Violations (before) | Violations (after) |
| --- | --- | --- | --- | --- |
| Dashboard | 101 | 0 | 0 | 0 |
| Editor | 534 | 0 | 0 | 0 |
| Theme selector | 534 | 0 | 0 | 0 |
| Publish dialog | 568 | 2 | 1 critical | 0 |

Fixed: `button-name` (critical) on `.modal-close` in `OverlayEditor.tsx` — an icon-only close button with no
accessible name. It now carries `aria-label="Close publish dialog"` and the icon is `aria-hidden`.

## 3. Regression test integrity

114 -> 100 was exactly 14 tests: 8 in `thornGeometry.test.ts` and 5 in `ThornTuningCard.test.tsx` (both files
deleted with the retired art system, every case asserting `buildFrameSpec` geometry or thorn CSS variables) and
1 in `premiumModel.test.ts` (the Thorn & Rose preset case). No unrelated coverage was removed.

Restored as 8 new cases in `src/lib/migration.test.ts`: all five legacy ids migrate, migration is idempotent,
unknown ids fall back to the default preset, `normalizeOverlay` preserves elements/size/live config, an overlay
still carrying `thorn` tuning and the `thorn-vine` decoration loads, every preset has a complete palette, the
monochrome rule holds (no `#000000` surface, no purple accent), and `themeCssVars` emits runtime variables.

`src/types.ts` diff outside the theme region is comments and whitespace only; `OverlayElement`,
`DecorationPresetId`, `LiveIntegrationConfig`, `CanvasSettings` are untouched.

## 4. Runtime verification

Probe: `scripts/probes/cp201-runtime.mjs`, four themes, editor and public runtime.

| Theme | Accent (runtime = editor) | Radius | Transparent | OverflowX | Console errors |
| --- | --- | --- | --- | --- | --- |
| Obsidian | #cfd2d6 = #cfd2d6 | 6px | yes | no | 0 |
| Nocturne | #d8a86a = #d8a86a | 18px | yes | no | 0 |
| Aurora | #6fd3c7 = #6fd3c7 | 26px | yes | no | 0 |
| Monolith | #ffffff = #ffffff | 0px | yes | no | 0 |

## 5. Tests and build

- vitest: 108 passed, 0 failed
- server (node --test server): 41 passed
- worker (node --test worker): 20 passed
- `tsc -b`: clean
- `vite build`: clean

## 6. Remaining issues

- axe covers dashboard, editor, theme selector and the publish dialog. ConfirmDialog and the mobile editor
  drawer were not audited separately.
- Colours are validated by rule (no black, no purple, contrast) rather than by a full design review.
