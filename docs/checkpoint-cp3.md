# CP3 — Element completeness: every widget measured against its contract

Date: 2026-10-28. Branch: `arena/35be064d-jubilant-octo-lamp` (production).

## Defects corrected in this checkpoint

| # | Defect | Evidence before | Fix |
| --- | --- | --- | --- |
| D1 | Three chat inspector controls had no renderer effect: `showTimestamps`, `showBadges`, `scrolling` | CP0 code read; the chat widget rendered name + text only while the backend already shipped `createdAt`, `usernameColor` and `badges` | Timestamps render as `HH:MM` from the real `createdAt`; badges render as pills from the real identity badges (first three, `text ×count`); `scrolling` now switches the feed between bottom-pinned and top-stacked |
| D3 | Countdown used a bare duration and restarted on every reload | CP0 code read | `targetAt` (absolute datetime) is honoured and the fallback duration is labelled as restarting with the overlay |
| D-new | Viewer count collapsed `stale` and `unavailable` into the offline label | `status === 'live' ? count : offlineText` | Four distinct states: live, cached-stale (count still shown), offline, unreachable. An API failure can never render as `0` |

## Measured evidence

`scripts/probes/cp3-element-controls-probe.mjs` (headless Chromium, production build):

| Check | Result |
| --- | --- |
| Chat timestamps toggle | `.chat-time` count 0 → 3 after enabling |
| Chat badges toggle | `.chat-badge` count 3 → 0 after disabling |
| Chat feed alignment | `chat-scroll` → `chat-stack` when the toggle flips |
| Countdown before target | `09:59` (duration fallback) |
| Countdown after setting a target 3 h ahead | `2:59:15` (hours format) |
| Countdown after reload | `2:59:13` — continues, does not restart |
| `targetAt` persisted | `2026-10-28T19:08` in storage |
| Page errors | 0 |

Unit tests added (vitest, 44 → 56):

- chat: timestamp rendered only when enabled, badge text `SUB ×3` only when enabled, feed class follows the toggle.
- countdown: absolute target produces an hours-format readout; a past target shows `00:00` with a finished class.
- viewer metric: live shows the count and `LIVE`; stale keeps `42` with `CACHED · STALE` and a `viewer-stale` class; offline shows the offline label and never `0`; unavailable shows `Unavailable` and `KICK API UNREACHABLE`.
- capability sweep: all 15 element types render editor markup and runtime markup without throwing; `webcam` and `capture` default to `includeInOutput: false`.

## Capability matrix (as of this checkpoint)

| Element | Status | Contract and honest limits |
| --- | --- | --- |
| Text | WORKING | Content, family, size, weight, colour, alignment, direction incl. RTL; Persian shaping verified in a browser |
| Image / logo | PARTIAL | Data-URL assets only, device-local; a published snapshot carries the image inside its URL. Persistent hosting is CP4 |
| Shape / border | WORKING | Fill, stroke, radius; decorative, no text by design |
| Decorative frame | WORKING | Preset frames, corners, inner border |
| Webcam frame | MOCK (labelled) | "Your camera remains an OBS Video Capture Device. This browser layer cannot capture it." Excluded from output by default |
| Capture frame | MOCK (labelled) | "Not a capture source. Add Game/Window/Display Capture separately inside OBS." Excluded from output by default |
| Chat | WORKING | Real webhook messages, avatars, usernames, timestamps, badges, max count, per-message expiry, entrance/exit animation, dedupe by id |
| Event alert | WORKING | Follow, subscription, renewal, gifted sub, gifted Kicks mapped from verified payloads; test events carry a TEST mark |
| Donation goal | MOCK (labelled) | Manual values, no donation provider exists; renders "MANUAL PREVIEW · NOT VERIFIED PAYMENT DATA" and is excluded at runtime unless explicitly included |
| Custom counter | WORKING | Manual, persistent value, clearly manual |
| Countdown | WORKING | Absolute target survives reload; duration fallback explicitly labelled as restarting |
| Latest supporter | MOCK (labelled) | "No donation provider is connected, so this widget is excluded at runtime." |
| Viewer count | WORKING | Official live metric with four honest states |
| Session follows | WORKING | Real `channel.followed` events since this runtime connected; not a lifetime total |
| Latest follower | WORKING | Most recent genuine follow observed, explicit empty state, no invented identity |
| Follower total | MISSING by design | The official public API exposes no total; shown as unsupported rather than fabricated |

## Result

PASS for the three element defects and for a reproducible contract on all 15 types. Remaining CP3 gap: image assets are still data-URLs, which belongs to CP4 (asset lifecycle) because a fix needs storage decisions, not renderer work.
