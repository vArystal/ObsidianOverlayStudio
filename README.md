# Obsidian Overlay Studio

A local-first visual editor for composing transparent OBS Browser Source overlays. The canvas starts empty: every text layer, image, planning guide, frame, and widget is added explicitly by the user.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/#/overlays`. Production verification:

```bash
npm test
npm run build
npm run preview
```

## Deploy to GitHub Pages

The app uses hash routing and relative build assets, so it works on GitHub Pages without server rewrite rules. The included `.github/workflows/deploy-pages.yml` workflow tests, builds, and deploys the `dist` directory whenever `main` is updated.

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Merge this branch into `main`, or manually run **Deploy Overlay Studio to GitHub Pages** from the Actions tab.
4. Open `https://varystal.github.io/jubilant-octo-lamp/#/overlays`.

## Routes

- `#/overlays` — saved overlay library
- `#/overlays/editor/:id` — visual editor
- `#/overlay/:publicId` — clean transparent runtime (no dashboard/editor controls)

## OBS workflow

1. Create an empty overlay from **Overlays**.
2. Add and arrange only the elements you need.
3. Click **Save**, then **Copy OBS URL**.
4. In OBS Studio, add a **Browser Source**.
5. Paste the copied snapshot URL and set its width and height to the recommendation shown by the editor (for example `1920 × 1080`).
6. Add Game Capture / Display Capture and Video Capture Device sources separately in OBS, then align them under any planning placeholders or decorative webcam frames.

The copied URL includes a compressed snapshot of the composition so the runtime does not depend on the editor browser's local storage. When using a local development URL, OBS must run on the same computer and the Vite server must remain running. A GitHub Pages URL is HTTPS-hosted and can be opened directly by OBS without keeping the development server running.

## What is local-only

There is currently no backend, user account, synchronization, or remote asset service. Named overlay drafts are stored in browser `localStorage`. This means:

- drafts do not sync across devices or browsers;
- clearing site data deletes drafts;
- uploaded media is embedded as data URLs and counts toward browser storage;
- large embedded assets produce long snapshot URLs (uploads are capped at 2 MB);
- snapshot URLs cannot be revoked after they are shared;
- use backend persistence and hosted asset URLs for production-scale use.

Save failures (including storage quota errors) are surfaced in the editor.

## Integration boundaries

No live event provider, payment provider, Kick chat connection, OAuth flow, or camera/desktop capture is implemented.

- **Chat** uses clearly labelled editor-only sample messages; those samples are not rendered in the published runtime.
- **Alerts** can be previewed and can play a user-selected local sound, but are omitted at runtime until an event provider is connected.
- **Donation goals** use labelled sample data and are omitted at runtime by default. The user can explicitly publish the manually entered value, which is still not verified payment data.
- **Latest supporter** is an integration placeholder and is omitted at runtime.
- **Game/display and webcam capture** remain OBS sources. Their editor placeholders are excluded from output by default; enabling output publishes only their decorative frame, never a browser-based capture.

A production integration should receive events server-side, keep provider credentials out of public URLs, and push sanitized widget state to the browser source (for example over a scoped WebSocket/SSE channel).

## Editor behavior

- Logical coordinates always use the selected output resolution; visual zoom does not mutate positions or dimensions.
- Dragging is bounded to the logical canvas and can snap to edges and centers.
- Eight resize handles, keyboard arrow movement (`Shift` = 10 px), layer visibility/locking, order, duplication, deletion, alignment, undo, and redo are supported.
- `Ctrl/⌘ S` saves; `Ctrl/⌘ Z` undoes; `Ctrl/⌘ Shift Z` or `Ctrl/⌘ Y` redoes; `Ctrl/⌘ D` duplicates; Delete/Backspace removes a selected layer when focus is not in a form control.
- Planning background images, grid, safe-area guides, transparency preview, fit, zoom, common resolutions, and custom dimensions are available.
- Narrow viewports use collapsible element/layer and property drawers.

## Architecture

React 18 + TypeScript + Vite. The persistence boundary is in `src/lib/storage.ts`, default element schemas are in `src/lib/elements.ts`, and the standalone renderer is shared by the editor and output route through `src/components/ElementRenderer.tsx`.
