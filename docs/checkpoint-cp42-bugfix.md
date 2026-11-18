# CP42 — Reported bug pass (Kick session, toast, background drawer, empty rail)

`npm run check` green: 309 vitest, 54 server, 34 worker, contract PASS, tsc + vite clean.

## 1. Kick connection "lost every time" — FIXED
`src/lib/integration.ts` kept the management session in **sessionStorage**, so closing the tab discarded the token
and the next visit had nothing to authenticate with: the app could only report DISCONNECTED. It now persists in
localStorage (same origin only, `Disconnect` still clears it), and reads either location so an open tab keeps working.
Tradeoff, stated plainly: a bearer token now survives a tab close. The public runtime config is unchanged and never
contains it. The old test that asserted "tab storage" encoded the superseded policy and was rewritten with that note.

## 2. Notification could not be closed — FIXED
Only the save path cleared its own toast after 2.2s; every other notice (upload errors, budget refusals, image notes)
stayed forever and the toast had no control at all. Every notice now auto-dismisses after 7s **and** carries a 44px
"Dismiss notification" button.

## 3. Motion background "never appears" — FIXED (three causes, all measured)
- Flipping "Enable animated background" with no scene selected rendered nothing: `enabled: true` + `kind: 'none'` is a
  null render. Enabling now selects Aurora Flow, so the switch has a visible effect.
- The control lived in a `<details>` at the very bottom of the rail: 36px tall (under the 44px target) and collapsed,
  so it was effectively undiscoverable. It is now a 44px sticky toggle with the active scene in its label.
- The drawer mounted seven live `BackgroundLayer` scenes even while closed. Content is now rendered only while open.
Verified live on production before the fix: seeding an overlay with `enabled: true, kind: 'aurora-flow'` painted the
scene on the canvas (1086 distinct colours in a stage screenshot) and in the published runtime (1217), so the renderer
was never the fault; the switch and the drawer were.

## 4. Empty layers rail — IMPROVED
The Layers tab could be empty with no route back to the library. It now offers "Browse elements". The library itself
rendered all 26 widgets at 1600x1000 and at 390x844 in every probe, so "all elements hidden" was not reproduced;
if it recurs, it needs the exact screen and viewport.

## Not a GitHub Pages problem
Pages is a static CDN with no compute in the path; the measured weight was in the editor's always-mounted scenes and
thumbnails, which is now removed. No hosting migration was made.
