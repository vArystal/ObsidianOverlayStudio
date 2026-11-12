# Kick integration on Cloudflare Workers (free tier)

The editor stays on GitHub Pages. Kick OAuth, tokens and webhooks need a public HTTPS
backend, so this repo ships one that runs entirely on the Cloudflare free plan:
Workers + D1 only. No Durable Objects, Queues, R2, paid add-ons or custom domain.

Frontend is unchanged: `src/lib/integration.ts` already talks to this exact route
surface (`/api/auth/kick/start`, `/api/auth/kick/callback`, `/api/auth/session`,
`/api/integrations/kick`, `/api/overlays/publish`, `/api/runtime/:key/state`,
`/api/runtime/:key/events`, `/api/webhooks/kick`). You only paste the Worker URL into
**Integrations → Integration server → Backend URL**.

## 1. What the official Kick API actually supports

Verified against `https://api.kick.com/swagger/doc.yaml`, the KickDevDocs repo
(`KickEngineering/KickDevDocs`), and `docs.kick.com`.

| Requirement | Official source | Status |
| --- | --- | --- |
| Chat messages | webhook `chat.message.sent` | supported, real time |
| Current viewer count + live/offline | `GET /public/v1/channels` → `data[].stream.viewer_count`, `stream.is_live` (scope `channel:read`; polled every minute by cron) | supported |
| Livestream started/ended | webhook `livestream.status.updated`, `livestream.metadata.updated` | supported |
| Latest follower | webhook `channel.followed` | supported |
| Subscriptions | webhook `channel.subscription.new`, `.renewal`, `.gifts` | supported |
| Kicks / gifted kicks | webhook `kicks.gifted` | supported |
| Subscriber totals | `GET /public/v1/channels` → `active_subscribers_count` | supported (not a follower count) |
| **Total follower count** | **none** | **not supported by any public endpoint** |
| Follow count on this connection | count of real `channel.followed` webhooks since you connected | supported, clearly labelled |

`GET /public/v1/channels` returns `active_subscribers_count`,
`active_gifted_subscribers_count`, `canceled_subscribers_count`, channel metadata and a
`stream` object. `GET /public/v1/users` returns only `email`, `name`, `profile_picture`,
`user_id`. There is no follower total anywhere in the public API, so the editor shows
"none received" plus a session follow count instead of a made-up number. Fabricating
that metric would break the rule that nothing is invented.

## 2. Required Kick Developer credentials

1. Create an app at <https://kick.com/settings/developer> (Kick Developer settings).
2. Copy the **Client ID** and **Client Secret**.
3. Add the redirect URL exactly:
   `https://<your-worker>.workers.dev/api/auth/kick/callback`
   (it must equal `PUBLIC_API_URL` + `/api/auth/kick/callback`; mismatches fail at the
   authorize step with `Invalid request`).
4. Requested scopes: `user:read channel:read events:subscribe` (`REQUIRED_SCOPES` in
   `worker/index.mjs`). Kick shows these on the consent screen.
5. Webhook subscriptions are created by the Worker itself during the callback through
   `POST /public/v1/events/subscriptions`, so you do not register a webhook URL in the
   Kick dashboard. The endpoint to allow, if Kick asks, is
   `https://<your-worker>.workers.dev/api/webhooks/kick`.

Unverified Kick apps have a 1,000-subscription cap on `chat.message.sent`; a single
channel uses one subscription per event type, so this does not matter here.

## 3. Current deployment (already live)

Deployed and verified on 2026-10-28:

| Thing | Value |
| --- | --- |
| Backend base URL | `https://obsidian-overlay-api.pages.dev` |
| OAuth callback | `https://obsidian-overlay-api.pages.dev/api/auth/kick/callback` |
| Webhook endpoint | `https://obsidian-overlay-api.pages.dev/api/webhooks/kick` |
| D1 database | `obsidian-overlay` (`4e7fa326-63e1-4823-8518-063099aad5be`) |
| Hosting | Cloudflare **Pages** Functions, free plan |
| Secrets set | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `ENCRYPTION_KEY` |

Verified on 2026-10-28 after the last secret landed:

* `GET /api/health` → 200
* `GET /api/setup` → `state: "DISCONNECTED"`, `missing: []` (all three secrets bound)
* `GET /api/auth/kick/start` → `302` to
  `https://id.kick.com/oauth/authorize?response_type=code&client_id=…&redirect_uri=https%3A%2F%2Fobsidian-overlay-api.pages.dev%2Fapi%2Fauth%2Fkick%2Fcallback&scope=user%3Aread+channel%3Aread+events%3Asubscribe&code_challenge=…&code_challenge_method=S256&state=…`
* Loading that authorize URL in a real browser renders Kick's own login form, which means
  Kick accepted the client ID (a bad client ID is rejected there instead)
* `GET https://api.kick.com/public/v1/public-key` → 200 (the PEM the Worker verifies
  webhooks against)
* `POST /api/webhooks/kick` without signature headers → `401 {"error":"missing_headers"}`

### The `invalid_client` 401, diagnosed

The first authorization attempt died at the token exchange with
`{"error":"invalid_client","error_description":"Client authentication failed"}`. Cause: the
value bound as `KICK_CLIENT_SECRET` was **byte-identical to `KICK_CLIENT_ID`** (same 26
characters, shared prefix 26), so Kick received the client ID twice and authenticated
nothing. `KICK_CLIENT_ID` itself is fine: the authorize screen accepts it.

Two things now prevent a repeat:

* `/api/setup` returns `state: "MISCONFIGURED"` plus
  `problems: ["KICK_CLIENT_ID_EQUALS_KICK_CLIENT_SECRET"]` instead of a clean bill of health.
  The real secret was supplied on the second attempt (64 chars, no shared prefix) and is
  pushed to Pages with `wrangler pages secret put`; `/api/setup` then reports
  `state: "DISCONNECTED"`, `missing: []`, `problems: []`.
* The callback wraps the token request and answers with an HTML page naming the real cause
  and the fix, instead of bubbling a generic `internal_error`.

Control tests against `id.kick.com` (useful when debugging this again): a garbage
client/secret pair and the real pair both return `401 invalid_client` for
`grant_type=client_credentials`, and adding any `scope` returns `400 invalid_scope` **even
for the garbage pair**, so Kick validates `scope` before client authentication. Neither
response tells you whether the credentials are good. Only the `authorization_code` exchange
with a real code does, so do not read a `client_credentials` 401 as proof of a bad secret.
Even the `authorization_code` probe with a bogus code is useless here: Kick answers it with a
bodyless `401` for both a wrong and the correct secret, so credentials can only be proven by
the real callback. Pages also bakes secrets into a deployment, so `wrangler pages secret put`
must always be followed by a deploy or the runtime keeps the old value.

### Why Pages and not Workers

The account's Workers scripts deploy successfully but every request returns Cloudflare
error 1101, including a three-line probe worker (reproduced from both the sandbox and a
real browser). The same code runs correctly under `wrangler dev --remote`, and a probe
Pages Function returns 200, so Pages Functions is the working free surface for this
account. Cloudflare was also reporting a major platform incident during the diagnosis,
so Workers may start working later; `worker/wrangler.toml` is kept so the identical code
can move back to Workers (and regain the cron sweep) in one command.

Pages has no cron triggers, so the viewer-count sweep runs **lazily** instead: any read of
`/api/runtime/:key/state`, `/api/integrations/kick`, or the start of an SSE stream
refreshes the number when the stored value is older than 45 seconds. One Kick call per
connection per 45 seconds at most; a failed refresh keeps the last real count and marks it
`stale` rather than inventing a value.

### Update the Kick app

In <https://kick.com/settings/developer>, edit the app so these match exactly:

* Redirect URL: `https://obsidian-overlay-api.pages.dev/api/auth/kick/callback`
* Webhook URL: `https://obsidian-overlay-api.pages.dev/api/webhooks/kick`
* Scopes: `user:read`, `channel:read`, `events:subscribe` only

Then the Client ID goes in as one more secret:

```bash
npx wrangler pages secret put KICK_CLIENT_ID --project-name=obsidian-overlay-api
npx wrangler pages deploy worker/pages --project-name=obsidian-overlay-api --branch=main
```

Pages bakes secrets into a deployment, so **the redeploy is mandatory** or the runtime
still reports the secret as missing.

### Redeploy from a clean checkout

```bash
npm install
node scripts/build-pages.mjs          # copies worker/index.mjs beside _worker.js
npx wrangler pages deploy worker/pages --project-name=obsidian-overlay-api --branch=main
```

`worker/pages/index.mjs` is generated and gitignored; never edit it by hand.

## 4. Free-tier budget

| Resource | Free allowance | This design |
| --- | --- | --- |
| Worker requests | 100k/day | OBS runtime SSE ~2.4k/day per open overlay (25s streams), webhooks, editor calls |
| Worker CPU | 10 ms/invocation | HMAC-free RSA verify + small D1 reads, well under |
| D1 rows read | 5M/day | SSE polls every 2s per open overlay, ~1.1k rows/hour |
| D1 rows written | 100k/day | one row per event per published overlay |
| D1 storage | 5 GB | events pruned hourly by cron, chat history is not archived |
| Cron | every minute | 1 call/minute, capped at 20 connections per sweep |

Because the free plan allows 50 subrequests per invocation, the cron sweep refreshes at
most 20 channels per minute (Kick's channels endpoint accepts up to 50 ids, so this can be
batched further later if needed). Nothing here requires a paid resource. If you ever need
sub-second fan-out at thousands of concurrent overlays, that is when Durable Objects or
Queues would be worth paying for; the honest free-tier ceiling is a few hundred
concurrent OBS sources.

## 5. Security model

* Tokens are sealed with AES-GCM in the Worker (`ENCRYPTION_KEY`), stored in D1, never
  returned by any endpoint. `GET /api/runtime/:key/state` and the SSE frames carry only
  derived data.
* The browser gets a `managementToken` via a one-time exchange code; only its SHA-256 is
  stored. Disconnect wipes the sealed token row.
* Webhooks are verified with RSA-SHA256 over `<messageId>.<timestamp>.<rawBody>` using the
  PEM from `GET /public/v1/public-key`, refetched on rotation and cached one hour. Stale
  timestamps (>10 min) and unknown message ids are rejected; replay is deduped by
  `Kick-Event-Message-Id`.
* CORS is an origin allow-list, not `*`. Overlay snapshots already strip token-like keys
  (`src/lib/storage.ts`), and the runtime key is a separate capability from the OAuth
  token, so a published overlay URL cannot act on your channel.
* Event payloads are passed through untouched. Nothing is scraped from Kick's site, and
  no widget HTML from third parties is used; every border, ornament, animation and layout
  stays in this editor.

## 6. Verification checklist

Automated (`npm run test:worker`, Node 22): 12 tests covering the OAuth PKCE handshake,
sealed-token storage, webhook signature/tampering/replay, per-overlay runtime keys,
secret-free runtime state, honest viewer metrics and cron refresh. Run
`npm test` (39 frontend tests) and `npm run build` as well.

Manual, in this order, after deploying:

1. `/api/setup` → `state: DISCONNECTED`, `missing: []`, `followerTotal.supported: false`.
2. Connect Kick account → consent screen lists the three scopes → back on
   **Integrations** the badge reads CONNECTED and the event list shows 8 subscriptions.
3. Start a stream: within one minute the viewer card shows a real number, and the overlay
   viewer widget matches Kick's own display.
4. Send a chat line: it appears in the overlay chat box within ~2 seconds.
5. Follow your own channel from a second account: the latest-follower widget and the
   session follow count increment by one.
6. Kill the OBS browser source and reopen it: chat and alerts resume, nothing is
   duplicated.
7. Disconnect: the overlay runtime returns 409 `integration_disconnected` and no token
   remains in D1.

Until steps 2-6 have been run against a real authorized channel, treat live connectivity
as unverified. The unit tests use a local SQLite shim and a signed fixture webhook, not
Kick's production servers.

## 7. Rollback

`wrangler delete` removes the Worker. `wrangler d1 delete obsidian-overlay` removes the
database. The GitHub Pages editor keeps working without a backend: Integrations reports
`Backend URL` unreachable and every live widget stays empty rather than showing placeholder
data.
