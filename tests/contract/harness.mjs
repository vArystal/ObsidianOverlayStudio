import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createApp } from '../../server/app.mjs'
import worker, { resetPublicKeyCache, sha256Hex } from '../../worker/index.mjs'

const ORIGIN = 'https://studio.example'
const API = 'https://api.example'

/**
 * CP36: one contract, two implementations. Each adapter exposes the same four affordances the scenarios need, so a
 * scenario written once runs against the local Node server and the Cloudflare Worker fetch handler.
 */
async function nodeAdapter() {
  const app = await createApp({
    config: {
      port: 0, host: '127.0.0.1', appOrigins: [ORIGIN], kickClientId: 'client-id', kickClientSecret: 'client-secret',
      kickRedirectUri: `${API}/api/auth/kick/callback`, tokenEncryptionKey: 'contract-test-encryption-key-long-enough',
      dataFile: '/unused/contract.json', viewerPollMs: 999_999, publicApiUrl: API, nodeEnv: 'test', missing: [],
    },
    fetchImpl: async () => { throw new Error('unexpected external request') },
    persist: false,
  })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}`
  return {
    name: 'node',
    async request(method, path, { token, body } = {}) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await response.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { json = null }
      return { status: response.status, json }
    },
    async seedConnection() {
      const { connection, managementToken } = await app.store.saveConnection(
        { account: { userId: 4242, username: 'owner' }, channel: { slug: 'contract' }, scopes: ['user:read', 'channel:read', 'events:subscribe'], subscriptions: [] },
        { access_token: 'access', refresh_token: 'refresh', expiresAt: Date.now() + 600_000 },
      )
      return { connection, token: managementToken }
    },
    async close() { await app.close() },
  }
}

async function workerAdapter() {
  resetPublicKeyCache()
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../worker/schema.sql', import.meta.url), 'utf8'))
  const wrap = (sql) => {
    let params = []
    return {
      bind(...values) { params = values.map((v) => (typeof v === 'boolean' ? Number(v) : v ?? null)); return this },
      first() { return sqlite.prepare(sql).get(...params) ?? null },
      all() { return { results: sqlite.prepare(sql).all(...params) } },
      run() { return { success: true, meta: sqlite.prepare(sql).run(...params) } },
    }
  }
  const env = {
    KICK_CLIENT_ID: 'client-id', KICK_CLIENT_SECRET: 'client-secret', ENCRYPTION_KEY: 'unit-test-encryption-key',
    PUBLIC_API_URL: API, APP_ORIGINS: ORIGIN, DB: { prepare: wrap },
    fetchImpl: async () => { throw new Error('unexpected external request') },
  }
  return {
    name: 'worker',
    async request(method, path, { token, body } = {}) {
      const response = await worker.fetch(new Request(`https://api.test${path}`, {
        method,
        headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), env)
      const text = await response.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { json = null }
      return { status: response.status, json }
    },
    async seedConnection() {
      const token = 'contract-management-token'
      const now = new Date().toISOString()
      sqlite.prepare(`INSERT INTO connections (id, account_user_id, account_username, channel_slug, tokens, management_hash, runtime_key, scopes, subscriptions, connected, viewer, event_counts, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '{}', ?)`)
        .run('con_contract', 4242, 'owner', 'contract', '{}', await sha256Hex(token), 'runtime-contract', JSON.stringify(['user:read', 'channel:read', 'events:subscribe']), '[]', JSON.stringify({ status: 'offline', count: null, updatedAt: now }), now)
      return { connection: { id: 'con_contract' }, token }
    },
    async close() { sqlite.close() },
  }
}

export const adapters = { node: nodeAdapter, worker: workerAdapter }
