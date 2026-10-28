# CP5 — Kick pipeline: what is proven, and the one link only a real event can prove

Date: 2026-10-28. Backend deployed to `obsidian-overlay-api.pages.dev`; frontend on `main`.

## Live state, read from D1 and the deployed API (not assumed)

| Fact | Evidence |
| --- | --- |
| The connection exists and is live | `connections` row `con_6swqGvz0Dluf`, `Arystal`, `account_user_id 90124079`, `connected = 1`, sealed tokens present, 8 subscriptions |
| The stored Kick token still works | Lazy viewer refresh wrote `viewer.updatedAt` minutes before reading; `status: offline` with `count: null` is a successful Kick answer, not a failure |
| The runtime state route serves real data | `GET /api/runtime/<key>/state` → `connected: true`, channel `arystal`, `followerTotal.supported: false` with the reason, `serverTime` |
| The SSE tail works | `GET /api/runtime/<key>/events` → `event: ready` then `overlay-event` frames carrying `metric.viewer.updated` |
| Our verifier handles Kick's real key | Fetched `GET /public/v1/public-key` (200, `-----BEGIN PUBLIC KEY-----`, 450 bytes) and ran `verifyKickSignature` against it: a forged signature is rejected, garbage base64 is rejected, no throw |
| **No genuinely signed delivery has been observed yet** | `connections.last_event_at` is `NULL`, `connections.event_counts` is `{}`, `processed` is empty. The two 15:21 rows were app test-button events, which bypass the webhook route |

That last row is the honest gap. Everything up to Kick's own delivery is verified; the delivery
itself has not happened yet because nobody has followed, subscribed or chatted on the channel since
the webhook endpoint was hardened.

## Defects fixed in the ingress

| # | Defect | Why it mattered | Fix |
| --- | --- | --- | --- |
| W1 | Every invalid signature forced an outbound refetch of Kick's public key | Anyone could burn our request budget and get the integration rate limited by sending junk | Forced refresh is budgeted to one per 60s (`mayForcePublicKeyRefresh`); the cached key keeps verifying genuine deliveries |
| W2 | Dedupe was `SELECT` then `INSERT`, so two concurrent copies of one delivery could both queue an event | A duplicated follow double counts the session follower number | The claim is now the `INSERT OR IGNORE` itself; a request that changes no rows stops at 204 |
| W3 | Body cap was measured in UTF-16 units, not bytes | A multibyte body could pass a 256 KB "size" check while being twice that on the wire | `byteLength()` measured with `TextEncoder` |
| W4 | `Kick-Event-Version` was accepted from any value | Unversioned payload shapes would be normalised as if current | Only version `1` is accepted; anything else is `400 unsupported_version` |
| W5 | Timestamps were only bounded symmetrically at 10 minutes | A delivery dated far in the future stayed valid for its whole window | Future skew is now 60 s, past window stays 10 min |
| W6 | Event rows are pruned after an hour, leaving no durable proof of what arrived | "Did a real webhook ever land?" became unanswerable | `connections.event_counts` keeps per-type receipts permanently; surfaced as `eventCounts` on the authenticated status route |
| W7 | `/api/setup` returned `state: "DISCONNECTED"` and `runtime: "cloudflare-workers"` on a live Pages deployment | Easy to misread as "there is no connection"; the runtime label was wrong | Added `connectionStateKnown: false` and an explicit note, corrected the runtime label to `cloudflare-pages` |

## Live rejection proofs against production

| Request | Result |
| --- | --- |
| No `Kick-Event-*` headers | `401` |
| Bad signature | `401 {"error":"invalid_signature"}` |
| `Kick-Event-Version: 9` | `400 {"error":"unsupported_version"}` |
| Timestamp `2020-01-01` | `401 {"error":"stale_timestamp"}` |
| Timestamp one hour in the future | `401 {"error":"stale_timestamp"}` (previously inside the accepted window) |
| 1.2 MB body | `413` |

Worker tests: 17 → 18, covering the byte cap with a payload that is under the old character limit
but over the byte limit, the version rejection, future-dated rejection, the key-refresh budget
(warm cache, three junk deliveries cost exactly one refetch, two more cost none), and durable
per-type counters that ignore redeliveries.

## The remaining step, which needs one real event

Only a genuinely signed Kick delivery can close this. With the channel connected, any one of these
produces it:

1. Type a message in `kick.com/arystal/chat`. Expect `chat.message.sent` in the chat overlay within
   a second and `last_event_at` / `event_counts` to become non-null.
2. Have any viewer follow the channel. Expect the latest-follower widget to change and
   `event_counts["channel.followed"]` to increase.

After either, the check is `GET /api/runtime/<key>/state` for `lastEventAt`, plus
`eventCounts` on the authenticated status route, plus the overlay itself in OBS. A 401 in Kick's
developer dashboard delivery log would instead mean the signature scheme differs from what is
implemented, which the live rejection proofs above cannot distinguish from an attacker.
