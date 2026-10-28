# OBSIDIAN OVERLAY STUDIO — transformation report

Date: 2026-10-28. Baseline audited at `13a43a0`, final state `a7dafc4`, eleven checkpoints, all pushed to
`main` and to the deploying branch `arena/35be064d-jubilant-octo-lamp`.

- Frontend: https://varystal.github.io/jubilant-octo-lamp — bundle `index-CFT5hws7.js` (matches the local
  build byte for byte, so there is no deployment drift)
- Backend: https://obsidian-overlay-api.pages.dev (Cloudflare Pages Functions + D1), redeployed with the
  CP11 heartbeat, verified live
- Tests: **128 passing** (80 vitest, 28 legacy server, 20 Pages worker), `tsc -b` and `vite build` clean
- Per-phase notes in `docs/checkpoint-cp0..cp11.md`

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
| CP9 first run | A browser with empty storage opened Integrations to a red ERROR badge and a dead Connect button | Backend origin compiled into the bundle, unconfigured builds report NOT_CONFIGURED without a request, durable signed-event receipts shown | Production: badge DISCONNECTED, real webhook endpoint, zero console errors |
| CP10 frame budget | Idle glow and sparkle repainted every frame: 47fps with 46 janky frames in a 33-layer overlay | Effects moved to their own compositor layers (opacity/transform only), paint containment, colour helper no longer crashes on a theme without colours | 60fps local, 59.8fps production, p95 16.8ms, 0 janky frames |
| CP11 stream repair | A fatal SSE close never retried, a silently dead channel was undetectable, and a state poll could relabel a dead stream | Backoff 1s..30s with error escalation, single-flight retries, 150s stall watchdog, real `heartbeat` events instead of invisible SSE comments | 45s injected outage: 5 retries, gaps 2s/5s/10s, recovered with no reload; pre-fix bundle: 0 retries |

## The journey, measured on production (14/14)

Open → create overlay → add text, viewer count and chat → edit geometry → reload → reopen from the list
→ undo/redo → drive a widget → publish → open the published URL in a browser with empty storage →
reload it → feed it a garbage URL → no page errors. Reproducible: `node scripts/probes/cp8-journey-probe.mjs`
(`SITE=http://localhost:4319` to run against a local build instead of production).

## Re-verified after CP10/CP11 (bundle `index-7DKdpXkL.js`)

The frame-budget and stream-repair work touched the runtime's rendering and its transport, so the earlier
evidence was re-run rather than assumed:

- Journey: 14/14 on production, no failures (`node scripts/probes/cp8-journey-probe.mjs`).
- Accessibility: axe re-run on library, editor and integrations. The first pass found a **critical**
  unlabelled button (`.overlay-thumbnail`, whose content is only decorative spans), now named
  `Edit <overlay name>` with a test; the second pass is 0 violations on all three surfaces.
- Deploy parity: the deployed bundle hash equals the local build, and CI succeeded for the commit.
- Backend: `/api/setup` answers normally and the events route emits `ready`, metric and `heartbeat` frames.

## Open item: one organic Kick event has never arrived

The pipeline is built, deployed and hardened, and every ingress rejection is proven live. What is not
proven is the happy path, because no genuinely signed delivery has ever reached the server. Re-checked at
21:20 Tehran on 2026-10-28: `last_event_at` is NULL, `event_counts` is `{}`, `processed` holds 0 rows, and
all 61 rows in `events` are `metric.viewer.updated` frames the backend generated itself. The rows labelled
TEST EVENT came from the app's own test button, which does not touch the webhook route.

The read side is therefore proven against the real Kick API (viewer status refreshed, channel identity,
subscriptions registered) while the write side waits for Kick to send something.

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

## CP12 — elements, test data, and what is honestly unsupported

Full detail in `docs/checkpoint-cp12.md`. Four defects were reproducible and fixed: synthetic events were
becoming data on air, the alert widget stopped rendering after 20 alerts, session follows showed a lifetime
total under a per-session caption, and an image with no source plus both capture guides published visible
boxes into OBS.

Verified against the deployed build (`index-BW-zMQC4.js`): the same element probe that runs locally was run
with `SITE=https://varystal.github.io/jubilant-octo-lamp` and returned identical results, the journey probe
is 14/14, accessibility is 0 violations on all three surfaces, and 89 tests pass with no page errors.

Honest limits recorded in the matrix: no donation provider exists, so the goal is manual and hidden unless
explicitly published and the supporter slot never publishes; Kick exposes no follower total, so only the
latest follower is shown; a browser cannot capture another application's window, so game capture stays a
transparent layout guide; and OBS must grant camera access for the browser camera mode, otherwise the
output says CAMERA BLOCKED rather than showing a stale frame.
