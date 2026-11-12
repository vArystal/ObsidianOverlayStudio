# Integration API contract

Both backends implement this contract: the local Node server (`server/app.mjs`) and the Cloudflare Worker
(`worker/index.mjs`). `npm run test:contract` runs one shared suite (`tests/contract/`) against both; drift fails CI.

Common: JSON in, JSON out, `content-type: application/json; charset=utf-8`. CORS allows the configured app origin
for `authorization` and `content-type`. Every response carries `cache-control: no-store`. Errors are
`{ "error": "<code>" }` with no stack, no secret and no upstream detail.

Auth: management routes take `Authorization: Bearer <managementToken>`, the token minted when a Kick account is
connected. Runtime routes are public by design, because an OBS browser source cannot hold a credential.

## Routes

### `GET /api/health`
200 `{ ok: true, service, time, runtime? }`. `runtime` is present on the Worker only.

### `GET /api/setup`
200 `{ state, missing[], requiredScopes[], events[], callbackUrl, webhookUrl, donation }`. `state` is
`SETUP_REQUIRED` when Kick app credentials are absent, otherwise `DISCONNECTED`. This is a configuration probe: it
cannot know whether an account is connected, because the management token lives in the browser.

### `GET /api/auth/kick/start`
302 to Kick's authorize URL with PKCE. 503 `setup_required` when credentials are missing.

### `GET /api/auth/kick/callback`
302 back to the app with `?exchange=<code>`. 400 on state mismatch or a rejected token exchange.

### `POST /api/auth/session`
Body `{ code }`. 200 `{ managementToken, connection }`. 400 `invalid_exchange`.

### `GET /api/integrations/kick`
Auth. 200 `{ state, connection, missingScopes[], requiredScopes[], webhook{state, endpoint, subscriptions[], error}, followerTotal }`.
`state` ∈ `CONNECTED | PERMISSION_MISSING | STALE_DATA | ERROR | DISCONNECTED`.

### `POST /api/overlays/publish`
Auth. Body `{ overlayId }` matching `^[A-Za-z0-9_-]{8,120}$`.
200 `{ publicationId, overlayId, runtimeKey, createdAt, updatedAt }`, idempotent per `(connection, overlayId)`.
400 `invalid_overlay_id`, 401 `unauthorized`.

### `DELETE /api/overlays/:overlayId/publication`
Auth. 200 `{ removed, overlayId }`; `removed` is `0` on a repeat, so a retry is safe. The runtime key stops
resolving immediately (`/state` then 404). 400 `invalid_overlay_id` (same 8–120 character rule), 401.

### `POST /api/integrations/kick/resubscribe`
Auth. 200 `{ resubscribed, subscriptions[] }`. 502 `kick_error` if Kick refuses.

### `POST /api/integrations/kick/disconnect`
Auth. 200 `{ state: 'DISCONNECTED' }`. 401.

### `POST /api/integrations/test-event`
Auth. Body `{ type?, username?, message? }`. `type` ∈ `chat.message.sent | channel.followed |
channel.subscription.new | channel.subscription.renewal | channel.subscription.gifts | kicks.gifted`; anything else
falls back to `channel.followed`.
200 `{ delivered, test: true, event, targets, stored: 'alert_test_frames' }`. The event carries `test: true` and a
`TEST` badge. **It is stored as an alert test frame only**: it never enters the event stream, the events table, the
alerts feed, or any counter. Sources receive it only through `?test=1`.

### `GET /api/runtime/:runtimeKey/state`
Public. 200:
```
{ connected, viewer{status,count,updatedAt}, latestFollower, sessionFollowerCount,
  channel{slug,description,activeSubscribers}, stream{title,category,isLive,startedAt,updatedAt}|null,
  lastEventAt, followerTotal{supported:false,reason}, serverTime }
```
404 `runtime_not_found`. Fields that Kick does not report stay `null`; `followerTotal.supported` is always `false`
because the public API exposes no follower total.

### `GET /api/runtime/:runtimeKey/events`
Public SSE. `text/event-stream`, `event: overlay-event`, one JSON frame per delivery, `: heartbeat` comments while
idle, `event: heartbeat` on the Worker. 404 `runtime_not_found`, 409 `integration_disconnected`.

### `GET /api/runtime/:runtimeKey/alerts?after=<seq>&limit=<1..50>&test=1`
Public. 200 `{ alerts: [{ seq, event }], cursor, truncated, serverTime }`.
Only alert-capable types (`channel.followed`, `channel.subscription.new`, `channel.subscription.renewal`,
`channel.subscription.gifts`, `kicks.gifted`, `alert.milestone`), unacknowledged, received within 6 hours, ordered by
`seq` ascending. `cursor` is the highest `seq` returned, or `after` when nothing is new. `?test=1` appends test
frames from the last 5 minutes with `seq: 0`; they never appear otherwise. 404 `runtime_not_found`.

### `POST /api/runtime/:runtimeKey/alerts/ack`
Public. Body `{ ids: string[] }`, at most 50, each 1–128 characters.
200 `{ acked }`. Only ids this runtime actually received are written; a retry is not an error and cannot double
count. 400 `malformed_json`, 400 `no_ids`, 404 `runtime_not_found`.

### `POST /api/runtime/:runtimeKey/alert-settings`
Auth **and** ownership: the runtime key must belong to a publication of the authenticated connection.
Body `{ milestones: [{ metric: 'followers'|'subscribers', target: 1..1000000, enabled }] }`, at most 6 entries;
other metrics are dropped.
200 `{ saved: true, milestones }`. 400 `malformed_json`, 401 `unauthorized`, 403 `runtime_not_owned`.

Milestones are derived at ingestion from durable per-type delivery counters (`channel.followed` for followers,
`channel.subscription.new` for subscribers). A crossed target emits one `alert.milestone` event with the
deterministic id `milestone:<metric>:<target>`, so a retried delivery cannot celebrate twice. A metric with no real
delivery never fires.

### `POST /api/webhooks/kick`
Kick only. 204 delivered, 202 `unknown_broadcaster`, 400 malformed, 401 untrusted signature, 500 transient (retry).

## Local server notes

`npm run dev:server` keeps state in a JSON file, so alerts, acknowledgements, test frames and alert settings all
survive a restart, exactly as the Worker's D1 rows do. Test plays are stored but not published to the SSE stream.
