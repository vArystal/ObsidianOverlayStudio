import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { encryptJson, decryptJson, hashSecret, randomToken, safeEqual } from './security.mjs'

const emptyState = () => ({ connections: {}, publications: {}, oauth: {}, exchanges: {}, processedEvents: {} })

export function createIntegrationStore({ filePath, encryptionKey, persist = true }) {
  let state = emptyState()
  let loaded = false
  /**
   * All persistence runs through one promise chain.
   *
   * The stores write a temp file and rename it; two overlapping flushes used the same temp path and the second
   * rename hit ENOENT (19 of 20 concurrent writes in the original reproduction). A queue also guarantees the
   * snapshot is taken at write time, so a slower write can never resurrect stale state over a newer one.
   */
  let writeQueue = Promise.resolve()

  function writeStateSnapshot() {
    if (!persist) return Promise.resolve()
    return (async () => {
      await mkdir(dirname(filePath), { recursive: true })
      // Unique temp per write as well: a crashed writer cannot be revived by a later one reusing its name.
      const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 })
      await rename(temp, filePath)
    })()
  }

  /** Run `task` with exclusive access to state, then persist. Callers await their own write. */
  function enqueue(task) {
    const run = writeQueue.then(async () => {
      const result = await task()
      await writeStateSnapshot()
      return result
    })
    // The chain must survive a rejected task, otherwise every later write would reject with it.
    writeQueue = run.then(() => {}, () => {})
    return run
  }

  async function load() {
    if (loaded) return
    loaded = true
    if (!persist) return
    try { state = { ...emptyState(), ...JSON.parse(await readFile(filePath, 'utf8')) } } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    prune()
  }

  async function flush() {
    return enqueue(async () => {})
  }

  function prune(now = Date.now()) {
    for (const [key, value] of Object.entries(state.oauth)) if (value.expiresAt < now) delete state.oauth[key]
    for (const [key, value] of Object.entries(state.exchanges)) if (value.expiresAt < now) delete state.exchanges[key]
    for (const [key, value] of Object.entries(state.processedEvents)) if (value < now - 24 * 60 * 60_000) delete state.processedEvents[key]
  }

  return {
    async init() { await load(); return this },
    async createOAuth(pending) { await load(); state.oauth[pending.state] = { expiresAt: pending.expiresAt, encrypted: encryptJson(pending, encryptionKey) }; await flush() },
    async consumeOAuth(key) { await load(); const value = state.oauth[key]; delete state.oauth[key]; await flush(); return value?.encrypted ? decryptJson(value.encrypted, encryptionKey) : value },
    async saveConnection(input, tokens) {
      await load()
      const accountUserId = input.account?.userId
      const previous = accountUserId
        ? Object.values(state.connections)
            .filter((item) => String(item.account?.userId) === String(accountUserId))
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
        : null
      // Reuse the record on reconnect: keeping id and runtimeKey keeps every OBS Browser Source working.
      const id = input.id || previous?.id || randomToken(18)
      const runtimeKey = input.runtimeKey || previous?.runtimeKey || randomToken(24)
      // The management token is rotated (a fresh browser just redeemed it), but the runtime key is not.
      const managementToken = randomToken(32)
      const connection = {
        ...input, id, runtimeKey, managementTokenHash: hashSecret(managementToken),
        encryptedTokens: encryptJson(tokens, encryptionKey), connected: true,
        createdAt: previous?.createdAt || input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        lastChatAt: previous?.lastChatAt ?? null, lastFollowAt: previous?.lastFollowAt ?? null, lastSubscriptionAt: previous?.lastSubscriptionAt ?? null,
        viewer: previous?.viewer ?? { status: 'unavailable', count: null, updatedAt: null },
        subscriptions: input.subscriptions ?? [],
        sessionFollowerCount: Number(previous?.sessionFollowerCount || 0),
        lastEventAt: previous?.lastEventAt ?? null, lastEventType: previous?.lastEventType ?? null,
      }
      state.connections[id] = connection
      // Any other record for the same account is a stale duplicate: retire it so routing cannot pick it.
      for (const [otherId, other] of Object.entries(state.connections)) {
        if (otherId === id || String(other.account?.userId) !== String(accountUserId)) continue
        other.connected = false
        other.encryptedTokens = null
        other.subscriptions = []
        other.updatedAt = new Date().toISOString()
      }
      await flush()
      return { connection, managementToken, reconnected: Boolean(previous) }
    },
    async updateConnection(id, patch) { await load(); if (!state.connections[id]) return null; state.connections[id] = { ...state.connections[id], ...patch, updatedAt: new Date().toISOString() }; await flush(); return state.connections[id] },
    async getConnection(id) { await load(); return state.connections[id] ?? null },
    async createPublication(connectionId, overlayId) {
      await load()
      if (!state.connections[connectionId]) return null
      const existing = Object.values(state.publications).find((item) => item.connectionId === connectionId && item.overlayId === overlayId)
      if (existing) { existing.updatedAt = new Date().toISOString(); await flush(); return existing }
      const id = randomToken(18)
      const publication = { id, overlayId, connectionId, runtimeKey: randomToken(24), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      state.publications[id] = publication
      await flush()
      return publication
    },
    async findByRuntimeKey(key) {
      await load()
      const direct = Object.values(state.connections).find((item) => safeEqual(item.runtimeKey, key))
      if (direct) return direct
      const publication = Object.values(state.publications).find((item) => safeEqual(item.runtimeKey, key))
      return publication ? state.connections[publication.connectionId] ?? null : null
    },
    async findByBroadcasterId(userId) {
      await load()
      return Object.values(state.connections)
        .filter((item) => String(item.account?.userId) === String(userId) && item.connected)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] ?? null
    },
    async runtimeKeysForConnection(connectionId) {
      await load()
      const connection = state.connections[connectionId]
      if (!connection) return []
      return [connection.runtimeKey, ...Object.values(state.publications).filter((item) => item.connectionId === connectionId).map((item) => item.runtimeKey)]
    },
    async authenticate(token) { await load(); const hashed = hashSecret(token || ''); return Object.values(state.connections).find((item) => safeEqual(item.managementTokenHash, hashed)) ?? null },
    async getTokens(id) { await load(); const item = state.connections[id]; return item?.encryptedTokens ? decryptJson(item.encryptedTokens, encryptionKey) : null },
    async setTokens(id, tokens) { await load(); if (!state.connections[id]) return; state.connections[id].encryptedTokens = encryptJson(tokens, encryptionKey); await flush() },
    async disconnect(id) { await load(); const item = state.connections[id]; if (!item) return null; item.connected = false; item.encryptedTokens = null; item.subscriptions = []; item.updatedAt = new Date().toISOString(); await flush(); return item },
    async createExchange(connectionId, managementToken) { await load(); const code = randomToken(24); const value = { connectionId, managementToken, expiresAt: Date.now() + 5 * 60_000 }; state.exchanges[code] = { connectionId, expiresAt: value.expiresAt, encrypted: encryptJson(value, encryptionKey) }; await flush(); return code },
    async consumeExchange(code) { await load(); const stored = state.exchanges[code]; delete state.exchanges[code]; await flush(); if (!stored || stored.expiresAt <= Date.now()) return null; return stored.encrypted ? decryptJson(stored.encrypted, encryptionKey) : stored },
    async isProcessed(messageId) { await load(); return Boolean(state.processedEvents[messageId]) },
    async markProcessed(messageId) { await load(); return enqueue(() => { state.processedEvents[messageId] = Date.now(); prune() }) },
    /**
     * Check-and-record in one turn of the write queue. Two identical deliveries arriving together cannot both
     * win, which is what the old isProcessed-then-markProcessed pair allowed.
     */
    async claimMessage(messageId) {
      await load()
      return enqueue(() => {
        if (state.processedEvents[messageId]) return false
        state.processedEvents[messageId] = Date.now()
        prune()
        return true
      })
    },
    /** Give a claim back when delivery failed, so Kick's retry is accepted instead of skipped. */
    async releaseClaim(messageId) {
      await load()
      return enqueue(() => { delete state.processedEvents[messageId] })
    },
    /** Follows arrive concurrently; incrementing a value read before an await lost counts. */
    async incrementSessionFollowers(connectionId) {
      await load()
      return enqueue(() => {
        const connection = state.connections[connectionId]
        if (!connection) return null
        connection.sessionFollowerCount = Number(connection.sessionFollowerCount || 0) + 1
        connection.updatedAt = new Date().toISOString()
        return connection.sessionFollowerCount
      })
    },
    /** Item 9: a deleted overlay must not keep a live runtime key. */
    async removePublication({ overlayId, connectionId }) {
      await load()
      return enqueue(() => {
        const removed = []
        for (const [id, item] of Object.entries(state.publications)) {
          if (item.overlayId !== overlayId) continue
          if (connectionId && item.connectionId !== connectionId) continue
          delete state.publications[id]
          removed.push(id)
        }
        return removed
      })
    },
    async listConnected() { await load(); return Object.values(state.connections).filter((item) => item.connected) },
    redact(connection) {
      if (!connection) return null
      const { encryptedTokens: _tokens, managementTokenHash: _management, ...safe } = connection
      return safe
    },
    _state() { return state },
  }
}
