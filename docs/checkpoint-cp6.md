# CP6 — OBS runtime: measured against production, not assumed

Date: 2026-10-28. Probe: `scripts/probes/cp6-obs-runtime-probe.mjs` (headless Chromium driving the
real GitHub Pages runtime with the real backend runtime key).

## What was actually loaded

A published snapshot URL, exactly the string a user pastes into OBS, carrying three live elements
(viewer count, latest follower, chat) and the live config of the production backend. So the SSE
stream, the viewer metric, the empty states and the font all came from production.

| Check | 1920×1080 | 1280×720 | 900×1600 |
| --- | --- | --- | --- |
| Stage scale | 1 | `0.666667` (= 1280/1920) | `0.46875` (= min(900/1920, 1600/1080)) |
| `body` background | `rgba(0, 0, 0, 0)` | same | same |
| Overlay surface background | `rgba(0, 0, 0, 0)` | same | same |
| Horizontal overflow | none | none | none |
| Vertical overflow | none | none | none |
| SSE `/events` response | `200` | `200` | `200` |
| Viewer value from the real backend | `آفلاین` / `OFFLINE` | same | same |
| Latest follower with no data | `No follower yet` | same | same |
| Chat rows with no messages | `0` | `0` | `0` |
| Vazirmatn loaded (`document.fonts.check`) | true | true | true |
| Page errors | 0 | 0 | 0 |

Transparency, scaling and overflow were already recorded in CP0; this run confirms them on the live
site with live data attached, and adds the two things CP0 could not see: the SSE stream connects
through the published URL, and an empty overlay shows honest empty states rather than invented rows.

## Defects fixed

| # | Defect | Effect before | Fix |
| --- | --- | --- | --- |
| R1 | "Open output" on the overlay list opened `/overlay/<publicId>` with no snapshot | The link only resolved in the browser that authored the overlay; on any other machine, or after clearing storage, it showed "Overlay unavailable" | The saved composition is encoded into the URL, and the button is annotated `(warn)`/`(blocked)` with the size reason in its tooltip when the snapshot is too large to load |

Invalid snapshot handling was verified rather than changed: a garbage snapshot renders
"Overlay unavailable / This local design or snapshot could not be found." instead of a blank page.

## Long-run stability

The runtime is meant to sit in OBS for a whole stream, so the transport was tested for the failure
modes that only appear after hours:

- Chat is capped at the newest 50 messages; alerts at 20; seen ids at 500 (trimmed to the last 250).
  New tests push 60 messages and 25 follows through the provider and assert the caps and that the
  newest survive.
- A redelivered event id is dropped instead of rendering twice.
- A dropped stream reports `reconnecting`, a closed one reports `error`, and the 60 s state poll keeps
  the viewer metric fresh even while the stream is down, so a silently dead source does not freeze
  at a stale number forever.

Provider tests: 4 → 8.

## OBS configuration this runtime is built for

- Browser Source width/height: use the canvas size the editor reports (1920×1080 by default). Any
  other size is scaled proportionally; nothing is cropped because the stage is centred by
  `min(vw/W, vh/H)`.
- Do not add custom CSS. Transparency comes from the page itself (`rgba(0,0,0,0)` on both the body and
  the overlay surface), so a custom CSS background would only break it.
- "Shutdown source when not visible" is safe: on reload the runtime re-fetches `/state` and the stream
  replays a 90 s tail, so the viewer number and channel state recover by themselves.
- "Refresh browser when scene becomes active" is also safe for the same reason, and is the cheapest
  way to reset a long stream's memory. It clears the chat feed, which is ephemeral by design.
- Fonts are self-hosted (`assets/fonts/Vazirmatn-*.woff2`), so Persian text does not depend on a CDN
  being reachable from the OBS machine.
