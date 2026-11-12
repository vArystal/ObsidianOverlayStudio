# CP38 — Widget surface and inspector parity

`npm run check` green: 277 vitest, 50 server, 34 worker, contract PASS for both backends, tsc + vite clean.

## 1. Legacy widgets now share the Shell

**Defect.** `counter`, `countdown`, `viewerCount`, `sessionFollowers`, `latestFollower` and `supporter` each
rendered their own `<div className="metric-widget">` with an inline `color`, so every surface control the inspector
offered (background, border, radius, shadow, padding, typography) was ignored. `goal` had the same shape with
`textColor`.

**Fix.** All seven render through `Shell` from `src/components/widgets/index.tsx`, the same component the CP24
widgets use. `shellElement()` lets a widget with its own colour key (the goal's `textColor`) keep that key and still
inherit the surface. Geometry classes (`metric-widget`, `countdown-widget`, `countdown-done`, `goal-widget`,
`supporter-widget`, `viewer-offline`…) are unchanged, so padding, flex layout and the data-phase classes behave
exactly as before.

## 2. viewerCount text controls

`offlineText` and `unavailableText` existed in the renderer but had no field. Both are now registry defaults and
inspector rows. They default to empty strings, and a blank value means "use the honest default for this state":
`text(element, 'unavailableText') || (connected ? 'Unavailable' : 'Not connected')`. Without that, supplying a
default label would have collapsed "not connected" and "API unreachable" into one wording, which the CP24 honesty
rule forbids.

## 3. Inspector is control-group driven

`WidgetSettings` no longer returns null when `defaults` is empty. It renders one `div[data-group]` per entry in
`definition.controls`, and the six previously declared but unimplemented groups are real: `data` (data source and
preview inclusion), `goal` (title, target, current, currency, track and fill), `countdown` (absolute deadline and
minutes), `behavior` (chat scrolling/spacing, alert sequential/gap/queue), `sound` (alert mute and volume) and
`community` (chat limits, avatars, timestamps, badges).

The alert groups write the overlay's `alerts` settings through `onAlerts`, not element props: alert behaviour is
document level, and a per-element copy would have diverged from AlertStudio.

## 4. Registry truth

`src/lib/widgetRegistry.test.tsx` iterates `WIDGETS` and asserts that every declared group renders at least one
control, that every default key is read by a renderer (source scan of both renderer files), and that changing a
control reports a key the widget actually declares.

Enforcing it removed real dead weight: `streamTitle.uppercaseLabel` was a default nothing read, and
`socialLinks.layout` was declared and ignored, now honoured as `data-layout` on the list. `chat` gained `emptyText`
so its `content` group has something to bind.

## Contract change worth knowing

`text`, `image`, `shape`, `container`, `frame`, `capture` and `webcam` now declare `controls: []`. Their inspectors
are the typography studio, the container presets and the image controls in `PropertiesPanel`, not `WidgetSettings`;
declaring groups there advertised sections that would have rendered empty. `widgets.test.ts` asserts this split
explicitly via `DEDICATED_INSPECTOR`, so a new canvas primitive cannot silently claim settings groups it does not
have.

## Not verified

The surface parity is proven by unit tests on inline styles, not by a pixel diff of every widget in OBS. The visual
check after deploy covers `counter` and `viewerCount` only.
