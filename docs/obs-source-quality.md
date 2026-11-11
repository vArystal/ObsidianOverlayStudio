# OBS source sizing and sharpness

Measured on production 2026-11-11, bundle `index-CGbN0xY6.js`, commit `b07e3bb`. Design 1920x1080.

## Root cause

The runtime used `scale = min(vw/W, vh/H)`, which is correct for a source smaller than the design but
*upscales* when the source is larger. A 2560x1440 browser source therefore rendered a 1.333x stage, so
`x=200` landed at `266.67` device pixels and `width=1200` at `1600`. Every edge, border and glyph sits on a
fractional pixel and is antialiased twice, which is the softness operators reported. It also made the
composition look "too large" relative to the OBS canvas.

## Fix

The stage now renders 1:1 and only ever scales down (`Math.min(1, contain)`), so a source at or above the
design size is pixel exact. `?fit=fill` and `?fit=cover` cover the source instead, `?fit=stretch` exists only
for deliberately non-proportional sources, and `?diag=1` prints the size and device pixel ratio the browser
reports plus a PIXEL PERFECT verdict.

## Measurements

| Source | Mode | Stage px | Element px | Offset | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1920x1080 | transform 1:1 | 1920x1080 | 1200x200 | 200 | PIXEL PERFECT |
| 1920x1080 @2 | transform 1:1 | 1920x1080 | 1200x200 | 200 | PIXEL PERFECT |
| 2560x1440 | transform 1:1 | 1920x1080 | 1200x200 | 200 | PIXEL PERFECT, no upscale |
| 1280x720 | zoom 0.6667 | 1280x720 | 800x133.33 | 133.33 | SCALED, warns to set 1920x1080 |

Before the fix the 2560x1440 source produced `1600x266.67` at offset `266.67`; the 1280 case was identical
then and now, because downscaling is unavoidable when the source is smaller than the design.

## Recommended OBS setup

1. Add a Browser source, set Width 1920 and Height 1080 before pasting the URL.
2. Leave the scene item at 100%, Transform then Reset.
3. If the canvas differs, scale the scene item, never the source, and set Scale Filtering to Lanczos.
4. Check `?diag=1` once: it should read PIXEL PERFECT, then drop the parameter.

## Limits

A source smaller than the design must resample; text stays crisp under `zoom` (re-rasterised at the final
size) but hairlines can antialias. Images imported through the optimizer cap at 1024px, so an image widget
rendered wider than 1024 design px is soft in every browser, not just OBS.
