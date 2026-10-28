import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { encryptJson, decryptJson, hashSecret, randomToken, safeEqual } from './security.mjs'

const emptyState = () => ({ connections: {}, publications: {}, oauth: {}, exchanges: {}, processedEvents: {} })

export function createIntegrationStore({ filePath, encryptionKey, persist = true }) {
  let state = emptyState()
  let loaded = false

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
    if (!persist) return
    await mkdir(dirname(filePath), { recursive: true })
    const temp = `${filePath}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 })
    await rename(temp, filePath)
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
      const id = input.id || randomToken(18)
      const runtimeKey = input.runtimeKey || randomToken(24)
      const managementToken = randomToken(32)
      const connection = {
        ...input, id, runtimeKey, managementTokenHash: hashSecret(managementToken),
        encryptedTokens: encryptJson(tokens, encryptionKey), connected: true,
        createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(), lastChatAt: null, lastFollowAt: null, lastSubscriptionAt: null,
        viewer: { status: 'unavailable', count: null, updatedAt: null }, subscriptions: input.subscriptions ?? [], sessionFollowerCount: 0,
      }
      state.connections[id] = connection
      await flush()
      return { connection, managementToken }
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
    async findByBroadcasterId(userId) { await load(); return Object.values(state.connections).find((item) => String(item.account?.userId) === String(userId) && item.connected) ?? null },
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
    async markProcessed(messageId) { await load(); state.processedEvents[messageId] = Date.now(); prune(); await flush() },
    async listConnected() { await load(); return Object.values(state.connections).filter((item) => item.connected) },
    redact(connection) {
      if (!connection) return null
      const { encryptedTokens: _tokens, managementTokenHash: _management, ...safe } = connection
      return safe
    },
    _state() { return state },
  }
}
