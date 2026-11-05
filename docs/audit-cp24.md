# CP24 audit — what the widget system actually is today

## Existing architecture (before CP24)

One element model, one renderer, one data pipe. There is no second engine to replace, so CP24 extends these:

| Layer | File | Today |
| --- | --- | --- |
| Element model | `src/types.ts` | `ElementType` union (16 types), `OverlayElement` with x/y/width/height/rotation/opacity/visible/locked/animation/decoration/props bag |
| Factory + defaults | `src/lib/elements.ts` | `ELEMENT_LABELS`, `createElement(type)` per-type geometry and props |
| Renderer | `src/components/ElementRenderer.tsx` | One switch, shared by editor canvas and OBS runtime; `DecoratedWidget` applies theme decoration; `runtime`/`preview` flags gate placeholders |
| Live data | `src/components/LiveDataProvider.tsx` | SSE + 60s `/state` poll, id-keyed dedupe set, reconnect backoff and 150s stall watchdog already hardened in CP11 |
| Backend | `worker/index.mjs` | D1, Kick OAuth, 8 subscribed events, `/api/runtime/:key/state` and `/events` |
| Editor UI | `ElementsPanel.tsx`, `PropertiesPanel.tsx` | Hardcoded 16-item library array; per-type JSX sections in the inspector |

## What is real data today

Verified against production (`POST`-free GETs only):

- `/api/runtime/YA7YubY8shoDuEKdrpzkVErW/state` → `connected: true`, `viewer: {status: "offline"}`,
  `latestFollower: greasea`, `channel.slug: arystal`, `followerTotal: {supported: false}`.
- D1 `event_counts` on that connection: `livestream.status.updated: 10`, `chat.message.sent: 10`,
  `channel.followed: 1`. Real deliveries have arrived, so the read path is provable.
- Kick exposes: chat, follows, subscriptions (new/renewal/gifts), KICKs gifts, livestream status and metadata,
  viewer count, active subscriber count, channel slug/description.
- Kick does **not** expose a follower total (`FOLLOWER_TOTAL.supported === false`), and this project has no
  donation provider. Both must render as unavailable, never as a fabricated number.

## Gaps CP24 closes

1. No widget registry: library entries, defaults and inspector sections are three separate hardcoded lists.
2. No widget-level state machine: each widget invents its own disconnected/empty text inline.
3. Stream information (title, category, live state, duration) is normalised by the backend webhook handler but
   never persisted or exposed, so no widget can show it.
4. Recent followers/subscribers lists and an activity feed do not exist; only "latest follower" does.
5. No clock, no social links, no subscriber counter widget.

## Plan

1. `src/lib/widgets.ts` — one registry (type, group, label, blurb, icon key, default size, prop defaults,
   control groups, data requirement, availability) that drives the library, the inspector and reset.
2. `src/lib/widgetData.ts` — one normalised snapshot + `widgetStatus()` state machine
   (`ok | loading | empty | disconnected | unavailable | error`) used by every widget.
3. `src/components/widgets/*` — shared renderers, called from `ElementRenderer` for both surfaces.
4. Backend: persist `stream_info` from `livestream.status.updated` / `livestream.metadata.updated` and from the
   existing channel poll, expose it in `/state`.
5. LiveDataProvider: carry `stream`, `recentFollowers`, `recentSubscribers`, `activities`, `eventCounts`.
6. Editor: registry-driven library with search; registry-driven inspector sections + per-widget reset.
7. Tests, axe pass, 5/10/20-widget performance probe, deploy and verify on production.
