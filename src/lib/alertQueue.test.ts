import { beforeEach, describe, expect, it } from 'vitest'
import { AlertQueueEngine } from './alertQueue'
import { createAlertSettings } from './alerts'
import type { AlertSettings } from './alerts'
import type { LiveOverlayEvent } from '../types'

const settings = (patch: Partial<AlertSettings> = {}): AlertSettings => ({ ...createAlertSettings(), ...patch })
const follow = (id: string, username = 'Nova'): LiveOverlayEvent => ({ id, type: 'channel.followed', receivedAt: '2026-11-05T10:00:00.000Z', test: false, data: { follower: { username } } } as LiveOverlayEvent)

/** Walks to the next phase boundary, the way a live timer would fire. */
const step = (engine: AlertQueueEngine, at: number) => { engine.tick(at); const due = engine.snapshot(at).dueIn ?? 0; return at + due }
/** Plays everything queued to completion, returning the wall clock at which the queue goes idle. */
const playOut = (engine: AlertQueueEngine, at: number) => {
  let t = at
  for (let guard = 0; guard < 24; guard += 1) {
    const snap = engine.snapshot(t)
    if (!snap.current && !snap.queued.length) return t
    t = step(engine, t)
    if (t === at) t += 1
  }
  return t
}

describe('alert queue', () => {
  let engine: AlertQueueEngine
  let now: number
  beforeEach(() => { engine = new AlertQueueEngine(settings({ gapMs: 500, minDurationMs: 1000 })); now = 1_000_000 })

  it('plays one alert at a time in arrival order', () => {
    engine.push([follow('a'), follow('b')], now)
    engine.tick(now)
    expect(engine.snapshot(now).current?.alert.event.id).toBe('a')
    expect(engine.snapshot(now).queued.map((item) => item.event.id)).toEqual(['b'])
    // The second alert cannot start while the first is still inside its own lifespan.
    engine.tick(now + 500)
    expect(engine.snapshot(now + 500).current?.alert.event.id).toBe('a')
  })

  it('walks enter, hold, exit and only then queues the acknowledgement', () => {
    engine.push([follow('a')], now)
    let t = step(engine, now)
    expect(engine.snapshot(t).current?.phase).toBe('enter')
    t = step(engine, t)
    expect(engine.snapshot(t).current?.phase).toBe('hold')
    t = step(engine, t)
    expect(engine.snapshot(t).current?.phase).toBe('exit')
    // Nothing is acknowledged while it is still on screen.
    expect(engine.takePendingAcks()).toEqual([])
    t = step(engine, t)
    expect(engine.snapshot(t).current).toBeNull()
    expect(engine.takePendingAcks()).toEqual(['a'])
  })

  it('ignores the same event delivered twice', () => {
    engine.push([follow('a')], now)
    expect(engine.push([follow('a')], now + 10)).toBe(0)
    expect(engine.snapshot().duplicates).toBe(1)
  })

  it('remembers a played event so a reconnect replay does not repeat it', () => {
    engine.push([follow('a')], now)
    const done = playOut(engine, now)
    expect(engine.snapshot(done).current).toBeNull()
    expect(engine.push([follow('a')], done + 1)).toBe(0)
  })

  it('forgets an event outside the dedupe window, so a genuine second follow still plays', () => {
    const long = new AlertQueueEngine(settings({ dedupeWindowMs: 5000 }))
    long.push([follow('a')], now)
    playOut(long, now)
    // Inside the window a retry is the same delivery; past it, the same id is a new alert worth showing.
    expect(long.push([follow('a')], now + 1000)).toBe(0)
    expect(long.push([follow('a')], now + 6000)).toBe(1)
  })

  it('applies the configured minimum on-screen time', () => {
    const slow = new AlertQueueEngine(settings({ minDurationMs: 4000 }))
    slow.push([follow('a')], now)
    slow.tick(now)
    slow.tick(now + slow.getSettings().templates.follow.enterDuration)
    // A 200ms hold in the template is lifted to the configured floor.
    slow.tick(now + slow.getSettings().templates.follow.enterDuration + 100)
    expect(slow.snapshot().current?.phase).toBe('hold')
  })

  it('honours the overflow policy when the queue is full', () => {
    const keepNewest = new AlertQueueEngine(settings({ maxQueued: 2, overflow: 'drop-oldest' }))
    keepNewest.push([follow('a'), follow('b'), follow('c')], now)
    keepNewest.tick(now)
    // 'a' was dropped to make room, 'b' is on screen, 'c' waits.
    expect(keepNewest.snapshot().current?.alert.event.id).toBe('b')
    expect(keepNewest.snapshot().queued.map((item) => item.event.id)).toEqual(['c'])
    expect(keepNewest.snapshot().dropped).toBe(1)

    const keepOldest = new AlertQueueEngine(settings({ maxQueued: 2, overflow: 'drop-newest' }))
    keepOldest.push([follow('a'), follow('b'), follow('c')], now)
    keepOldest.tick(now)
    expect(keepOldest.snapshot().current?.alert.event.id).toBe('a')
    expect(keepOldest.snapshot().queued.map((item) => item.event.id)).toEqual(['b'])
  })

  it('never queues a disabled alert type', () => {
    const off = new AlertQueueEngine({ ...createAlertSettings(), templates: { ...createAlertSettings().templates, follow: { ...createAlertSettings().templates.follow, enabled: false } } })
    expect(off.push([follow('a')], now)).toBe(0)
  })

  it('waits for the gap between two alerts when sequential', () => {
    engine.push([follow('a'), follow('b')], now)
    let t = step(engine, now)
    expect(engine.snapshot(t).current?.alert.event.id).toBe('a')
    // Walk to the moment the first alert ends; the second must wait out the configured 500ms gap.
    for (let guard = 0; guard < 4; guard += 1) t = step(engine, t)
    expect(engine.snapshot(t).current?.alert.event.id === 'a').toBe(false)
    t = step(engine, t)
    expect(engine.snapshot(t).current?.alert.event.id).toBe('b')
  })

  it('restores an acknowledgement that failed to reach the server', () => {
    engine.push([follow('a')], now)
    playOut(engine, now)
    const ids = engine.takePendingAcks()
    engine.restoreAck(ids)
    expect(engine.takePendingAcks()).toEqual(['a'])
  })

  it('reports when the next transition is due', () => {
    engine.push([follow('a')], now)
    expect(engine.snapshot(now).dueIn).toBe(0)
    engine.tick(now)
    expect(engine.snapshot(now).dueIn).toBeGreaterThan(0)
    expect(engine.snapshot(now + 100_000).dueIn).toBe(0)
  })

  it('re-reads durations when the author saves mid-stream', () => {
    const updated = { ...createAlertSettings(), templates: { ...createAlertSettings().templates, follow: { ...createAlertSettings().templates.follow, holdDuration: 9000, enterDuration: 100 } } }
    engine.update(updated)
    engine.push([follow('a')], now)
    engine.tick(now)
    engine.tick(now + 100)
    expect(engine.snapshot().current?.phase).toBe('hold')
    // The saved 9s hold keeps it on screen well past the old 5.2s default.
    engine.tick(now + 6100)
    expect(engine.snapshot().current?.phase).toBe('hold')
    engine.tick(now + 9300)
    expect(engine.snapshot().current?.phase).toBe('exit')
  })
})
