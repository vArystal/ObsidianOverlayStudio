# CP12 — Element audit, test-data removal, real widget behaviour

Scope: every overlay element from configuration to published OBS output, with the rule that nothing
fabricated may appear in production and nothing real may be claimed without evidence.

## What was wrong

Four defects were reproducible in the editor and the published runtime:

1. **Synthetic events became data.** A follow sent by the Integrations test buttons incremented *Session
   follows*, replaced *Latest follower*, queued an alert and entered the chat window. The only marker was a
   small `TEST` chip inside the overlay that OBS was broadcasting.
2. **The alert widget died after 20 alerts.** `LiveAlert` advanced an index cursor over `live.alerts`, which
   the provider trims to the last 20. Once the cursor passed 20 it read `undefined` forever, so a stream that
   had already shown 20 alerts showed none for the rest of the night.
3. **Session follows showed a lifetime total.** The provider adopted `state.sessionFollowerCount` from the
   60-second `/state` poll, which the backend keeps as an all-time counter, under a caption that says "this
   connection".
4. **Invisible placeholders published as if they were content.** An image element with no source drew an
   "Upload an image in Properties" box *inside OBS*, and the webcam and game-capture guides painted dark
   filled rectangles over the scene.

## What changed

- `LiveDataProvider` gained a `testMode` prop, the only route synthetic frames have into state. A frame with
  `test: true` on a normal source still proves the channel is alive but changes no value. The published
  runtime opts in with `?test=1` and then renders a `TEST MODE · SYNTHETIC EVENTS · NOT FOR AIR` banner and
  the per-item `TEST` markers.
- `LiveAlert` now drains a local queue by event id (bounded backlog), which survives history trimming and
  reconnects.
- The follower counter is client-side and per page load, matching its caption ("follows this session"); the
  `/state` poll no longer overwrites it. The lifetime number stays available through the authenticated
  integrations status route.
- Empty image, webcam frame and capture guide publish nothing but transparent geometry.
- Webcam has a real second mode: `Browser camera` requests `getUserMedia` in the source and renders the
  stream, with honest `CAMERA BLOCKED` / `CAMERA UNSUPPORTED` states. Frame mode stays the default so an
  existing OBS camera setup is not disturbed.

## Element matrix

Data source column: what fills the element in a published overlay. "Manual" is a value the streamer types.

| Element | Data source | Works with real data | Notes / limits |
| --- | --- | --- | --- |
| Text | Manual props | Yes | Direction, font, size persist; RTL verified in output |
| Image | Manual upload, optimised data URL | Yes | Published inside the snapshot URL; a source over the budget is refused at publish, and an empty src publishes nothing |
| Shape | Manual props | Yes | Fill/border/radius |
| Frame | Built-in decoration | Yes | Theme-driven ornament |
| Chat | Kick `chat.message.sent` webhook → SSE | Yes (real events verified end to end; see note) | Real sender, colour, badges, timestamps; `TEST` only in test mode |
| Alert (follow, sub, renewal, gift subs, KICKs) | Kick `channel.followed`, `channel.subscription.*`, `kicks.gifted` → SSE | Yes for delivery path; no organic event yet | Queue survives bursts and history trimming |
| Viewer count | Backend poll of `GET /public/v1/users/livestreams` (≥45 s) | Yes | Four states: live, cached/stale, offline, unreachable; never coerced to 0 |
| Session follows | SSE `channel.followed` counted in the page | Yes for delivery path | Resets when the browser source reloads, and says so |
| Latest follower | SSE / `/state` last verified follow | Yes for delivery path | Kernel: no follower total is exposed by Kick, so only the latest is shown |
| Counter | Manual value | Yes | Static by design; not presented as a metric |
| Countdown | Absolute `targetAt`, or fallback minutes | Yes | Absolute target survives reload and OBS restart |
| Donation goal | Manual numbers | Partly | Hidden from output unless "Publish manual sample value" is on; no payment provider exists, so it is never labelled as verified donations |
| Supporter slot | None | No | Excluded from output; the inspector states that no donation provider is connected |
| Webcam | OBS camera behind a frame, or browser camera | Yes in both modes | Frame mode is transparent so it cannot cover the feed; camera mode proves a real MediaStream |
| Game capture | None in browser | No | Layout guide only; transparent; the inspector says to add a Game/Window Capture source in OBS |

## Tests performed

- `npx vitest run` — 89 passing (8 new): synthetic frames change nothing on a live source and are accepted
  in test mode; a lifetime follow total never enters the session counter; the alert widget keeps playing past
  25 sequential alerts delivered under the 20-item window; no image placeholder in output; webcam and capture
  publish transparent; `TEST` markers only in test mode.
- `scripts/probes/cp12-element-audit.mjs` — real Chromium, real build, EventSource stubbed so frames are
  deterministic. Results below are from that run.
- Inspector persistence: `Camera source` on a webcam layer was switched to `camera` through the real control
  and read back from storage (`savedCaptureModes: ["camera", "camera"]`).
- Page errors: none.

### Measured output

| Check | Result |
| --- | --- |
| Synthetic follow + chat on a live source | nothing rendered, session count `0`, no `TEST` marker |
| Genuine follow frame | `real_viewer_42` alert, session count `1` |
| `?test=1` synthetic follow | badge present, alert labelled `TEST PREVIEW`, count `1` |
| Empty image, webcam frame, capture guide | no published box, `background: rgba(0,0,0,0)` |
| Session caption | `follows this session`; the `/state` lifetime value (9) was ignored |
| Chat with one genuine + one synthetic message | only the genuine line rendered |
| Text / counter / countdown / goal / viewer / image | `سلام Arystal` (rtl), `12`, `01:28`, `€40 / €100`, `137 LIVE`, image loaded |
| Browser camera mode | `<video>` with a live MediaStream, no error state |

## Remaining blockers (not fixable in the app)

1. **No organic Kick delivery has ever arrived.** Every element fed by webhooks is verified against genuine
   frames on the real transport path and against the live backend, but the only frames the backend has
   emitted so far are its own viewer metrics. One chat message in `kick.com/arystal` closes this.
2. **Donations.** No provider is connected, so goal and supporter stay manual/excluded. Nothing in the UI
   pretends otherwise.
3. **Game capture.** No browser API reads another application's window; the element is a guide and says so.
4. **Camera inside OBS.** OBS must allow camera access for the browser source; when it does not, the output
   says `CAMERA BLOCKED` instead of showing a stale frame.
