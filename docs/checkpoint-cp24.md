# CP24 — Production-grade widget system

Checkpoint date: 2026-11-05. Scope: CP24 only. Commit `187021c` on `main` and on the deploying branch
`arena/35be064d-jubilant-octo-lamp`. Deployed bundle `index-Dkq9G8nS.js`, API worker
`https://obsidian-overlay-api.pages.dev` (Pages project `obsidian-overlay-api`, branch `main`, deployment
`7cf0eea4`). Backend migration `worker/migrations/0002_stream_info.sql` applied to the production D1 database.

Verdict: **PASS WITH WARNINGS** (see section H).

---

## A. What the audit found

The element model was already type-driven (`OverlayElement.type` + free-form `props`), but every widget was
implemented twice: once in `ElementRenderer` for the canvas and once more in the runtime shell, and the library
panel carried its own hand-written list of names, blurbs and default sizes. Three consequences, all confirmed in
the code before any change:

1. **Duplicated truth.** `ELEMENT_LABELS`, the library entries in `ElementsPanel` and the per-type defaults each
   described the same widget. New copy or a new default meant editing two or three places, and drift showed up as
   a library blurb that no longer matched what the element did.
2. **Untyped live data.** `LiveDataProvider` exposed `viewer`, `latestFollower`, `sessionFollowerCount` and an
   event history, but nothing for the broadcast itself (title, category, uptime, subscriber count). Widgets that
   needed those values either guessed or rendered a placeholder that looked like data.
3. **No shared "state" vocabulary.** Every widget decided on its own how to say "not connected", "no data yet" and
   "this integration cannot provide that". Some coerced missing numbers to `0`, which is a lie on air.

## B. Architecture

One registry, one snapshot, one set of renderers, both surfaces.

| Piece | File | Responsibility |
| --- | --- | --- |
| Registry | `src/lib/widgets.ts` (260 lines) | 26 widget definitions: `type`, `label`, `blurb`, `group`, `icon`, default `width`/`height`, `controls` groups, `data` need (`kick` / `manual` / `none`), `availability` (`ready` / `requires-kick` / `unavailable`), capability `note`, and `defaults` for every prop. Also search, `createWidgetProps`, `resetWidgetProps`, grouping. |
| Snapshot + state machine | `src/lib/widgetData.ts` (148 lines) | `widgetSnapshot(live)` normalises the provider into one shape (`title`, `category`, `isLive`, `startedAt`, `viewers`, `activeSubscribers`, `latestFollower`, `sessionFollowers`, `recentFollowers`, `recentSubscribers`, `activities`). `WidgetPhase` = `live \| loading \| empty \| disconnected \| unavailable \| error`, derived by `connectionPhase` / `dataPhase` / `fieldPhase`. `formatDuration`, `formatClock`, `formatCount`, `toActivity`. |
| Shared renderers | `src/components/widgets/index.tsx` (282 lines) | React components for the 10 new widget types. Imported by `ElementRenderer`, which is used by the editor canvas and by the published runtime, so there is exactly one implementation of each widget's markup. |
| Widget settings UI | `src/components/editor/WidgetSettings.tsx` (152 lines) | Inspector section generated from `controls` + `defaults`, with per-widget reset. |
| Provider | `src/components/LiveDataProvider.tsx` | Adds `stream`, `channel.activeSubscribers`, `recentFollowers`, `recentSubscribers`, `activities`, fed by the existing SSE webhook pipeline and `/state` poll. |
| Worker | `worker/index.mjs`, `worker/schema.sql` | `connections.stream_info` column, persisted from `livestream.status.updated` / `livestream.metadata.updated`; `/state` returns `stream` and `channel.activeSubscribers`. |

Nothing was rebuilt. `ElementRenderer`, `PropertiesPanel`, the runtime page, the theme system, the background
engine and the container system keep their existing contracts; the registry is additive.

## C. The 26 widgets

| Group | Widgets | Data |
| --- | --- | --- |
| Stream | Stream title, Live status, Category / game, Stream duration, Active subscribers | Kick (webhook + `/state`) |
| Community | Recent followers, Recent subscribers, Kick chat, Live viewers, Follows this session, Latest follower, Latest supporter | Kick events |
| Alerts | Event alert | Kick events |
| Goals | Goal progress, Custom counter, Countdown | manual |
| Content | Text, Image / logo, Shape / border, Empty container, Ornamental frame, Clock, Social links | none |
| Planning | Game capture plan, Webcam frame | none |

Availability is shown in the palette as `Needs Kick` or `Not available`, and the inspector carries the capability
note for that specific widget, so an unavailable metric is named as unavailable instead of rendered as `0`.

### Honesty rules encoded in `widgetData`

- A `null` value never becomes `0`. `formatCount(null)` returns an em dash.
- A connecting or reconnecting stream reports `loading`, never last-known numbers dressed as live ones.
- A widget with no Kick connection reports `disconnected` with "Kick not connected" regardless of its default
  content, so a fresh overlay cannot look live.
- A field Kick does not expose reports `unavailable` with the reason, which is why follower total and donations are
  absent from the registry rather than faked.
- Test frames (`?test=1`) never become data, unchanged from CP12.

## D. Tests

| Suite | Count | Result |
| --- | --- | --- |
| `vitest` frontend | 187 | pass |
| `node --test server/*.test.mjs` | 49 | pass |
| `node --test worker/index.test.mjs` | 24 | pass |

New coverage in this checkpoint:

- `src/lib/widgets.test.ts`: registry completeness against every `ElementType`, unique labels, valid default
  geometry, controls referencing declared defaults, availability/note pairing, search behaviour (label + blurb +
  type), factory defaults and reset.
- `src/lib/widgetData.test.ts`: every phase transition, null-never-zero, duration/clock/count formatting, activity
  mapping for follow / subscription / gift / chat, viewer and subscriber parsing.
- `src/components/widgets/widgets.test.tsx`: renders all 10 new widgets in each phase and asserts the visible text.
- Parity: the same component tree is asserted byte-identical between canvas and runtime hosts.
- `worker/index.test.mjs` +2: `/state` exposes the stored stream description and `activeSubscribers`; an overlay
  with no stored description reports `null` rather than a blank title. While writing these, the fixtures were
  wrong, not the code: a runtime key lives in `publications`, not `connections`, and `makeEnv()` returns
  `{ sqlite, env }`.
- One pre-existing editor test (`src/pages/OverlayEditor.test.tsx`) clicked palette entries by blurb. It now targets
  the stable `[data-widget-type]` contract, because blurbs are copy and copy changes.

## E. Browser evidence (local build and production)

Probe: `scripts/probes/cp24-widgets.mjs` (adds every new widget through the real palette), plus
`scripts/probes/cp24-gallery.mjs` for the composed gallery shots. Both accept `SITE=<url>`; production numbers
below come from `https://varystal.github.io/ObsidianOverlayStudio`.

| Check | Local | Production |
| --- | --- | --- |
| Palette entries | 26 across 6 groups | 26 across 6 groups |
| Search `clock` / `follower` / `zzzz` | 1 / 3 / 0 | 1 / 3 / 0 |
| Widgets added through palette | 10 | 10 |
| Widget shells rendered on canvas | 10 | 10 |
| Runtime shells | 10 | 10 |
| Editor vs runtime widget text | identical | identical |
| Inspector title | "Widget · Recent followers" | same |
| Rows field 5 → 19 → reset | 19 then 5 | 19 then 5 |
| Runtime controls present | 0 | 0 |
| Runtime document size | 1920×1080, no scrollbars, transparent body | same |
| rAF fps at 5 / 10 / 20 widgets | 60.6 / 60.3 / 60.5 | 60.4 / 60.5 / 60.5 |
| axe (WCAG 2.0 AA) on editor | 0 violations | 0 violations |
| Page errors | 0 | 0 |
| `cp8-journey-probe` | — | 14 / 14 |
| `cp12-element-audit` | — | pass, 0 page errors |

Screenshots (real renders, not mockups):

- `artifacts/cp24-widget-gallery.png`: all 10 new widgets on a grid in the editor.
- `artifacts/cp24-widget-gallery-runtime.png`: the same composition in the published runtime at 1920×1080.
- `artifacts/cp24-editor.png`, `artifacts/cp24-runtime.png`: the default cascade placement, editor and runtime.
- `artifacts/cp24-runtime-frames.png`: the runtime after real-shaped frames (title, LIVE, category, uptime,
  active subscribers, follower, subscriber, activity feed).
- `artifacts/cp24-editor-axe.png`: the editor state axe was run against.

## F. Production runtime proof

`GET https://obsidian-overlay-api.pages.dev/api/runtime/<runtime_key>/state` on the live deployment:

```json
{
  "connected": true,
  "viewer": { "status": "offline", "count": null, "updatedAt": "2026-11-05T11:00:37.577Z" },
  "latestFollower": { "userId": 132276603, "username": "greasea", "channelSlug": "greasea" },
  "sessionFollowerCount": 5,
  "channel": { "slug": "arystal", "description": "", "activeSubscribers": 0 },
  "stream": null,
  "lastEventAt": "2026-11-04T17:51:29.475Z",
  "followerTotal": { "supported": false, "reason": "Kick public API exposes no total follower count" }
}
```

The two new fields are present and honest: the channel is offline, so `stream` is `null` and the title widget says
so instead of showing a stale title; `activeSubscribers` is Kick's own count for this channel.

## G. Backward compatibility

- `props` stays free-form, so every saved overlay loads unchanged. Widgets read props through the registry defaults
  when a key is absent, which is why an overlay saved yesterday renders with today's layout and today's defaults.
- Unknown element types are untouched: the renderer falls through to the existing generic path.
- Duplicated overlays, published snapshots and existing animations are unaffected: no field was renamed and no
  element id or `animation` value was rewritten.
- The provider only adds fields to `LiveDataState`; nothing reads a removed key.

## H. Warnings and limits

1. **No genuine Kick connection could be exercised inside the probe browser.** The management token lives only in
   the browser that created the connection (documented since CP9), so the probe browser can open the runtime but
   cannot attach a channel. Live rendering is therefore evidenced two ways instead of one: the production `/state`
   payload above, and `artifacts/cp24-runtime-frames.png`, which is produced by injecting frames that copy the
   documented Kick event shapes. The screenshot proves the widgets render real-shaped data; it is not a claim that
   the probe browser was connected, and this report does not make that claim.
2. **Active subscribers may undercount.** The value is Kick's `active_subscribers_count`. For this channel it is
   `0`, which is reported as `0` (not as unknown) because Kick answered. Channels that report the field lazily may
   show `0` until the first poll.
3. **`stream` stays `null` until a livestream event arrives.** That is deliberate (an offline channel has no
   title), but it means a streamer going live for the first time sees the "Kick not reported" state until Kick
   sends `livestream.status.updated`.
4. **The registry has 26 entries, not 27.** The CP24 brief and the audit notes said 27; the registry test asserts
   it covers every `ElementType`, and that set is 26. The extra number came from counting "Follower total" as a
   widget while it is in fact an explicitly unavailable metric.
5. **`cp221-interactions.mjs` reads storage before the 765 ms autosave** for the container resize step, so its
   `storageAfter` can print the pre-resize size while the on-screen box moved correctly. Pre-existing probe timing,
   not a CP24 change; containers, selection and resize were not touched in this checkpoint.

## I. Files touched

```
src/lib/widgets.ts                     new   registry, search, defaults, reset
src/lib/widgetData.ts                  new   snapshot + phase machine + formatters
src/lib/widgets.test.ts                new
src/lib/widgetData.test.ts             new
src/components/widgets/index.tsx       new   10 shared widget renderers
src/components/widgets/widgets.test.tsx new
src/components/editor/WidgetSettings.tsx new  registry-driven inspector section
src/styles/widgets.css                 new
src/components/ElementRenderer.tsx     render new widget types through the shared components
src/components/LiveDataProvider.tsx    stream / subscribers / recent lists / activity feed
src/components/editor/ElementsPanel.tsx registry-driven library + search + availability badges
src/components/editor/PropertiesPanel.tsx mounts WidgetSettings
src/lib/elements.ts                    factory uses registry defaults
src/types.ts                           LiveDataState and element prop types
worker/index.mjs                       stream_info persistence + /state exposure
worker/schema.sql                      connections.stream_info
worker/migrations/0002_stream_info.sql applied to production D1
worker/index.test.mjs                  +2 state tests
src/pages/OverlayEditor.test.tsx       palette clicks by data-widget-type
scripts/probes/cp24-widgets.mjs         new   browser evidence
scripts/probes/cp24-gallery.mjs         new   composed gallery shots
scripts/probes/cp8-journey-probe.mjs    palette clicks by data-widget-type
```
