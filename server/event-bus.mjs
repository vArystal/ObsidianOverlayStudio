export function createEventBus() {
  const listeners = new Map()
  return {
    publish(runtimeKey, event) {
      for (const listener of listeners.get(runtimeKey) ?? []) listener(event)
    },
    subscribe(runtimeKey, listener) {
      if (!listeners.has(runtimeKey)) listeners.set(runtimeKey, new Set())
      listeners.get(runtimeKey).add(listener)
      return () => {
        const group = listeners.get(runtimeKey)
        group?.delete(listener)
        if (!group?.size) listeners.delete(runtimeKey)
      }
    },
    listenerCount(runtimeKey) { return listeners.get(runtimeKey)?.size ?? 0 },
  }
}
