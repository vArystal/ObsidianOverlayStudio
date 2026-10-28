# Obsidian Overlay Studio

A local-first React + TypeScript visual editor for transparent OBS Browser Source overlays, with a premium Persian gaming design system and an optional official Kick integration backend.

The canvas starts empty. No template or collection of widgets is inserted unless the user explicitly adds it. OBS—not this web app—continues to capture the game, desktop, and camera.

## Highlights

- Drag, eight-handle resize, layer order, visibility, locking, duplication, keyboard movement, alignment, snapping, undo/redo, logical resolutions, fit/zoom, and local persistence.
- Four editable, non-destructive themes: **Royal Persian**, **Persian Turquoise**, **Imperial Night**, and **Minimal Esports**. Switching themes does not move elements or replace their content.
- Independently removable Persian decoration presets with outer/inner borders, ornamental corners, dividers, girih/eslimi patterns, gradients, shadows, glows, spacing, and radius controls.
- Entrance, exit, and idle motion settings with static-output and `prefers-reduced-motion` support. Published overlays remain transparent.
- A separate editor-free runtime route that renders only visible, output-enabled layers.
- Official Kick OAuth 2.1 authorization-code + PKCE, server-held encrypted tokens, webhook subscriptions/signature validation/idempotency, SSE runtime events, live/offline/stale/unavailable viewer states, chat, follows, subscriptions, gifted subscriptions, KICKs, and livestream state.
- Test fixtures are always marked `test: true` and visibly labelled **TEST**. They are not presented as real Kick events.
- A donation adapter boundary with no provider selected. Donation status remains **SETUP REQUIRED / NOT CONNECTED** until an operator deliberately implements and configures a provider.

## Prerequisites

- Node.js 20 or newer
- npm
- For real Kick data: a Kick developer application and a separately deployed, persistent, publicly reachable HTTPS backend

GitHub Pages can host the frontend, but it cannot safely host OAuth callbacks, tokens, webhook processing, persistent data, viewer polling, or SSE fan-out.

## Local frontend

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/#/overlays` — overlay library
- `http://localhost:5173/#/integrations` — integration setup and health

The editor works without the backend. In that mode, drafts are local, published snapshot URLs are static, live widgets show honest unavailable/setup states, chat samples remain editor-only, and test events are not described as real.

## Local integration backend

Copy the example and fill in the values:

```bash
cp .env.example .env
set -a
. ./.env
set +a
npm run dev:server
```

The dependency-free Node server listens on `http://localhost:8787` by default. Start the frontend in another shell with `npm run dev`.

`.env` is ignored and must never be committed. `server/index.mjs` reads process environment variables; it intentionally does not bundle secrets into the frontend.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `HOST` | no | Bind host; default `0.0.0.0`. |
| `PORT` | no | Backend port; default `8787`. |
| `NODE_ENV` | no | Set `production` in production. |
| `APP_ORIGIN` | yes | Comma-separated exact frontend origins accepted by CORS and OAuth return validation, e.g. `https://varystal.github.io`. |
| `PUBLIC_API_URL` | yes | Public HTTPS backend origin, with no trailing slash. Used to form webhook URLs. |
| `KICK_CLIENT_ID` | yes | Kick application client ID; server-side configuration. |
| `KICK_CLIENT_SECRET` | yes | Kick application secret; server only. Never use a `VITE_` prefix. |
| `KICK_REDIRECT_URI` | yes | Exact registered callback URL: `<PUBLIC_API_URL>/api/auth/kick/callback`. |
| `TOKEN_ENCRYPTION_KEY` | yes | At least 32 random characters; encrypts tokens using AES-256-GCM. |
| `DATA_FILE` | yes in production | Private persistent JSON path. Do not place under a public/static directory. |
| `VIEWER_POLL_INTERVAL_MS` | no | Viewer polling interval; minimum 15 seconds, default 30 seconds. |
| `VITE_INTEGRATION_API_URL` | frontend build | Public backend origin embedded in the frontend build. It is not a secret. Leave empty in local development to use the same-origin Vite `/api` proxy. |
| `INTEGRATION_PROXY_TARGET` | local Vite only | Development proxy target; default `http://localhost:8787`. Not embedded into browser code. |

Generate an encryption key, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Rotating this key invalidates encrypted tokens already stored in `DATA_FILE`; reconnect affected accounts.

## Kick developer application setup

1. Create an application in Kick's developer portal.
2. Register the exact OAuth redirect URI:
   - local development: `http://localhost:8787/api/auth/kick/callback` if Kick permits it for development;
   - production: `https://overlay-api.example.com/api/auth/kick/callback`.
3. Configure the server variables above.
4. Deploy the backend with a persistent private volume for `DATA_FILE`.
5. Build the frontend with `VITE_INTEGRATION_API_URL=https://overlay-api.example.com`.
6. Open **Integrations**, connect Kick, review account/scopes/webhook health, then attach that connection to an existing overlay from the canvas inspector.
7. Copy a fresh OBS URL after attaching. The public runtime key is publishable and scoped to sanitized overlay state; access/refresh tokens and the opaque management token are stripped from snapshots.

The webhook endpoint to expose is:

```text
https://overlay-api.example.com/api/webhooks/kick
```

A remote Kick webhook cannot call your machine's `localhost`. Production OAuth and webhooks require publicly reachable HTTPS infrastructure. Use an HTTPS tunnel only for controlled development; do not describe that as a production deployment.

### Minimum scopes

| Scope | Why it is requested |
| --- | --- |
| `user:read` | Read the authorized user's identity shown in the connection dashboard. |
| `channel:read` | Read the authorized channel identity/status and active subscriber count. |
| `events:subscribe` | Create/delete the official webhook subscriptions used by runtime widgets. |

No chat-write, moderation, stream-write, or unnecessary scope is requested.

### Official events used

- `chat.message.sent`
- `channel.followed`
- `channel.subscription.new`
- `channel.subscription.renewal`
- `channel.subscription.gifts`
- `livestream.status.updated`
- `livestream.metadata.updated`
- `kicks.gifted`

Viewer count uses a controlled server-side poll of `GET /public/v1/users/livestreams?user_id=<authorized user id>`. Incoming chat is webhook-only; no chat history is fabricated. Kick's documented channel schema does not expose a historical total follower count, so the UI exposes **latest verified follower** and **follows observed during this backend session**, not a fabricated lifetime total.

Follows, subscriptions, gifted subscriptions, and KICKs are Kick platform events. They are not relabelled as payment-provider donations, and no unsupported donation totals/history are inferred.

## Backend routes

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | public | Basic backend availability. |
| `GET /api/setup` | public, sanitized | Setup state, required scopes/events, callback/webhook URLs, donation-adapter state. |
| `GET /api/auth/kick/start` | public | Begins OAuth with state and PKCE S256. |
| `GET /api/auth/kick/callback` | Kick redirect | Consumes one-time state, exchanges code server-side, fetches account/channel, and subscribes webhooks. |
| `POST /api/auth/session` | one-time exchange | Converts a five-minute browser exchange into an opaque management session. |
| `GET /api/integrations/kick` | management bearer | Account, scope, webhook, and health status. |
| `POST /api/overlays/publish` | management bearer | Idempotently registers the overlay's stable public ID and returns a per-overlay runtime capability. |
| `POST /api/integrations/kick/resubscribe` | management bearer | Recreates official subscriptions. |
| `POST /api/integrations/kick/disconnect` | management bearer | Attempts unsubscribe/revoke, then removes local token material. |
| `POST /api/integrations/test-event` | management bearer | Emits a safe, explicitly marked local fixture. |
| `GET /api/runtime/:runtimeKey/state` | scoped runtime key | Sanitized bootstrap metrics/state. |
| `GET /api/runtime/:runtimeKey/events` | scoped runtime key | SSE stream of sanitized normalized events. |
| `POST /api/webhooks/kick` | signed Kick request | Raw webhook verification, normalization, deduplication, and fan-out. |

### Security model

- OAuth uses an authorization code, a random one-time state, PKCE S256, a ten-minute pending-state lifetime, and a five-minute one-time browser exchange.
- Kick access/refresh tokens, pending PKCE records, and one-time browser exchanges are encrypted at rest with AES-256-GCM. They are used only by the backend and omitted from API responses, logs, overlay records, and snapshot URLs.
- The browser stores only an opaque management token for dashboard actions. Published overlays receive only a high-entropy runtime key.
- Webhooks require all documented Kick headers. The signature input is exactly `messageId.timestamp.rawBody` and is verified with RSA/SHA-256. An invalid signature triggers one public-key refresh to support Kick key rotation, then fails closed.
- Malformed payloads and invalid/stale signatures are rejected. Message IDs are retained for 24 hours for idempotent retry handling.
- Raw chat history is not persisted. Only minimal operational metadata such as the last event timestamp/type and last chat username is retained; live messages are fan-out events.
- CORS and OAuth return destinations use exact configured origins. Responses are `no-store` and use `nosniff`/no-referrer headers.
- Test fixtures cannot be submitted without the management session and retain `test: true` through transport and rendering.

Treat a runtime key as an unguessable publishable capability. Rotate it by reconnecting/republishing if a URL is exposed. The current file store is suitable for one backend process; use a shared encrypted database and shared event transport before horizontally scaling.

## Frontend and GitHub Pages deployment

The app uses hash routing and relative assets, so it works on GitHub Pages without rewrite rules. `.github/workflows/deploy-pages.yml` tests, builds, and deploys `dist` when `main` is updated.

1. In **Settings → Pages**, select **GitHub Actions**.
2. Configure `VITE_INTEGRATION_API_URL` in the build environment if a backend exists. This URL is public; never add Kick secrets to GitHub Pages variables or frontend source.
3. Deploy/merge and open `https://varystal.github.io/jubilant-octo-lamp/#/overlays`.

The current frontend deployment is independent from backend deployment. A static snapshot still works when the backend is unavailable; live widgets then report a disconnected/stale/unavailable condition rather than inventing data.

## OBS workflow

1. Create an empty overlay.
2. Add and arrange only the layers you need. Add Game Capture and webcam guides only as planning frames.
3. Optionally connect Kick under **Integrations**, then use the canvas inspector's **Attach connected Kick account** action.
4. Click **Save**, then **Copy OBS URL**.
5. In OBS Studio, add a **Browser Source**, paste the URL, and use the editor's recommended logical width/height.
6. Add Game Capture / Display Capture and Video Capture Device separately in OBS and place them below the decorative overlay layers.

When an authenticated integration session is available, Publish idempotently registers the overlay's stable `publicId` with the backend and receives a separate high-entropy runtime capability for that overlay. The snapshot parameter still carries compressed, secret-sanitized composition data as a static fallback. Snapshot URLs cannot be revoked and large embedded media creates long URLs. For production-scale media, use hosted assets and server-backed composition persistence.

A local Vite URL works only while the local server is running and is reachable from the same machine/network. It does not make the overlay remotely reachable.

## Data provenance and statuses

Integration UI/runtime states are explicit:

- `CONNECTED`
- `DISCONNECTED`
- `SETUP_REQUIRED`
- `PERMISSION_MISSING`
- `STALE_DATA`
- `ERROR`

Editor chat messages and manual goals say **SAMPLE / PREVIEW ONLY**. Local integration fixtures say **TEST**. Viewer count distinguishes `live`, `offline`, `stale`, and `unavailable`. Donation data remains unconnected until a provider-specific adapter and credentials are intentionally supplied.

## Editor behavior

- Logical coordinates use the selected output resolution; zoom never mutates geometry.
- Dragging is bounded to the logical canvas and can snap to edges/centers.
- `Ctrl/⌘ S` saves; `Ctrl/⌘ Z` undoes; `Ctrl/⌘ Shift Z` or `Ctrl/⌘ Y` redoes; `Ctrl/⌘ D` duplicates; Delete/Backspace removes a selected layer when focus is not in a form field.
- Planning backgrounds, grid, safe areas, transparency preview, common/custom resolutions, and mobile editor drawers are available.
- Themes are style tokens, not templates: applying one preserves position, dimensions, layer order, content, and independent decoration choices.
- Static motion can be forced per overlay. The runtime also honors the host/browser `prefers-reduced-motion` preference without timer or animation-frame polling.

## Tests and verification

```bash
npm test              # frontend Vitest + backend node:test
npm run test:frontend
npm run test:server
npm run build
npm audit
# or all tests plus production build
npm run check
```

Automated tests cover editor persistence and interactions, runtime filtering/transparency, theme/decor defaults and migrations, secret stripping, animations, OAuth URL/state/error handling, encrypted token storage, one-time exchanges, exact official API paths, webhook cryptography/key rotation/malformed input/idempotency, normalized event provenance, metrics failure states, and protected fixture delivery.

Automated tests and mocked provider responses are not real Kick end-to-end proof. Real E2E requires operator-owned credentials, an authorized account, registered callback, public HTTPS webhook endpoint, and actual Kick events.

## Architecture

- `src/lib/storage.ts` — local overlay model migration, persistence, snapshot encoding, and recursive secret removal
- `src/lib/themes.ts` — four theme tokens and reusable decoration presets
- `src/lib/integration.ts` — public backend location plus opaque browser session/runtime configuration
- `src/components/LiveDataProvider.tsx` — state bootstrap, SSE reconnect/deduplication, and live provenance
- `src/components/ElementRenderer.tsx` — shared editor/runtime renderer, alert queue, live widgets, Persian frames
- `server/security.mjs` — PKCE, AES-GCM, signature validation, redaction
- `server/store.mjs` — encrypted persistent integration records and idempotency state
- `server/kick-client.mjs` — official OAuth/API client and refresh handling
- `server/event-processor.mjs` — signature/key-rotation validation and minimal event normalization
- `server/app.mjs` — OAuth, management, runtime SSE, webhook, test-fixture, and polling endpoints
- `server/donations.mjs` — deliberately unconfigured provider-adapter registry
