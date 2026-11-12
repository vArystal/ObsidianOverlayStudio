# CP2 — Editor reliability, coordinate accuracy and save safety

Date: 2026-10-28. Branch: `arena/35be064d-jubilant-octo-lamp` (production).

## Scope

Prove the editor's core interaction contract rather than restyle it: logical coordinates must be
independent of zoom, undo must restore exactly, guards must prevent accidental edits, and no edit
may be lost between the canvas and storage.

## The defect this checkpoint found

The editor tracked a `dirty` flag, warned `beforeunload`, and had a Save button and Ctrl+S. It had
**no autosave**. A probe drag moved an element to `(505, 403)` on screen; storage still held
`(200, 200)`, and a reload put it back. Worse, the in-app navigation link unmounts the editor
without any prompt, so walking to the overlay library silently discarded the work. `beforeunload`
does not fire for hash-route changes, and browsers suppress it in many cases anyway.

This contradicts the mission's rule that a saved change survives refreshes and that user changes
are never silently discarded. CP0 had marked "autosave" as WORKING from the presence of
`saveOverlay` returning a `StorageResult`; that was an unverified inference and is corrected here.

### Fix

`src/pages/OverlayEditor.tsx`:

- Debounced autosave: 700 ms after the last edit while `dirty`, `save({ quiet: true })` writes to
  storage, clears `dirty`, and sets no toast.
- Quiet saves deliberately do **not** replace the live `overlay` object. A fresh identity mid-drag
  would interrupt the pointer session; the stored copy already holds the data.
- A failed save keeps `dirty` set and surfaces `saveError`, so the toolbar keeps reporting unsaved
  work and the next edit retries. Storage failure is never rendered as success.
- Synchronous flush on unmount: if storage differs from the in-memory overlay, it is written before
  the route change completes.

## Verification

Two probes, headless Chromium, production build served from `dist/`.

`scripts/probes/cp2-drag-zoom-probe.mjs` — snapping disabled so the numbers are pure mapping:

| Check | Result |
| --- | --- |
| Drag at fit zoom (`scale 0.3937`), screen delta 120×80 | logical 305×203 = `screen / scale` exactly |
| Drag at zoomed (`scale 0.7937`), same screen delta | logical 151×101 = `screen / scale` exactly |
| Undo (Ctrl+Z) after a drag | restored (505, 403) from (656, 504), one history step |
| Resize handle (SE) | 400×100 → 471×133, 8 handles present |
| Autosave without pressing Save | storage holds (505, 403) after 1.1 s idle |
| Reload | canvas returns at (505, 403) |
| Leaving via the nav link | storage holds the mid-drag position (657, 505) — flush works |
| Page errors | 0 |

`scripts/probes/cp2-editor-guards-probe.mjs`:

| Check | Result |
| --- | --- |
| Typing in the overlay-name field then Delete/Backspace | name became "Guard probe Rename", element count unchanged (2) |
| Clicking empty canvas | selection cleared |
| Ctrl+D then Ctrl+Z | 2 → 3 → 2 elements |
| Dragging a locked layer | position unchanged at (800, 300) |
| Layer visibility toggle (Layers tab) | canvas element count 2 → 1 |

Also re-ran the existing suite: vitest 44/44, `tsc -b` clean, production build green.

## Decisions

- **Autosave over save-on-exit only.** Relying on `beforeunload` cannot cover hash navigation,
  mobile task switches or crashes; a debounce plus an unmount flush covers all three.
- **Quiet saves keep local state authoritative.** Writing the returned record back mid-interaction
  would swap object identity under an active pointer session.
- **No new editor features in this checkpoint.** Multi-selection, grouping, clipboard copy/paste,
  align/distribute commands and canvas context menus remain **MISSING**; grouping would require
  defined serialization and transformation semantics first, which the mission itself requires
  before implementation. They are not blockers for the reliability contract and are recorded for a
  later checkpoint rather than bolted on here.

## Result

PASS for the reliability contract: coordinate mapping is exact at two zoom levels, undo/redo and
resize behave, guards prevent accidental edits, and edits now reach storage automatically and
survive both reloads and navigation away.
