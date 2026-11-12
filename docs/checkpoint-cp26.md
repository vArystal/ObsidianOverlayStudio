# CP26 — Real Kick-to-OBS end-to-end verification

Date: 2026-11-06. Site https://varystal.github.io/ObsidianOverlayStudio · API https://obsidian-overlay-api.pages.dev
Frontend bundle `index-BpB5A233.js` (unchanged from CP25) · API deployment `b690851d` (CP26 retention fix)

## Verdict

**BLOCKED** — the genuine-event step needs one external Kick account to follow `kick.com/arystal` while an OBS
Browser Source is open. Everything around that step was verified against production, and one real defect that
would have swallowed genuine alerts was found and fixed.

## What production actually holds

Read from D1 on 2026-11-06 12:0x Tehran (08:5x UTC), without printing any secret:

| Field | Value |
|---|---|
| connection | `con_6swqGvz0Dluf`, channel `arystal`, connected = 1 |
| scopes | `user:read`, `channel:read`, `events:subscribe` |
| subscriptions | 8 registered: chat.message.sent, channel.followed, channel.subscription.new, channel.subscription.renewal, channel.subscription.gifts, kicks.gifted, livestream.status.updated, livestream.metadata.updated |
| webhook_error | none |
| last_event_at | 2026-11-05T16:33:44.124Z |
| last_event_type | livestream.status.updated |
| event_counts | chat.message.sent 11 · channel.followed 2 · livestream.status.updated 12 |
| processed (dedupe claims) | 29 |
| publications | 1 |
| alert_test_frames | 0 (no test row has ever entered production storage) |

`/api/runtime/<key>/state` returns `connected: true`, channel `arystal`, and
`latestFollower: ryudryudry103` — a real Kick username, which is itself proof that a genuine
`channel.followed` webhook was delivered, signature-checked, normalised and persisted.

Token health is proven indirectly but firmly: the cron writes a fresh `metric.viewer.updated` row every 60s
(observed 08:47:37, 08:48:37, 08:49:37, 08:50:37 during this audit), and that row only exists if the worker
successfully refreshed the OAuth token and called Kick's channels endpoint.

## Defect found and fixed in CP26

**Retention deleted unwatched alerts.** The cron pruned every event older than one hour:

```sql
DELETE FROM events WHERE received_at < ?
```

For chat and viewer metrics that is correct. For the alert queue it was a silent data loss: a genuine follow at
03:00 was gone by 04:00 unless an OBS source happened to be open and acknowledge it inside the hour. That is a
lost alert, and it is precisely the case CP25 promised to handle.

Fix (worker, no migration needed): `pruneEvents()` keeps alert-capable events for 24 hours unless the overlay has
acknowledged them, drops acknowledged ones after an hour with the rest of the tail, and keeps a 24-hour ceiling so
an abandoned stream cannot grow the table. Covered by a new worker test that seeds four rows (unacked alert, acked
alert, stale alert, old chat) and asserts only the unacked alert survives.

Consequence for this checkpoint: yesterday's two genuine follows are gone under the old rule, so their passage
through `/alerts` → OBS → ack cannot be reconstructed after the fact. Nothing was fabricated to stand in for them.

## Stage-by-stage status

| # | Stage | Status | Evidence |
|---|---|---|---|
| 1 | genuine follow at Kick | **not run in CP26** | needs an external account |
| 2 | webhook delivery | PASS (historical) | event_counts.channel.followed = 2, last_follower = ryudryudry103 |
| 3 | worker receipt | PASS (historical) | processed = 29 claims, last_event_at 2026-11-05T16:33:44.124Z |
| 4 | signature verification | PASS | counts only increment through the signed webhook path; CP5 forged/no-header/version/stale/size rejections still live |
| 5 | normalisation | PASS | `/state.latestFollower.username` = ryudryudry103 |
| 6 | D1 persistence | PASS | connection row + counters; event rows pruned by design |
| 7 | alert feed | PASS (contract) | `/alerts` answers with a cursor and filters acked rows; no genuine unacked row existed to serve |
| 8 | OBS receipt | PASS (mechanics) | public runtime at 1920×1080: 0 page errors, transparent, no scrollbars, no editor session |
| 9 | alert rendering | PASS (design state) | studio shows the follow template; runtime stays silent without an event, which is the correct behaviour |
| 10 | acknowledgement | PASS (guard) | forged id → `{"acked":0}`; unknown runtime key → 404 |

## Security re-verification on the live API

- `POST /alerts/ack` with `{"ids":["forged_1"]}` → `{"acked":0}`: acks are restricted to ids that exist in `events` for that runtime.
- `GET /alerts` for a runtime key that does not exist → **404**, so a runtime key cannot enumerate another channel.
- `alert_test_frames` is 0 rows: the test button writes there, never into `events`, and the production feed never selects it.
- The OBS URL is `#/overlay/<publicId>?snapshot=…`: composition only, no management token, no administrative control.

## Regression results (all re-run for CP26)

- Vitest 218/218 · server 49/49 · worker 34/34 · `tsc -b` clean · `vite build` clean
- Journey probe on production: 14/14 passed, 0 failed
- Alert probe on production: studio renders the Persian follow template, runtime 1920×1080 with 0 stages and 0 page errors

## What the owner must do to finish CP26 (about 30 seconds)

1. Open the published overlay URL in OBS Browser Sources, 1920×1080.
2. From **any other real Kick account** (a friend, a second account, a viewer), follow `kick.com/arystal`.
3. Say the word; I then read the same identifiers back from production and complete stages 1–10 with timestamps.

Until that happens the honest verdict stays **BLOCKED**, not PASS.

## Remaining limitations

- One-channel scale: retention is now a day for alerts, so an offline OBS instance recovers alerts from the last 24 hours only.
- Donations have no provider; `kicks.gifted` (KICKs) is the closest genuine event and is supported.
- Subscription renewals and gift subs can only be observed when Kick emits them for a real paid event.
- Audio in OBS still depends on one user gesture unless the source is launched with `--autoplay-policy=no-user-gesture-required`; the stage reports the blocked state instead of pretending.
