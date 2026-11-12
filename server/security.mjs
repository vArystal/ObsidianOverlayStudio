import { createCipheriv, createDecipheriv, createHash, createVerify, randomBytes, timingSafeEqual } from 'node:crypto'

const b64url = (buffer) => buffer.toString('base64url')

export function createPkce() {
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge, state: b64url(randomBytes(32)) }
}

function deriveKey(secret) {
  if (!secret || secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY must contain at least 32 characters')
  return createHash('sha256').update(secret).digest()
}

export function encryptJson(value, secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return { v: 1, iv: b64url(iv), tag: b64url(cipher.getAuthTag()), data: b64url(ciphertext) }
}

export function decryptJson(payload, secret) {
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(payload.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8'))
}

export function hashSecret(value) { return createHash('sha256').update(value).digest('hex') }
export function randomToken(bytes = 32) { return b64url(randomBytes(bytes)) }

export function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && timingSafeEqual(a, b)
}

function header(headers, name) {
  if (typeof headers.get === 'function') return headers.get(name)
  const target = name.toLowerCase()
  const pair = Object.entries(headers).find(([key]) => key.toLowerCase() === target)
  return pair?.[1]
}

export function verifyKickWebhook({ headers, rawBody, publicKey, now = Date.now(), maxAgeMs = 10 * 60_000 }) {
  const messageId = header(headers, 'Kick-Event-Message-Id')
  const timestamp = header(headers, 'Kick-Event-Message-Timestamp')
  const signature = header(headers, 'Kick-Event-Signature')
  const eventType = header(headers, 'Kick-Event-Type')
  const version = header(headers, 'Kick-Event-Version')
  if (!messageId || !timestamp || !signature || !eventType || !version) return { ok: false, reason: 'missing_headers' }
  const time = Date.parse(timestamp)
  if (!Number.isFinite(time) || Math.abs(now - time) > maxAgeMs) return { ok: false, reason: 'stale_timestamp' }
  const signed = `${messageId}.${timestamp}.${rawBody.toString('utf8')}`
  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(signed)
    verifier.end()
    if (!verifier.verify(publicKey, signature, 'base64')) return { ok: false, reason: 'invalid_signature' }
  } catch {
    return { ok: false, reason: 'invalid_signature' }
  }
  return { ok: true, messageId, timestamp, eventType, version }
}

export function redact(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redact)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => /token|secret|verifier|authorization/i.test(key) ? [key, '[REDACTED]'] : [key, redact(item)]))
}
