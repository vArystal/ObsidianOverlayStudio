# CP25 — Production-grade live alert system

Date: 2026-11-06. Commits: `36bbd81` (system), `0c3af48` (studio hook attributes, production probe). Both pushed to
`main` and the deploying branch `arena/35be064d-jubilant-octo-lamp`.

## Verdict

**PASS WITH WARNINGS.** Every acceptance item is implemented and covered by automated tests, the D1 migration and
the alert API are deployed and verified on production, and the frontend build is deployed. The warning is the one
that has stood since CP5: no genuinely signed Kick delivery has ever arrived on this channel, so the full
"real event → queue → OBS" journey could not be executed end to end against live traffic. Nothing in this
checkpoint pretends otherwise.

## Architecture (one pipeline, no duplicates)

| Layer | File | Responsibility |
| --- | --- | --- |
| Event model | `src/lib/alerts.ts` | Six kinds mapped to real Kick event types, templates, presets, token copy, audio validation, idempotent normalisation |
| Queue engine | `src/lib/alertQueue.ts` | Deterministic phases, dedupe window, overflow policy, ack hand-off, cursor persistence |
| Shared renderer | `src/components/alerts/AlertStage.tsx` | The alert surface used by the canvas and by OBS |
| Runtime glue | `src/components/alerts/AlertRuntime.tsx` | Feed catch-up, acks, audio, honest blocked state, `AlertProvider` surface |
| Studio | `src/components/editor/AlertStudio.tsx` | Templates, typography, surface, motion, audio, queue, milestones, test mode |
| Backend | `worker/index.mjs` | `/alerts` feed, `/alerts/ack`, `/alert-settings`, milestone derivation, test-frame isolation |

The alert element already existed; CP25 replaced its in-memory, index-cursor queue with this engine. No second
registry, no second event pipeline, no parallel renderer.

## Database migrations

`worker/migrations/0003_alert_queue.sql`, applied to production D1 **before** the worker deploy:

* `alert_acks (runtime_key, message_id, acked_at)` — primary key makes acks idempotent; swept after 7 days.
* `alert_settings (runtime_key, settings, updated_at)` — milestone targets, written only by the owner.
* `alert_test_frames (id, runtime_key, payload, created_at)` — test plays, swept after 10 minutes, never read by
  the production feed.

`worker/schema.sql` carries the same three tables so the test harness builds them.

## Event support matrix

| Kind | Kick event | Status | Notes |
| --- | --- | --- | --- |
| New follower | `channel.followed` | Supported | Official subscription |
| New subscriber | `channel.subscription.new` | Supported | Official subscription |
| Renewal | `channel.subscription.renewal` | Supported, conditional | Kick only sends it for renewals it processes |
| Gift subscriptions | `channel.subscription.gifts` | Supported, conditional | Delivered when Kick emits it for the channel |
| KICKs gift | `kicks.gifted` | Supported | Closest supported analogue to a donation |
| Tip / donation | — | **Not supported** | No donation provider is connected; `/api/integrations/kick` returns `SETUP_REQUIRED` for donations. Nothing simulates it. |
| Milestone | derived | Supported | Computed at ingestion from the durable per-type counters against owner-set targets; the event id is `milestone:<metric>:<target>` so it can never fire twice |

Every event carries the normalised type, Kick's message id, `receivedAt`, the normalised payload and the
`test` flag. Dedupe is the existing `INSERT OR IGNORE` claim on `events`, so retries and duplicate webhooks
cannot double count.

## Queue lifecycle

1. Ingestion persists the event (signature verified, timestamp windowed, version gated, body capped).
2. The runtime's SSE stream delivers it instantly; the `/alerts?after=<seq>` feed is the catch-up and polling
   fallback, bounded to 25 events and a six-hour window.
3. The engine dedupes by id, applies the overflow policy, then plays enter → hold → exit with the configured gap.
4. When a frame finishes its exit it becomes an acknowledgement and is POSTed; a failed POST is restored and
   retried, so a dropped request cannot silence an alert forever.
5. The server records the ack, so a reload or an OBS restart cannot replay it. The per-browser cursor avoids
   refetching what this source already handled.

Acknowledgements are refused unless the id exists in `events` for that runtime key: the runtime URL is public,
and without that guard a stranger could grow `alert_acks` without limit.

## Audio behaviour

Per-kind sound, upload size capped, MIME-checked, volume 0–1, global mute, and an explicit "Test sound" control.
The studio reports `played`, `blocked`, `missing` or `error` and never claims playback that did not happen.
OBS must run with `--autoplay-policy=no-user-gesture-required`, or the source needs one click; the stage shows a
`data-audio` state so the streamer can see which of the two applies. Sound rides inside the overlay document, so
the publish weight budget applies to it (the publish dialog already refuses a blocked snapshot).

## Test and live isolation

`POST /api/integrations/test-event` no longer writes to `events`. It stores one frame per runtime key in
`alert_test_frames`, returns `stored: 'alert_test_frames'`, touches no counter and is swept in minutes. The
production feed filters `payload.test` rows defensively even if something wrote one. The editor's test plays never
leave the browser at all. A test therefore cannot appear on air, cannot move a milestone and cannot be counted.

## Security findings

* Alert feed: public by design (it is the same data the SSE stream already publishes for the runtime key), but
  bounded, type-filtered and ack-filtered.
* Acks: idempotent, 50 ids per call, existence-checked against the runtime's own events.
* Alert settings: owner management token required, and the runtime key must belong to that connection.
* Test frames: owner token required to create, ephemeral, excluded from production reads.
* Uploads: MIME and size validated before becoming a data URL; no server-side file storage was added.
* Webhook path unchanged: signature verification, replay window and version gating all still apply.
* No token of any kind is added to overlay URLs or alert payloads.

## Test results

| Suite | Result |
| --- | --- |
| vitest | 218 passed |
| legacy server | 49 passed |
| Pages worker | 33 passed |
| tsc + vite build | clean |

New coverage: every kind's normalisation, duplicate delivery, queue ordering, overflow (both policies), ack
after exit, reload recovery via acks, gap between alerts, audio configuration and clamping, animation timing,
test/live isolation, hostile input repair, milestone ownership and derived ids, ack authorisation, pruning,
and byte-parity of the shared stage.

## Production deployment

1. Migration `0003` applied to `obsidian-overlay` (D1 id `4e7fa326-…`); tables verified with `sqlite_master`.
2. Worker redeployed to `obsidian-overlay-api.pages.dev`. Verified live:
   `GET /api/runtime/<key>/alerts` → `{"alerts":[],"cursor":0,...}` and
   `POST /alerts/ack {"ids":["made_up_id"]}` → `{"acked":0}` (the guard working on production).
3. Frontend pushed; GitHub Pages build verified by bundle hash, plus `scripts/probes/cp25-alerts.mjs`.

## Screenshots

* `artifacts/cp25-alert-studio.png` — the studio with the template preview.
* `artifacts/cp25-alert-test.png` — a test play through the shared engine, labelled as a preview.
* `artifacts/cp25-alert-runtime.png` — the published source at 1920×1080: 0 stages, transparent, no page errors.

## Known limitations

1. **No organic Kick event yet.** The channel is offline and no signed delivery has arrived, so the live journey
   is proven by tests, by the production API and by the runtime staying honestly silent. One chat message or follow
   on kick.com/arystal closes it.
2. **Donations are not supported** because no donation provider is connected; KICKs gifts are the supported analogue.
3. **Renewal and gift-sub alerts depend on Kick emitting them**; the UI says so per kind instead of promising them.
4. **Audio may need one click** in OBS depending on launch flags; the stage reports which state it is in.
5. **Test plays are browser-local.** Cross-browser test delivery would need a test table read by `?test=1`; the
   frames are stored for that, but the OBS side does not yet poll them.
6. The production probe's own selectors assumed `.property-section` markup inside the studio; the studio uses
   fieldsets, so the probe's `sections` list is empty even though the studio renders. The screenshots are the
   evidence, not that array.
