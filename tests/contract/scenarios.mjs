import assert from 'node:assert/strict'

/**
 * The scenarios every backend must satisfy. Written once: if one implementation drifts, the other suite fails too.
 * Only the shared contract is asserted here, never storage internals.
 */
export async function runContract(adapter) {
  const label = `[${adapter.name}]`
  const results = []
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: error.message }) }
  }

  const { token } = await adapter.seedConnection()

  await check('health answers with ok:true', async () => {
    const res = await adapter.request('GET', '/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.json.ok, true)
  })

  await check('unknown runtime key is 404 on state and alerts', async () => {
    for (const path of ['/api/runtime/nope/state', '/api/runtime/nope/alerts']) {
      const res = await adapter.request('GET', path)
      assert.equal(res.status, 404, path)
      assert.equal(res.json.error, 'runtime_not_found', path)
    }
  })

  await check('publishing needs a management token and is stable', async () => {
    assert.equal((await adapter.request('POST', '/api/overlays/publish', { body: { overlayId: 'contract_overlay_1' } })).status, 401)
    const first = await adapter.request('POST', '/api/overlays/publish', { token, body: { overlayId: 'contract_overlay_1' } })
    const second = await adapter.request('POST', '/api/overlays/publish', { token, body: { overlayId: 'contract_overlay_1' } })
    assert.equal(first.status, 200)
    assert.equal(first.json.runtimeKey, second.json.runtimeKey)
    assert.equal(first.json.publicationId, second.json.publicationId)
    assert.equal((await adapter.request('POST', '/api/overlays/publish', { token, body: { overlayId: 'no' } })).status, 400)
  })

  const published = await adapter.request('POST', '/api/overlays/publish', { token, body: { overlayId: 'contract_overlay_2' } })
  const runtimeKey = published.json.runtimeKey

  await check('state carries the stream, follower total and server time', async () => {
    const res = await adapter.request('GET', `/api/runtime/${runtimeKey}/state`)
    assert.equal(res.status, 200)
    for (const field of ['connected', 'viewer', 'latestFollower', 'sessionFollowerCount', 'channel', 'stream', 'lastEventAt', 'followerTotal', 'serverTime']) {
      assert.ok(field in res.json, `missing ${field}`)
    }
    assert.equal(res.json.followerTotal.supported, false)
    assert.equal(res.json.stream, null)
    assert.equal(JSON.stringify(res.json).includes('access'), false)
  })

  await check('alerts feed starts empty with cursor 0', async () => {
    const res = await adapter.request('GET', `/api/runtime/${runtimeKey}/alerts`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.alerts, [])
    assert.equal(res.json.cursor, 0)
    assert.equal(res.json.truncated, false)
    assert.ok(res.json.serverTime)
  })

  await check('acknowledgement rejects malformed bodies and unknown ids', async () => {
    assert.equal((await adapter.request('POST', `/api/runtime/${runtimeKey}/alerts/ack`, { body: {} })).status, 400)
    const unknown = await adapter.request('POST', `/api/runtime/${runtimeKey}/alerts/ack`, { body: { ids: ['not-a-real-id'] } })
    assert.equal(unknown.status, 200)
    assert.equal(unknown.json.acked, 0)
    assert.equal((await adapter.request('POST', '/api/runtime/nope/alerts/ack', { body: { ids: ['x'] } })).status, 404)
  })

  await check('alert settings need the owner token', async () => {
    assert.equal((await adapter.request('POST', `/api/runtime/${runtimeKey}/alert-settings`, { body: { milestones: [] } })).status, 401)
    const saved = await adapter.request('POST', `/api/runtime/${runtimeKey}/alert-settings`, { token, body: { milestones: [{ metric: 'followers', target: 1, enabled: true }, { metric: 'bogus', target: 5, enabled: true }] } })
    assert.equal(saved.status, 200)
    assert.equal(saved.json.saved, true)
    assert.equal(saved.json.milestones, 1)
  })

  await check('test events are labelled, stored as frames and never enter the feed', async () => {
    assert.equal((await adapter.request('POST', '/api/integrations/test-event', { body: { type: 'channel.followed' } })).status, 401)
    const res = await adapter.request('POST', '/api/integrations/test-event', { token, body: { type: 'channel.followed' } })
    assert.equal(res.status, 200)
    assert.equal(res.json.test, true)
    assert.equal(res.json.stored, 'alert_test_frames')
    assert.equal(res.json.event.test, true)
    assert.equal(res.json.event.type, 'channel.followed')
    const feed = await adapter.request('GET', `/api/runtime/${runtimeKey}/alerts`)
    assert.deepEqual(feed.json.alerts, [])
    const testFeed = await adapter.request('GET', `/api/runtime/${runtimeKey}/alerts?test=1`)
    assert.equal(testFeed.json.alerts.length, 1)
    assert.equal(testFeed.json.alerts[0].event.test, true)
  })

  await check('every supported test type is accepted and echoed back', async () => {
    for (const type of ['chat.message.sent', 'channel.followed', 'channel.subscription.new', 'channel.subscription.renewal', 'channel.subscription.gifts', 'kicks.gifted']) {
      const res = await adapter.request('POST', '/api/integrations/test-event', { token, body: { type } })
      assert.equal(res.status, 200, type)
      assert.equal(res.json.event.type, type, type)
      assert.equal(res.json.event.test, true, type)
    }
    const fallback = await adapter.request('POST', '/api/integrations/test-event', { token, body: { type: 'not.a.type' } })
    assert.equal(fallback.json.event.type, 'channel.followed')
  })

  await check('deleting a publication is authenticated and idempotent', async () => {
    const key = (await adapter.request('POST', '/api/overlays/publish', { token, body: { overlayId: 'contract_overlay_3' } })).json.runtimeKey
    assert.equal((await adapter.request('DELETE', '/api/overlays/contract_overlay_3/publication')).status, 401)
    const first = await adapter.request('DELETE', '/api/overlays/contract_overlay_3/publication', { token })
    assert.equal(first.status, 200)
    assert.equal(first.json.removed, 1)
    assert.equal(first.json.overlayId, 'contract_overlay_3')
    const second = await adapter.request('DELETE', '/api/overlays/contract_overlay_3/publication', { token })
    assert.equal(second.status, 200)
    assert.equal(second.json.removed, 0)
    assert.equal((await adapter.request('GET', `/api/runtime/${key}/state`)).status, 404)
    assert.equal((await adapter.request('DELETE', '/api/overlays/x/publication', { token })).status, 400)
  })

  await adapter.close?.()
  const failed = results.filter((item) => !item.ok)
  return { label, results, failed }
}
