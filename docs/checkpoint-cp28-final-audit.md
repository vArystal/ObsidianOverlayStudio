# CP28 — Final production audit and release verification

Date: 2026-11-06. Site https://varystal.github.io/ObsidianOverlayStudio · API https://obsidian-overlay-api.pages.dev
HEAD `b569241` (CP27 line: `59faf59`, `746d272`, `b569241`). Live bundle `index-B-yDi_39.js` equals the local build
byte for byte, so there is no drift between the repository and what OBS loads.

## Verdict

**BLOCKED** on acceptance criterion 1 only: a genuine follow from a second Kick account while the published overlay is
open. Everything else in CP28 was executed and passes. Per the checkpoint rules I will not substitute a synthetic frame,
a historic row or a database insert for that one event.

## Genuine Kick → OBS test

Cannot be completed from this environment: it needs a second real Kick account, and creating one is not something I will
do on the owner's behalf. What production does prove today, from real signed traffic:

| Stage | Evidence | Status |
| --- | --- | --- |
| Kick OAuth + refresh | cron writes `metric.viewer.updated` every 60s, `connections.updated_at` 2026-11-06T09:19:37.280Z, `webhook_error` null | verified |
| 8 webhook subscriptions | `channel.followed`, `channel.subscription.new/.renewal/.gifts`, `kicks.gifted`, `chat.message.sent`, `livestream.status/metadata.updated` | registered |
| Signature verification | forged signature probe returns 401 `invalid_signature`; `processed` holds 29 real dedupe claims | verified |
| Normalisation + persistence | `event_counts` = chat 11, `channel.followed` 2, `livestream.status.updated` 12; `/state` `latestFollower` = `ryudryudry103` | verified for follow + chat |
| Alert feed | `/api/runtime/<key>/alerts` answers `{"alerts":[],"cursor":0}` (nothing unacknowledged) | verified shape, no genuine row |
| OBS render / ack / replay | contract, queue and ack guards verified by 239 tests plus live endpoint probes | unproven with a genuine row |

The two genuine follows landed before CP25 existed and were removed by the old one-hour prune, so their alert rows are
gone by design and cannot be replayed. `last_event_at` is 2026-11-05T16:33:44.124Z; every one of the 61 current `events`
rows is a self-generated viewer metric.

**Remaining owner action (30 seconds):** open the published overlay in OBS, follow `kick.com/arystal` from any other
real account, and send me the username. I will then read the event id, the feed delivery, the render and the ack back
from production and close the criterion.

## Integration matrix

| Integration | Classification | Note |
| --- | --- | --- |
| Kick OAuth + token refresh | Verified with genuine production data | refresh proven by the minute-by-minute metric writes |
| Channel + livestream state | Verified | `/state` carries slug, description, live flag and active subscribers |
| Viewer metrics | Verified | offline with `count: null` is Kick's real answer, never coerced to 0 |
| Chat webhook | Verified | 11 signed deliveries |
| Follow webhook | Verified | 2 signed deliveries, real username persisted |
| Subscription / renewal / gift / KICKs types | Registered, unproven | subscriptions exist; Kick has never delivered one on this channel |
| Alert queue + acknowledgement | Verified by contract | acks idempotent, forge-proof, 24h retention for unwatched alerts |
| OBS runtime connection + recovery | Verified | journey probe 14/14, reconnect tests, live 60fps |
| Donations / tips | **Not supported** | no provider connected. `kicks.gifted` is the only gift-currency event Kick exposes; there is no tip integration and nothing pretends otherwise |

## Security findings

All boundaries hold on the live host:

- unknown runtime key → 404; forged ack id → `{"acked":0}`; `POST /alert-settings` without the owner token → 401.
- forged webhook signature → 401 `invalid_signature`; duplicate deliveries are collapsed by the `processed` claim.
- `alert_test_frames` is empty, so no test data has ever touched production counters or the alert feed.
- bundle scan for `KICK_CLIENT_SECRET`, `ENCRYPTION_KEY`, `management_hash` and bearer tokens: no matches.
- overlay URLs carry only `publicId` plus the snapshot; no management credential is reachable from a public source.

## Regression results

239 vitest (30 files), 49 server, 34 worker, `tsc -b` clean, Vite production build clean, journey probe 14/14,
axe 0 violations across the audited surfaces, zero page errors.

## Performance at 1920×1080 (measured, production)

| widgets | fps | p95 frame | janky | hosts animating |
| --- | --- | --- | --- | --- |
| 5 animated | 60.0 | 16.8ms | 0 | 5/5 |
| 10 animated | 60.0 | 16.8ms | 0 | 10/10 |
| 20 animated | 60.0 | 16.7ms | 0 | 20/20 |
| 20 static | 60.2 | 16.7ms | 0 | — |

No regression against CP27 or the CP24 baseline.

## Screenshots

- `artifacts/cp27-runtime-motion.png` — published runtime at 1920×1080 with three animated elements.
- CP28 introduced no visual changes, so no new captures were needed for a release decision.

## Known limitations

- Genuine alert rendering in OBS is unproven (criterion 1 above); the pipeline is proven up to the point where a real
  alert row exists.
- No donation or tip provider. Subscription-renewal and gift alerts will only ever fire if Kick emits them.
- Kick exposes no follower total, so no widget claims one.
- Animation covers transform, opacity and filter; effects are static per element rather than keyframed.

## Release readiness

The product is release-ready for everything it claims, with one unverified path: the first real alert reaching a live
OBS source. I recommend shipping and closing that criterion on the first genuine follow rather than holding the release.
