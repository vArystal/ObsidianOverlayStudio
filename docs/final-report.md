# OBSIDIAN OVERLAY STUDIO — transformation report

Date: 2026-10-28. Baseline audited at `13a43a0`, final state `e593f5a`, eight checkpoints, all pushed to
`main` and to the deploying branch `arena/35be064d-jubilant-octo-lamp`.

- Frontend: https://varystal.github.io/jubilant-octo-lamp — bundle `index-DGoVjmNI.js`
- Backend: https://obsidian-overlay-api.pages.dev (Cloudflare Pages Functions + D1)
- Tests: **117 passing** (70 vitest, 28 legacy server, 19 Pages worker), `tsc -b` and `vite build` clean
- Code: 50 files, +2536 / −102 lines, 9 commits, per-phase notes in `docs/checkpoint-cp0..cp8.md`

## What each checkpoint changed, and how it was proven

| Phase | Problem found | Fix | Proof |
| --- | --- | --- | --- |
| CP0 audit | No evidence base; two of my own earlier claims were wrong | Full capability inventory of 15 element types; scaling claim retracted after measuring | `docs/audit-cp0.md`, browser harness |
| CP1 identity | Generic studio look, no type system | One design system, self-hosted Vazirmatn, Persian-first tokens | Rendered comparisons, token tests |
| CP2 guards | Shortcuts fired while typing; locked layers could move; silent data loss | Input-safe shortcuts, locked-layer immutability, debounced autosave | Drag/zoom probe, 8 handles, undo, reload persistence |
| CP3 widgets | Chat controls did nothing, countdown restarted each reload, viewer count coerced to offline | Real timestamp/badge/scrolling renderers, absolute-time countdown, four honest viewer states | 15-row capability matrix in `docs/checkpoint-cp3.md` |
| CP4 assets | 1.5 MB logo produced a 2.3 MB URL past Chromium's ~2 MB ceiling, while the UI claimed success | WebP optimisation with byte budgets, publish refuses an unopenable URL | 14 KB from a 10.9 MB PNG, 24,804-char URL |
| CP5 ingress | Forged events could burn the public-key budget; duplicate follows double-counted; receipts unprovable | Six-signature-time-correctness fixes, INSERT-OR-IGNORE claim, durable per-type counters | Live rejections: 401/400/413 for bad sig, bad version, huge body |
| CP6 OBS runtime | "Open output" only resolved in the authoring browser | Snapshot carried in the URL, size-annotated | Published URL renders 3/3 elements in a clean profile; scaling exact at 1080p/720p/900×1600 |
| CP7 quality | Invalid tablist, two contrast failures, API naming a foreign origin, crash detail in 500s | Real tabs with arrow keys, contrast fixes, strict CORS, scrubbed errors | axe 3 → **0** violations on all three surfaces |
| CP8 regression | New layers buried earlier ones; unconnected overlays blamed the Kick API | 120px cascade, "KICK NOT CONNECTED" state | 14/14 journey checks on production |

## The journey, measured on production (14/14)

Open → create overlay → add text, viewer count and chat → edit geometry → reload → reopen from the list
→ undo/redo → drive a widget → publish → open the published URL in a browser with empty storage →
reload it → feed it a garbage URL → no page errors. Reproducible: `node scripts/probes/cp8-journey-probe.mjs`
(`SITE=http://localhost:4319` to run against a local build instead of production).

## Open item: one organic Kick event has never arrived

The pipeline is built, deployed and hardened, and every ingress rejection is proven live. What is not
proven is the happy path, because no genuinely signed delivery has ever reached the server:
`last_event_at` is NULL, `event_counts` is `{}`, and the rows labelled TEST EVENT came from the app's own
test button, which does not touch the webhook route.

This cannot be forced from this side by design: a valid delivery requires Kick to sign a payload with a
key only Kick holds. One action closes it: post a single message in `kick.com/arystal/chat` (or have
someone follow the channel). After that I can report the received event, the rendered widget, and the
`event_counts` receipt.

## Documented limits, not defects

- GitHub Pages cannot serve CSP or other security headers for the app shell; the API does send
  `nosniff`, `no-referrer` and `no-store`.
- Pages Functions have no platform rate limiter; ingress resistance rests on signature verification plus
  the public-key refresh budget.
- axe covers automated WCAG 2 A/AA checks only; a manual screen-reader pass is still worth doing.
- Follower total is not in Kick's official API, so the UI reports it as unsupported rather than guessing.
