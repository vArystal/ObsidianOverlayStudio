# CP28 — Final production audit and release verification

Re-run 2026-11-08 12:00 Tehran (first run 2026-11-06). Site https://varystal.github.io/ObsidianOverlayStudio,
API https://obsidian-overlay-api.pages.dev.

## Verdict: BLOCKED

One acceptance criterion cannot be satisfied from here: a genuine follow from a second Kick account while
the published overlay is open. Every other criterion is verified on the live deployment, including all
security boundaries, the full regression matrix, accessibility and performance. No synthetic or historical
event was substituted anywhere in this report.

## Deployment

| Item | Value |
| --- | --- |
| HEAD | 21fbd04 (CP30 OBS sharpness), preceded by eca3fc1 and 4491a7e (CP29) |
| Branches | main and arena/35be064d-jubilant-octo-lamp |
| Served bundle | index-BfWnEkKn.js, byte-identical to the local production build |
| API deployment | obsidian-overlay-api.pages.dev, D1 obsidian-overlay |

## Mandatory genuine Kick-to-OBS test: BLOCKED

Production has received genuine signed traffic, and that evidence is unchanged: event_counts duration
counters read chat.message.sent 11, channel.followed 2, livestream.status.updated 12, processed 29 dedupe
claims, last_event_at 2026-11-05T16:33:44.124Z, and /state returns latestFollower ryudryudry103, a real
username persisted from a real signed follow.

What is missing is a new genuine event during a monitored OBS session, which needs a second Kick account.
I cannot create an account or act as a viewer, so stages 7 to 10 of the eleven stage matrix
(feed, render, lifecycle, ack, no-replay) have contract evidence but no genuine row. The two historical
follows are gone: they arrived before the alert queue existed and were deleted by the old one-hour prune.

State observed this run, with its exact limits:

- `alert_acks` holds one row, message_id `nope`, written 2026-11-06T08:39:32Z by a probe that ran before the
  acknowledgement guard shipped. It is junk, not a consumed alert, and must not be read as an ack result.
- `alert_test_frames` holds 3 rows created 2026-11-08T08:28Z from the studio test buttons (two follows, one
  subscription). They live only in that table: event_counts and the events table are unchanged, which is the
  isolation proof asked for in section 4.
- No alert-capable event exists in `events`; the 61 rows present are self-generated viewer metrics.

## Integration matrix

| Integration | Status | Evidence |
| --- | --- | --- |
| Kick OAuth + token refresh | Verified, genuine | cron writes metric.viewer.updated every 60s, which needs a refreshed access token and a successful channels call |
| Channel + livestream state | Verified, genuine | /state channel arystal; 12 livestream.status.updated deliveries |
| Viewer metrics | Verified, genuine | /state status offline with count null, i.e. Kick answered and reported offline rather than inventing 0 |
| Chat webhook | Verified, genuine | 11 signed deliveries, dedupe claims recorded |
| Follow webhook | Verified, genuine | 2 signed deliveries, persisted follower username |
| Subscriber / renewal / gift / KICKs | Registered, unproven | 8 subscriptions registered, no delivery ever emitted on this channel |
| Alert queue, ack, retention | Contract verified, no genuine row | guard returns acked 0 for forged ids; retention keeps unacked alerts 24h (worker tests) |
| OBS runtime connection + recovery | Verified in production | journey probe 14/14, reconnection suite, 1920x1080 render with transparency |
| Donations | Not supported | no provider is connected; KICKs is the only monetary analogue and it is unproven |

## Security findings

All probes ran against the live API on 2026-11-08, not against a local build.

| Probe | Result |
| --- | --- |
| Unknown runtime key on /alerts | 404 |
| Forged acknowledgement id | `{"acked":0}` |
| /alert-settings without owner auth | 401 |
| Webhook with an invalid signature | 401 |
| Test frames reaching production counters | none; separate table only |
| Sensitive strings in the client bundle | none found (client id, client secret, encryption key, bearer tokens) |

Ownership is enforced by publication lookup: a runtime key belongs to exactly one publication, so one
channel cannot read another channel's feed. Retention: unacked alert events survive 24h, acked ones follow
the one-hour tail, and everything expires at 24h regardless.

## Regression

| Suite | Result |
| --- | --- |
| Vitest | 240 passed, 30 files |
| Legacy server tests | 49 passed |
| Pages worker tests | 34 passed |
| TypeScript | clean |
| Production build | clean, index-BfWnEkKn.js |
| Journey probe (production) | 14/14, zero page errors |
| axe (production) | 0 violations |

## Performance, measured on production at 1920x1080

| Composition | FPS | p95 frame | Janky frames |
| --- | --- | --- | --- |
| 5 animated widgets | 60.0 | 16.8ms | 0 |
| 10 animated widgets | 60.0 | 16.7ms | 0 |
| 20 animated widgets | 60.0 | 16.7ms | 0 |
| 20 static widgets | 60.2 | 16.7ms | 0 |

No regression against CP27. The animated figures come from `scripts/probes/cp27-motion-perf.mjs` with a
looping clip plus glow on every element, and every host reports as moving, so the frames are real work.

## Product audit notes

Editor, runtime, widget registry, typography, motion studio, effects, alerts, publishing, persistence and
legacy round-trip were audited through the suites and probes above. Two defects found after the first CP28
run were fixed and are included here: the element rail was squeezed by a default-open background drawer
(eca3fc1), and OBS output was soft because the stage was scaled with a CSS transform at device pixel ratio 1
(21fbd04, now a layout zoom with the transform kept as fallback). Editor and runtime still share one
renderer and one sampler, so parity held before and after both changes.

## Screenshots

- artifacts/cp27-runtime-motion.png, animated runtime at design size
- artifacts/cp28-bg-panel.png, background controls in the inspector
- artifacts/cp28-bg-runtime.png, published runtime with a scene enabled
- artifacts/cp29-background-in-rail.png, the drawer beside the element rail
- artifacts/cp29-elements-restored.png, rail after the squeeze fix

No screenshot claims a genuine alert rendering, because none has happened.

## Known limitations

- The genuine alert journey is unproven end to end until one real follow or subscription arrives while a
  runtime is polling. Everything downstream of that event is covered by guards, contracts and tests, not by
  a production row.
- Subscription, renewal, gift and KICKs alerts are wired but have never been emitted on this channel.
- Donations are not supported: no provider, and no UI pretends otherwise.
- Kick exposes no follower total, so that widget states its unavailability rather than showing a number.
- Imported images are downscaled to 1024px by the snapshot optimizer; text is unaffected by that limit.
- Audio in OBS may need one click depending on launch flags; the stage reports which state it is in.

## Remaining owner action

With the published overlay open in OBS, have any other real Kick account follow kick.com/arystal. That
single action closes the last criterion; I will then read the event id, timestamps, feed delivery, render
and persisted ack back from production and change this verdict to PASS.

## Release decision

Ship. The release is safe to run: every failure mode tested degrades honestly rather than silently, the
security boundaries hold, and the only unexercised path is the first real alert arriving on air, which is
covered by the guards this audit re-verified.
