import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventBus } from './event-bus.mjs'
import { createEventProcessor } from './event-processor.mjs'
import { createIntegrationStore } from './store.mjs'

const encryptionKey = 'alerts-test-encryption-key-that-is-over-thirty-two-chars'

/** Signs a delivery exactly as Kick would, so the processor's real path runs. */
function delivery(privateKey, payload, id, type) {
  const rawBody = Buffer.from(JSON.stringify(payload))
  const timestamp = new Date().toISOString()
  const signature = sign('RSA-SHA256', Buffer.from(`${id}.${timestamp}.${rawBody}`), privateKey).toString('base64')
  return { rawBody, headers: { 'kick-event-message-id': id, 'kick-event-message-timestamp': timestamp, 'kick-event-signature': signature, 'kick-event-type': type, 'kick-event-version': '1' } }
}

test('an alert survives acknowledgement, and a milestone fires once per target', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const dir = await mkdtemp(join(tmpdir(), 'alerts-'))
  const filePath = join(dir, 'store.json')
  try {
    const store = createIntegrationStore({ filePath, encryptionKey, persist: true })
    await store.init()
    const { connection } = await store.saveConnection({ account: { userId: 77, username: 'owner' }, channel: { slug: 'owner' }, scopes: [], subscriptions: [] }, { access_token: 'x' })
    const bus = createEventBus()
    const processor = createEventProcessor({ store, bus, getPublicKey: async () => publicKey.export({ type: 'spki', format: 'pem' }) })
    await store.saveAlertSettings(connection.runtimeKey, { milestones: [{ metric: 'followers', target: 1, enabled: true }] })

    const first = delivery(privateKey, { follower: { user_id: 5, username: 'realviewer' }, broadcaster: { user_id: 77 } }, 'evt_alert_1', 'channel.followed')
    assert.equal((await processor.process(first.headers, first.rawBody)).status, 204)

    const feed = await store.listAlerts(connection.runtimeKey, {})
    assert.equal(feed.length, 2, 'the follow plus the derived milestone')
    assert.equal(feed[0].event.type, 'channel.followed')
    assert.equal(feed[0].event.test, false)
    assert.equal(feed[1].event.type, 'alert.milestone')
    assert.equal(feed[1].event.id, 'milestone:followers:1')

    // A later follow must not celebrate the same milestone twice.
    const second = delivery(privateKey, { follower: { user_id: 6, username: 'another' }, broadcaster: { user_id: 77 } }, 'evt_alert_2', 'channel.followed')
    await processor.process(second.headers, second.rawBody)
    const afterSecond = await store.listAlerts(connection.runtimeKey, {})
    assert.equal(afterSecond.filter((row) => row.event.type === 'alert.milestone').length, 1)

    assert.equal(await store.ackAlerts(connection.runtimeKey, [feed[0].event.id]), 1)
    assert.equal((await store.listAlerts(connection.runtimeKey, {})).length, afterSecond.length - 1)

    // Durability: a fresh store over the same file still knows the ack, so a reloaded OBS source cannot replay it.
    const reloaded = createIntegrationStore({ filePath, encryptionKey, persist: true })
    await reloaded.init()
    const survivors = await reloaded.listAlerts(connection.runtimeKey, {})
    assert.equal(survivors.some((row) => row.event.id === feed[0].event.id), false)
    assert.equal(await reloaded.ackAlerts(connection.runtimeKey, [feed[0].event.id]), 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
