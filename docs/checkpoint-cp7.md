# CP7 — Security, accessibility and performance: measured, then fixed

Date: 2026-10-28. Everything below is a measurement from production, not a review of intent.

## Accessibility (axe-core 4.10.2, WCAG 2 A + AA, 1440×900, production build)

| Surface | Before | After |
| --- | --- | --- |
| Overlay list | 0 violations | 0 violations |
| Editor | **3 violations** (1 critical, 2 serious) | **0 violations** |
| Integrations | 0 violations | 0 violations |

What the editor was failing, and the fix:

- `aria-required-children` (critical): `.panel-tabs` declared `role="tablist"` while its children were
  plain buttons, so the tablist was invalid. Each control is now a real `tab` with `aria-selected`,
  `aria-controls` and a roving `tabIndex`; each mounted panel is a `tabpanel` whose `aria-labelledby`
  points back; Arrow Left/Right switch panels and move focus.
- `color-contrast` (serious, 2.9:1): the layer-count badge at 8px `#6f6f7b` on `#292933`. Now 9px
  `#d6d6e2` on `#33333f`; the tab labels themselves went from 9px `#6f6f7b` to 10px `#9c9caa`.
- `color-contrast` (serious, 3.05:1): the `px` suffix inside number inputs at 7px `#646470`. Now 9px
  `#9c9caa`.

The editor test that asserted these controls by `role="button"` was asserting the defect, so it now
queries `role="tab"` with the same expected counts in the same order (2, 1, 2, 1, 2, 6). New tests lock
the tablist contract: three tabs, `aria-selected` state, every `aria-controls` resolving to a mounted
panel that points back, and arrow-key switching with focus movement.

## Security

Audited and, where it was genuinely wrong, changed:

| Check | Result |
| --- | --- |
| `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` in `src/` | none |
| Server-side fetch targets | only `https://api.kick.com` + fixed paths (`kickFetch`), so there is no user-supplied URL to abuse: no SSRF surface |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Origin allowance | **fixed**: only a request whose `Origin` is on `APP_ORIGINS` receives `access-control-allow-origin`; a foreign origin now receives none, and `vary: origin` is always set |
| Crash responses | **fixed**: a 500 now returns `{"error":"internal_error"}` with the detail logged server-side, instead of embedding a driver message (SQL, table and binding names) in a public response |
| Public runtime routes | scoped to the runtime key; `/state` returns channel, viewer, follower, no token, no management hash (asserted in tests) |
| Management routes | `401` without a bearer token, verified live against production |
| Response caching | `no-store` on every JSON response and on the SSE stream |
| Secrets in the browser | the frontend bundle never contains client secret, tokens or encryption key; the OAuth exchange code is one-time and 15 minutes |

Live checks after deploy: `Origin: https://evil.example` → no `access-control-allow-origin`;
`Origin: https://varystal.github.io` → allowed; an OBS-style request with no `Origin` → `state 200`;
`/api/integrations/kick` without a token → `401`.

Known, documented limits rather than fixes: GitHub Pages cannot set CSP or other security headers for
the app shell (the API does set `nosniff`, `no-referrer`, `no-store`), and Pages Functions have no
platform rate limiter, so abuse resistance on the ingress rests on signature verification plus the
public-key refresh budget added in CP5.

## Performance

| Measurement | Value |
| --- | --- |
| App shell load (production, cold) | 372 ms DOMContentLoaded, 2 requests |
| Compressed payload | 112 KB JS, 16 KB CSS |
| Editor with 60 elements: 30 pointer-move drags | 18 ms total |
| Editor autosave write (60 elements) | < 1 ms |
| `/api/runtime/<key>/state` latency, 10 sequential samples | 0.151–0.239 s (median ≈ 0.17 s) |
| Console/page errors on the measured routes | 0 |

Architecture facts that bound the cost, checked in code rather than assumed:

- One `LiveDataProvider` per overlay owns the only SSE stream and a single 60 s state poll. Elements do
  not poll independently, so adding widgets cannot multiply backend traffic.
- The Kick viewer refresh is throttled per connection (`VIEWER_MAX_AGE_MS`), so extra overlay clients
  reuse the cached metric instead of each triggering an API call.
- The SSE tail query filters on `runtime_key` + `seq` and both are indexed (`idx_events_runtime`), with
  `idx_events_received` covering the hourly prune.

## Test totals at this checkpoint

67 frontend (vitest) + 28 legacy server + 19 Pages worker = **114 tests**, all passing, `tsc -b` and
`vite build` clean.
