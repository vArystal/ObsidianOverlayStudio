# CP35 — Motion parity and infinite loops

Commits `d037d78` and `9a1c878` on main.

## 1. Motion now renders in the editor

**Defect.** `Canvas.tsx` imported `MotionHost` and never mounted it, so `setMotionPreviewTime` from MotionStudio
had no visual effect: play and scrub changed state nothing read.

**Fix.** `OverlayStage` mounts `MotionHost` in both modes (`motionHost` prop removed), and the host keeps a
permanent subscription to preview time. That second half was a real bug on its own: the old effect subscribed to
the playhead only when it mounted *during* a scrub, so a host that mounted first (the normal case on the canvas)
never responded to later scrubs. Clearing the playhead now restarts the live clock instead of leaving the element
frozen at the last scrubbed frame.

## 2. Infinite loops stopped dying

**Defect.** `motionSpan()` counted a `repeat < 0` clip as one cycle and `MotionHost` unsubscribed at
`span + 60`, so every loop preset (pulse, breathing, floating, shimmer, neon glow, gradient motion) played a
single cycle and froze.

**Fix.** Three explicit measures in `lib/motion.ts`:

- `hasInfiniteClip(motion)` is true when any clip has `repeat < 0`.
- `motionClipSpan(motion)` is the last moment any clip is on screen, ignoring the studio ruler length.
- `motionPlaybackSpan(motion)` is `Infinity` for a looping document, otherwise `motionClipSpan`.

`motionSpan` keeps its old meaning (ruler length, one cycle for a loop) and is now documented as such.
`MotionHost` samples for `playback`, so a loop never unsubscribes while a finite clip still stops scheduling.
`motionClipSpan` also stops a finite host from sampling for the full 4000 ms ruler after a 200 ms fade ended.
Hidden-tab pause and the reduced-motion static frame are unchanged; reduced motion renders rest, because the
sampler drops clips in that mode.

## 3. Precedence rule

When `element.motion.clips.length > 0`, the shared stage suppresses the legacy `element-anim-*` entrance class
in **both** modes (`element-anim-none` instead). Rationale: the motion host owns the element transform, and the
entrance keyframes also animate transform/opacity, so letting both run is the double-animation bug. Elements
without clips keep the entrance class exactly as before.

## 4. MotionStudio covers all nine properties

`PROPERTIES` (6 entries) is gone; the keyframe editor maps `MOTION_PROPERTIES` (9), so blur, skewX and skewY have
rows, add-keyframe buttons and chips. Presets that animate them are now fully editable.

## Tests

`src/components/MotionHost.test.tsx` (9): infinite vs finite span, a pulse-style loop still sampling and moving
at 30 s with one subscriber, a finite clip dropping to zero subscribers, no motion scheduling nothing, reduced
motion resting, scrubbing sampling the playhead, scrubbing moving an element on the stage, and the precedence
rule in both modes.

`src/components/editor/MotionStudio.test.tsx` (1): a keyframe row exists for each of the nine properties.

jsdom drops `transform` from inline styles, so the loop and scrub assertions ride an opacity track; the sampler
is property-agnostic, so this tests the same code path the transform presets use.

## Commands

```
npx tsc -b                          # clean
npx vitest run                      # 260 passed, 33 files
node --test server/*.test.mjs       # 49 pass
node --test worker/index.test.mjs   # 34 pass
npx vite build                      # built in 373ms
npm run check                       # green
```

## Not verified

- No visual capture of the scrub in a real browser. The unit tests and the stage mount prove the host samples
  and writes, but I did not film the MotionStudio timeline dragging a real element.
- Infinite loops are verified with a synthetic frame clock, not by leaving OBS running for hours. Memory growth
  over a long session is unmeasured; the sampler allocates one frame object per tick, as before.
- The live deployment was pushed; the served bundle hash was not re-read after this phase.
