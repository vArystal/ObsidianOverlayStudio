import { describe, expect, it } from 'vitest'
import { EMPTY_HISTORY, pushHistory, redoHistory, undoHistory } from './history'
import { sameOverlay } from './overlayDiff'
import { createEmptyOverlay, createElement } from './elements'

const doc = (name: string) => ({ ...createEmptyOverlay(name), name })

describe('CP41 history transitions', () => {
  it('is a pure function: applying the same transition twice to the same base gives the same answer', () => {
    // This is the StrictMode failure in one line. The old code pushed inside a setState updater, so React running
    // that updater twice recorded two snapshots and the first undo appeared to do nothing.
    const first = doc('first')
    const base = EMPTY_HISTORY
    const once = pushHistory(base, first)
    const twice = pushHistory(base, first)
    expect(once.past).toHaveLength(1)
    expect(twice.past).toHaveLength(1)
    expect(once.past[0].name).toBe(twice.past[0].name)
    expect(base.past).toHaveLength(0)
  })

  it('never mutates the base history it is given', () => {
    const base = pushHistory(EMPTY_HISTORY, doc('a'))
    const before = base.past.length
    pushHistory(base, doc('b'))
    undoHistory(base, doc('c'))
    expect(base.past).toHaveLength(before)
  })

  it('records one snapshot per edit and restores exactly that snapshot', () => {
    const original = doc('original')
    let state = pushHistory(EMPTY_HISTORY, original)
    const edited = doc('edited')
    const undone = undoHistory(state, edited)
    expect(undone?.overlay.name).toBe('original')
    state = undone!.state
    expect(state.past).toHaveLength(0)
    expect(state.future).toHaveLength(1)
    const redone = redoHistory(state, undone!.overlay)
    expect(redone?.overlay.name).toBe('edited')
    expect(redone!.state.past).toHaveLength(1)
  })

  it('drops the redo branch on a new edit, which is what the old nested setFuture did implicitly', () => {
    const state = pushHistory(EMPTY_HISTORY, doc('a'))
    const undone = undoHistory(state, doc('b'))!
    const forked = pushHistory(undone.state, doc('c'))
    expect(forked.future).toHaveLength(0)
  })

  it('undoing to the oldest snapshot leaves an empty history rather than a phantom step', () => {
    let state = pushHistory(EMPTY_HISTORY, doc('a'))
    state = undoHistory(state, doc('b'))!.state
    expect(undoHistory(state, doc('a'))).toBeNull()
    expect(redoHistory(EMPTY_HISTORY, doc('a'))).toBeNull()
  })

  it('a restored snapshot renders identically to what was recorded', () => {
    const original = createEmptyOverlay('scene')
    original.elements = [createElement('counter')]
    const restored = undoHistory(pushHistory(EMPTY_HISTORY, original), createEmptyOverlay('scene'))!.overlay
    expect(sameOverlay(restored, original)).toBe(true)
  })
})
