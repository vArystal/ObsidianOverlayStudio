# CP4 — Image weight and the published URL budget

Date: 2026-10-28. Branch: `arena/35be064d-jubilant-octo-lamp` (production).

## The measured problem

Overlay media is stored as a data URL and then embedded again in the published snapshot URL. The
snapshot is LZ-string compressed, which does almost nothing for image payloads: measured on
incompressible bytes, the encoded snapshot runs at **1.55-1.65× the image size**.

| Source image | Snapshot URL | What actually happens |
| --- | --- | --- |
| 50 KB | 82 KB | loads in Chromium, fails in Firefox (64 KB URL ceiling) |
| 200 KB | 329 KB | loads in Chromium/OBS, fails in Firefox |
| 500 KB | 806 KB | loads in Chromium/OBS, fails in Firefox |
| 1.5 MB | 2.3 MB | **past Chromium's ~2 MB ceiling**: the browser source never loads |

The editor previously accepted files up to 2 MB, stored them raw, copied the URL and reported
success regardless of size. A single ordinary logo could therefore produce an OBS source that
simply never renders, with the UI insisting it had been published.

## The fix

**`src/lib/images.ts`** — intake pipeline plus the budget policy:

- `optimizeImage` decodes with `createImageBitmap`, downscales to a per-purpose edge, and re-encodes
  to WebP, stepping quality (0.9 → 0.6) and then dimensions until the payload fits the target.
  Files that are already small are passed through untouched so a crisp logo is not re-compressed.
- Per-purpose budgets: layers (logos, avatars, alert images) `1024px / 60 KB`; backgrounds
  `1920px / 150 KB`.
- `snapshotBudget` classifies the final URL: `ok` under 60 KB, `warn` between 60 KB and 1.5 MB
  (Chromium loads it, Firefox does not), `blocked` above 1.5 MB (Chromium itself refuses).

**`src/pages/OverlayEditor.tsx`**

- All three intake paths (layer image, alert image, background, asset upload) now run through the
  optimizer, raise the accepted file ceiling to 12 MB (audio stays 8 MB), and report the real
  before/after numbers in the toast.
- Publish refuses a blocked snapshot **before** registering a live runtime, so no side effect is
  created for a URL nobody can open. The refusal is a plain notice naming the size and the cause.
- The publish modal shows the verdict with its measured size.
- The toolbar control was labelled "Copy OBS URL" while it actually publishes, registers live and
  copies. It is now "Publish" with the full behaviour in its tooltip.

## Verification

`scripts/probes/cp4-image-budget-probe.mjs` (headless Chromium, production build, 2600×1700
photo-like PNG generated in the probe):

| Check | Result |
| --- | --- |
| Raw upload | 10.9 MB PNG |
| Stored layer payload | **14 KB WebP at 1024×670** (`image/webp`, toast: "Optimized 10.9 MB → 14 KB (1024×670)") |
| Published URL | 24,804 chars, verdict `ok` — "URL size 24 KB." |
| Oversized composition (incompressible 1.6 MB payload → 2.4 MB snapshot) | publish **refused**, modal never opens, notice: "This snapshot is 2.4 MB. Chromium refuses URLs near 2 MB, so OBS could not open it. Reduce or remove large images and publish again." |
| Page errors | 0 |

Unit tests (vitest 56 → 61): budget levels including the Firefox warning and the blocking ceiling,
data-URL byte accounting for padded/unpadded payloads, and human-readable sizes.

## Deliberate limits, stated honestly

- Media still lives in `localStorage` and inside the snapshot. At 14 KB per layer that is far inside
  both the 5 MB storage quota and the URL budget; a 12 MB source photo is no longer a threat.
- Snapshots are public and cannot be revoked, which the publish modal already says. Hosting assets
  on the integration backend would make URLs shorter and media revocable, but it would make OBS
  output depend on a network service and would need an authenticated upload path to avoid an open
  endpoint. That trade is documented rather than taken, because the measured failure (URLs too long
  to load) is now solved without it.
