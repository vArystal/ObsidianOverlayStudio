import { verifyKickWebhook } from './security.mjs'

function person(value) {
  if (!value) return null
  return { userId: value.user_id ?? null, username: value.username ?? null, avatar: value.profile_picture ?? null, verified: Boolean(value.is_verified), channelSlug: value.channel_slug ?? null }
}

export function normalizeKickEvent({ id, type, payload, receivedAt = new Date().toISOString(), test = false }) {
  const base = { id, type, receivedAt, test, data: {} }
  switch (type) {
    case 'chat.message.sent':
      return { ...base, data: { messageId: payload.message_id, content: payload.content, createdAt: payload.created_at, sender: { ...person(payload.sender), usernameColor: payload.sender?.identity?.username_color ?? null, badges: payload.sender?.identity?.badges ?? [] }, broadcaster: person(payload.broadcaster) } }
    case 'channel.followed':
      return { ...base, data: { follower: person(payload.follower), broadcaster: person(payload.broadcaster) } }
    case 'channel.subscription.new':
    case 'channel.subscription.renewal':
      return { ...base, data: { subscriber: person(payload.subscriber), broadcaster: person(payload.broadcaster), duration: payload.duration, createdAt: payload.created_at, expiresAt: payload.expires_at } }
    case 'channel.subscription.gifts':
      return { ...base, data: { gifter: person(payload.gifter), giftees: (payload.giftees ?? []).map(person), broadcaster: person(payload.broadcaster), createdAt: payload.created_at } }
    case 'kicks.gifted':
      return { ...base, data: { sender: person(payload.sender), broadcaster: person(payload.broadcaster), gift: payload.gift ?? null, createdAt: payload.created_at } }
    case 'livestream.status.updated':
      return { ...base, data: { broadcaster: person(payload.broadcaster), isLive: Boolean(payload.is_live), title: payload.title ?? '', startedAt: payload.started_at ?? null, endedAt: payload.ended_at ?? null } }
    case 'livestream.metadata.updated':
      return { ...base, data: { broadcaster: person(payload.broadcaster), metadata: payload.metadata ?? {} } }
    default:
      return { ...base, data: { broadcaster: person(payload.broadcaster), unsupported: true } }
  }
}

export function createEventProcessor({ store, bus, getPublicKey, now = () => Date.now() }) {
  return {
    async process(headers, rawBody) {
      const preflight = verifyKickWebhook({ headers, rawBody, publicKey: '', now: now() })
      if (!preflight.ok && preflight.reason !== 'invalid_signature') return { accepted: false, status: 401, reason: preflight.reason }
      let publicKey = await getPublicKey(false)
      let verification = verifyKickWebhook({ headers, rawBody, publicKey, now: now() })
      if (!verification.ok && verification.reason === 'invalid_signature') {
        publicKey = await getPublicKey(true)
        verification = verifyKickWebhook({ headers, rawBody, publicKey, now: now() })
      }
      if (!verification.ok) return { accepted: false, status: 401, reason: verification.reason }
      if (await store.isProcessed(verification.messageId)) return { accepted: true, duplicate: true, status: 204 }
      let payload
      try { payload = JSON.parse(rawBody.toString('utf8')) } catch { return { accepted: false, status: 400, reason: 'malformed_json' } }
      const broadcasterId = payload.broadcaster?.user_id
      if (!broadcasterId) return { accepted: false, status: 400, reason: 'missing_broadcaster' }
      const connection = await store.findByBroadcasterId(broadcasterId)
      if (!connection) return { accepted: false, status: 202, reason: 'unknown_broadcaster' }
      const event = normalizeKickEvent({ id: verification.messageId, type: verification.eventType, payload })
      await store.markProcessed(verification.messageId)
      const timestamp = new Date().toISOString()
      const patch = { lastEventAt: timestamp, lastEventType: verification.eventType }
      if (verification.eventType === 'chat.message.sent') Object.assign(patch, { lastChatAt: timestamp, lastChatUser: payload.sender?.username ?? null })
      if (verification.eventType === 'channel.followed') Object.assign(patch, { lastFollowAt: timestamp, lastFollower: person(payload.follower), sessionFollowerCount: Number(connection.sessionFollowerCount || 0) + 1 })
      if (verification.eventType.startsWith('channel.subscription.')) Object.assign(patch, { lastSubscriptionAt: timestamp, lastSubscriber: person(payload.subscriber ?? payload.gifter) })
      await store.updateConnection(connection.id, patch)
      const runtimeKeys = await store.runtimeKeysForConnection(connection.id)
      runtimeKeys.forEach((runtimeKey) => bus.publish(runtimeKey, event))
      return { accepted: true, duplicate: false, status: 204, event }
    },
  }
}
