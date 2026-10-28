# CP0 — Baseline audit and feature inventory

Date: 2026-10-28. Scope: the repository as deployed, before any transformation work.
Everything below was read from the actual code or measured against the live deployments.

## 1. Environment and deployment facts

| Item | Value | How verified |
| --- | --- | --- |
| Repository | `vArystal/jubilant-octo-lamp` | git remote |
| Local branch | `arena/35be064d-jubilant-octo-lamp` | `git branch --show-current` |
| **Production branch** | **`arena/35be064d-jubilant-octo-lamp`**, path `/`, build type `workflow` | GitHub Pages API `/repos/.../pages` |
| Default branch | `main` (not deployed) | GitHub API |
| Frontend | https://varystal.github.io/jubilant-octo-lamp/ → HTTP 200 | curl |
| Backend | https://obsidian-overlay-api.pages.dev (`/api/setup` → `DISCONNECTED`, missing `[]`, problems `[]`) | curl |
| Deployed bundle | `index-CUa06eTu.js` — byte-for-byte the same hash as a fresh local build | `npm run build` vs live HTML |
| Kick connection | live: channel `arystal`, 8 subscriptions, no webhook error | D1 query + official `/public/v1/channels` with the stored token |

The live deployment is therefore in sync with this working tree: no drift to reconcile before starting.

## 2. Architecture map (from the code, not from documentation)

- **Frontend** React 19 + Vite, `createHashRouter`, five routes: `/overlays`, `/overlays/editor/:id`, `/integrations`, `/overlay/:publicId`, catch-all → `/overlays`.
- **Editor model** `src/lib/elements.ts` + `src/types.ts`: `Overlay` → `OverlayElement[]`, 15 element types, per-element `animation` and `decoration` records, 4 themes, 6 decoration presets.
- **Persistence** `src/lib/storage.ts`: all overlays in `localStorage` under `obsidian-overlays-v1`; `normalizeOverlay` merges defaults so older saved records survive; `sanitizeOverlayForPublish` strips forbidden keys (tokens, secrets, passwords) before publication.
- **Publication** `encodeOverlaySnapshot` → lz-string → `#/overlay/<publicId>?snapshot=...`. A published URL carries its own design; without a snapshot the runtime falls back to `getOverlayByPublicId` in local storage.
- **Runtime** `OverlayRuntime.tsx` + `LiveDataProvider.tsx`: stage scaled by `min(vw/W, vh/H)`, SSE at `/api/runtime/:key/events`, state poll at `/api/runtime/:key/state` every 60s, event dedupe by id, bounded queues (50 messages, 20 alerts, 500 seen ids).
- **Backend** `worker/index.mjs` (781 lines), deployed as Pages Functions through `worker/pages/_worker.js`: 11 explicit routes plus two parameterised runtime routes; D1 tables `connections`, `oauth_states`, `exchanges`, `publications`, `events`, `processed`.
- **Legacy second backend** `server/*.mjs` (Node, donations/event-bus/kick-client, 5 test files, 28 tests) — still in the repository and still tested by `npm test`. It is not deployed; the frontend does not call it. Kept for reference; must not be confused with the live Pages Functions.
- **Design layer** `src/styles.css` (446 lines) + `src/premium.css` (180 lines) + `src/lib/themes.ts`.

## 3. Baseline measurements (before changes)

| Check | Result |
| --- | --- |
| Frontend tests (vitest) | 10 files, **44 passed** |
| Legacy server tests (node:test) | **28 passed** |
| Worker/Pages tests (node:test) | **17 passed** |
| Total automated tests | **89 passed, 0 failed** |
| `npm run build` (tsc -b + vite) | green, 357.5 kB JS / 51.9 kB CSS |
| Live `/api/runtime/<key>/state` | 200, viewer `{status:"offline",count:null}`, `followerTotal {supported:false}` |
| Live `/api/runtime/<key>/events` | 200 `text/event-stream`, `retry: 2000`, `ready` frame, replayed `metric.viewer.updated` by `seq` |
| Live `/api/setup` | `DISCONNECTED`, no missing keys, no problems |

Coverage gaps (no test today): canvas drag/resize at non-100% zoom, layer reordering, publish→runtime round trip with a snapshot, real webhook payload → element update, OBS sizing, RTL layout assertions, image upload limits.

## 4. Feature inventory

Status legend: **WORKING** (exercised and correct), **PARTIAL** (works with a known gap), **BROKEN** (present but defective), **MOCK** (deliberate placeholder), **MISSING**, **BLOCKED** (needs an external thing to verify).
Evidence column states how it was established: `code`, `test`, `live`, `browser`.

### 4.1 Application shell and screens

| Feature | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Route map / deep links | WORKING | code | Hash router, catch-all redirect |
| Overlay library (list, search, duplicate, delete, empty state) | WORKING | code, test | Delete uses native `confirm()` — replace in CP1 |
| Create overlay → editor | WORKING | code | `createEmptyOverlay` seeds theme + defaults |
| Integrations screen | WORKING | live | Shows backend URL, save+check, connect, disconnect, resubscribe, test event |
| Runtime page | PARTIAL | code, live | Renders and streams; scaling defect D2 |
| Onboarding / first-run guidance | MISSING | code | Empty state only |
| Global error surface | PARTIAL | code | Per-screen messages, no crash boundary |

### 4.2 Editor

| Feature | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Canvas zoom / pan | PARTIAL | code | Controls exist; coordinate mapping at zoom needs browser proof (CP2) |
| Snapping / grid / safe area | WORKING | code | Snap + grid toggles bound to `CanvasSettings` |
| Drag, resize, rotate handles | PARTIAL | code | Rotation field exists; handle behaviour at zoom unproven |
| Multi-selection / grouping | MISSING | code | Single `selectedId` only |
| Undo / redo | WORKING | code | 60-entry history, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y |
| Keyboard shortcuts | WORKING | code | Delete, duplicate, save, undo/redo; ignored while typing |
| Layers panel (order, visibility, lock, rename, duplicate, delete) | WORKING | code, test | |
| Inspector ↔ element binding | PARTIAL | code | Most controls bind; three do nothing (D1) |
| Autosave + explicit save + reload recovery | WORKING | code, test | `saveOverlay` returns `StorageResult`; failure surfaces an error |
| Preview toggle | WORKING | code | Hides chrome, clears selection |
| Publish (snapshot URL + copy) | WORKING | code | Copy path is the published link |

### 4.3 Elements (all 15)

| Element | Status | Evidence | Contract / limitation |
| --- | --- | --- | --- |
| Text | WORKING | code, test | Content, family, size, weight, colour, align, line-height, direction |
| Image / Logo | PARTIAL | code | Data-URL only; device-bound and grows the published URL (D4) |
| Shape / Border | WORKING | code | Fill, stroke, radius |
| Decorative frame | WORKING | code | Decoration presets, corners, inner border, pattern |
| Webcam frame | MOCK | code | `includeInOutput:false` guide frame; must be added as an OBS source |
| Capture frame | MOCK | code | Same; label already says "ADD IN OBS" |
| Kick chat | PARTIAL | code, live | Real SSE messages; `showTimestamps`, `showBadges`, `scrolling` have no effect (D1) |
| Kick event alert | WORKING | code, live | Follow/sub/renewal/gift/kicks mapped; test events marked TEST |
| Donation goal | MOCK | code | `dataSource: 'preview'`, no provider exists — must read as manual |
| Custom counter | WORKING | code | Manually maintained value |
| Countdown | PARTIAL | code | Duration-based, restarts on reload; no target-time anchor (D3) |
| Latest supporter | MOCK | code | Renders "Donation provider not connected" — honest |
| Viewer count | WORKING | live | Official metric, `offline`/`stale` states preserved, never coerced to 0 |
| Session follows | WORKING | code | Counts genuine `channel.followed` since runtime start |
| Latest follower | WORKING | code | Real event only, explicit empty state |
| Follower total | MISSING (by design) | live | Public API exposes no total; surfaced as `{supported:false}` |

### 4.4 Kick integration (live)

| Capability | Status | Evidence |
| --- | --- | --- |
| OAuth 2.1 + PKCE, state row, exact redirect URI | WORKING | live (real authorization completed) |
| Exchange code redemption | WORKING | live |
| Token sealing (AES-GCM) at rest | WORKING | code, live (decrypt + official API 200) |
| Management token in tab storage, never in URL of the runtime | WORKING | code, test |
| Webhook signature verification, replay window, dedupe | WORKING | code, test |
| Eight subscriptions, idempotent reconnect | WORKING | live, test |
| SSE delivery + seq replay | WORKING | live |
| Lazy viewer refresh (Pages has no cron) | WORKING | live |
| Disconnect / resubscribe / test event | WORKING | code, live |
| Real chat / follow event end to end | BLOCKED | waiting for organic events on `arystal` |

### 4.5 Runtime / OBS

| Capability | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Transparent background, no chrome, no scrollbars | WORKING | browser | html/body `rgba(0,0,0,0)`, `scrollWidth == innerWidth` at all three viewports, zero page errors |
| Native 1920×1080 sizing | WORKING | code | scale = 1 |
| Non-native viewport fit | WORKING | browser | Measured at 1920×1080, 1280×720 and 1000×1000: element rects equal design coords × `min(vw/W, vh/H)` exactly (e.g. 400×100 @ (100,100) → 208×52 @ (52,52) at 0.521). Stage is anchored top-left with `transform-origin: top left`, so a mismatched source aspect letterboxes to the bottom/right instead of centring |
| SSE reconnect + state resync | WORKING | code, live | `retry: 2000`, state reload on open |
| Static elements survive backend loss | WORKING | code | Renderer independent of stream |
| Duplicate-event protection | WORKING | code | id set with bound |
| OBS Browser Source verification | BLOCKED | — | No OBS in this environment; browser-based equivalent only |

## 5. Defects to fix, in priority order

| # | Severity | Defect | Impact | Fix |
| --- | --- | --- | --- | --- |
| D1 | High | `showTimestamps`, `showBadges`, `scrolling` are inspector controls with no renderer effect | Visible controls that lie — breaks rule 1 | Implement timestamps + badges in chat; drop `scrolling` or make it real |
| D2 | — | ~~Runtime scaling defect~~ **retracted** | Browser probe `scripts/probes/cp0-runtime-probe.mjs` measured exact coordinate mapping and transparent output at three viewport sizes; `transform-origin: top left` is already correct | Nothing to fix. Document that the OBS source should be exactly the design size (1920×1080); a different aspect letterboxes bottom/right by design |
| D3 | Medium | Countdown restarts from `minutes` on every reload | Wrong on every OBS restart | Support an absolute target time (default: relative duration, clearly labelled) |
| D4 | Medium | Images are data URLs; published snapshot carries them in the URL | Large assets can exceed URL limits / 5 MB storage | Validate + cap size, warn, document; keep data URL as the supported free path |
| D5 | Medium | "Open output" link has no snapshot, so it only works in the authoring browser | Copied link fails elsewhere with "Overlay unavailable" | Explain in UI; offer "copy published link" as the primary action |
| D6 | Low | Donation goal / supporter are mocks | Risk of implying a provider exists | Label as manual values in the inspector |

## 6. Checkpoint plan

- **CP1 — Design system + full app redesign.** Tokens (colour, type, spacing, radii, shadow, motion, focus), Persian girih/eslimi ornament as a controlled layer, redesign of library, integrations, editor chrome, empty/error/loading states, RTL parity. Acceptance: every screen uses tokens, no raw hex in components, contrast checks pass, RTL and LTR both verified in a browser.
- **CP2 — Editor reliability.** Prove zoom/pan canvas mapping at 25/50/100/200%, snapping, alignment, keyboard, undo/redo across every mutation; fix D1-D2-adjacent selection bugs; confirm autosave and reload.
- **CP3 — Element completeness.** Every element gets a capability contract; implement timestamps/badges, fix countdown anchor, make mock status explicit, add per-element tests.
- **CP4 — Motion + assets.** Entrance/idle/exit audit, reduced motion, bounded queues, asset validation and size limits, clear failure messages.
- **CP5 — Kick pipeline.** Re-verify OAuth, webhook signatures, dedupe, SSE replay against the live backend; add replay/idempotency tests; record real events when they arrive.
- **CP6 — Runtime + OBS.** Fix D2, verify transparency, sizing, reconnect, static fallback, memory bound; document the OBS Browser Source recipe.
- **CP7 — Security, performance, accessibility.** CORS, SSRF, XSS, runtime-key scope, dependency audit, bundle/perf measurements, focus and keyboard paths.
- **CP8 — Regression + deploy.** Full suite, browser sweep of every route, deploy verification, final report.

Blocked items stay blocked honestly: OBS itself, organic Kick chat/follows, and any metric the official API does not expose.

## 6a. Verified runtime measurements

`scripts/probes/cp0-runtime-probe.mjs` serves `dist/` and drives headless Chromium through Playwright. With a 1920×1080 design containing one 400×100 text element at (100,100), `staticMotion` on:

| Viewport | Expected scale | Element measured | Verdict |
| --- | --- | --- | --- |
| 1920×1080 | 1.000 | 400×100 at (100,100) | exact |
| 1280×720 | 0.667 | 267×67 at (67,67) | exact |
| 1000×1000 | 0.521 | 208×52 at (52,52) | exact |

Transparency, absence of scrollbars and zero uncaught errors were confirmed at all three sizes. This harness is the basis for the CP2/CP6 browser checks.

## 7. Do-not-break list

Saved overlays in `obsidian-overlays-v1`, `publicId` stability, the exchange/management-token separation, `includeInOutput` semantics for guide frames, the test-event marking, and the explicit unsupported follower total.
