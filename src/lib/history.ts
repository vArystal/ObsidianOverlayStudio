import type { Overlay } from '../types'

/**
 * CP41: undo/redo used to be three nested state updaters, so React's StrictMode double-invocation of an updater
 * pushed the same snapshot twice and undo became a no-op step. These transitions are pure functions of the current
 * document and history, and the editor keeps the result in a ref, so running one twice cannot change the answer.
 */
export const MAX_HISTORY = 60

export interface HistoryState { past: Overlay[]; future: Overlay[] }

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] }

/** Records the document as it was before an edit, dropping the redo branch. */
export function pushHistory(state: HistoryState, previous: Overlay): HistoryState {
  return { past: [...state.past.slice(-(MAX_HISTORY - 1)), structuredClone(previous)], future: [] }
}

export function undoHistory(state: HistoryState, current: Overlay | null): { state: HistoryState; overlay: Overlay } | null {
  const previous = state.past[state.past.length - 1]
  if (!previous || !current) return null
  return {
    state: { past: state.past.slice(0, -1), future: [structuredClone(current), ...state.future].slice(0, MAX_HISTORY) },
    overlay: previous,
  }
}

export function redoHistory(state: HistoryState, current: Overlay | null): { state: HistoryState; overlay: Overlay } | null {
  const next = state.future[0]
  if (!next || !current) return null
  return {
    state: { past: [...state.past.slice(-(MAX_HISTORY - 1)), structuredClone(current)], future: state.future.slice(1) },
    overlay: next,
  }
}
