# CP11 — the stream has to repair itself

An OBS browser source runs for hours with nobody watching the page. Two ways it used to die quietly, and
one way it lied, all in `src/components/LiveDataProvider.tsx`:

1. **A fatal close never retried.** `EventSource` retries the transient kind on its own, but once it is
   `CLOSED` it stops for good, and the provider only set the label to `error`. A backend deploy, a
   redeploy of the Pages project, or a 5xx at reconnect time left the overlay dead until someone reloaded
   the source by hand, which on a stream means until the stream ends.
2. **A silently dead connection was never noticed.** A stream can stay "open" while delivering nothing,
   which is what a NAT timeout or a half-open socket looks like. Nothing measured liveness, so a stalled
   channel looked identical to a quiet one.
3. **A successful state poll disguised a dead stream.** The 60s `/state` poll wrote `connecting` over any
   non-connected label, so the page could claim to be re-establishing while it was actually stuck.

## What it does now

- Fatal close: retry on its own with backoff 1s, 2s, 5s, 10s, 20s, 30s. Attempt counter resets on open.
  Past five consecutive failures the label escalates to `error`, and retries continue anyway, because a
  broken source should still be able to heal by itself.
- Liveness: heartbeats. The backend already sent `: keepalive` comments, which `EventSource` swallows
  without firing any event, so the client could not see them. `worker/index.mjs` now also emits a real
  `event: heartbeat` on every idle poll (2s), and the client treats frames, heartbeats and a successful
  `/state` poll as signs of life. 150s of total silence triggers a reconnect.
- Single-flight retries: the watchdog ticks every 30s and the backoff ceiling is also 30s, so without a
  guard each tick cancelled and re-armed the pending retry and recovery could be postponed forever. The
  probe's failing assertion is what surfaced this.
- The state poll no longer overwrites `reconnecting` or `error`.

## Evidence

Unit: `LiveDataProvider.reconnect.test.tsx` (5 tests) covers fatal-close recovery, growing backoff,
error escalation with retries continuing, stall detection, and no reconnect after unmount. The two older
assertions that expected a permanent `error` on close were updated, since that expectation encoded the bug.

Live: `scripts/probes/cp11-stream-recovery.mjs` drives the deployed runtime against the real backend,
kills `/api/runtime/*/events` with a 503, then restores it.

| Bundle | Retries during outage | Backoff gaps | Recovered without reload |
| --- | --- | --- | --- |
| pre-fix | 0 | none | (n/a, needed a reload) |
| fixed | 5 | 2s, 5s, 10s | yes, 2 attempts, 0 page errors |

Probe gotcha worth keeping: the server closes each stream after a 25s window, so an outage must outlast
one window before the client has any reason to request again. A 12s outage recorded zero attempts even on
the fixed build, because the already-open connection simply kept streaming; only the window boundary
forces a new request. The first run of this probe therefore proved nothing, which is exactly the kind of
result that looks like a defect.

Backend: `an idle stream emits a heartbeat event the client can actually observe` asserts the named event,
because a comment-only keepalive is invisible to the browser.

## Deployment note

`npm run deploy:pages` deploys `worker/pages`, not the repository root. Deploying the root replaces the
API with the frontend's `index.html` and every API route starts answering with that page.
