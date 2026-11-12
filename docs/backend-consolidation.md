# Backend consolidation: one implementation, two runtimes

Status: **decided, not yet executed.** Written after the P0–P2 hardening pass (see
`docs/review-2026-11.md`).

## The problem

`server/` (Node, dependency-free) and `worker/index.mjs` (Cloudflare) implement the same OAuth 2.1 PKCE flow,
webhook verification, token refresh policy, event normalization, publication storage and SSE fan-out. Two
copies of security-relevant logic drift, and the drift is invisible until a streamer's alerts break.

## Decision

**Target: the Cloudflare worker, with the Node server kept as the local development and test harness.**

Reasons:

- Production already runs on Pages Functions (`obsidian-overlay-api.pages.dev`); the Node server is not
  deployed. Keeping the deployed one authoritative avoids a migration.
- The worker has durable storage (D1) available, which is the fix for the whole class of write-race defects
  the JSON store needed a queue to survive.
- The Node server is the only place these behaviours can be tested cheaply, so it stays as the reference
  implementation and the test host rather than being deleted.

## Module boundary

Extract into a runtime-neutral `shared/` directory, imported by both:

| Module | Contents | Notes |
| --- | --- | --- |
| `shared/verify.mjs` | `verifyKickWebhook`, header parsing, timestamp skew, version check | Pure; no I/O. Already takes the public key as an argument. |
| `shared/normalize.mjs` | `normalizeKickEvent`, `person()` | Pure. |
| `shared/pkce.mjs` | `createPkce`, `randomToken`, `hashSecret`, `safeEqual` | Node built-ins only; the worker has WebCrypto, so these need a small adapter or a WebCrypto rewrite. |
| `shared/refresh.mjs` | `createTokenRefresher`, `validAccessToken` policy | Takes `store` and `client` as injected ports. |
| `shared/status.mjs` | `publicStatus`, `redact`, the webhook status table | Pure given a connection snapshot. |

Storage stays platform-specific behind one interface: `createStore(adapter)` exposing
`saveConnection`, `updateConnection`, `claimMessage`, `incrementSessionFollowers`, `createPublication`,
`removePublication`, `findByRuntimeKey`, `findByBroadcasterId`, `runtimeKeysForConnection`. The Node adapter
is the current file store; the worker adapter becomes a D1 adapter using transactions, which removes the need
for a promise-queue in production.

## Order of work

1. Extract the pure modules (`verify`, `normalize`, `status`) and point both runtimes at them. No behaviour change.
2. Port the P0 fixes into the worker: atomic claim, post-delivery marking, queued/delta increments. In D1 these
   become single statements (`INSERT ... ON CONFLICT DO NOTHING RETURNING` for the claim, `SET count = count + 1`
   for the counter) inside a batch.
3. Add a worker test host (Miniflare or `wrangler dev` plus a scripted webhook) so worker changes stop being
   untestable.
4. Only then retire the duplicate SSE and publication code.

## Deliberately not done yet

Steps 2–4 need a deployed or emulated Cloudflare environment. Changing the live webhook path without a test
host is the exact failure mode this document exists to prevent.
