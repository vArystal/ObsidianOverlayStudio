import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createPkce, decryptJson, encryptJson, redact, safeEqual, verifyKickWebhook } from './security.mjs'

const secret = 'test-key-that-is-deliberately-over-thirty-two-characters'

test('PKCE material is high entropy and URL safe', () => {
  const one = createPkce(); const two = createPkce()
  assert.match(one.verifier, /^[A-Za-z0-9_-]{43,}$/)
  assert.match(one.challenge, /^[A-Za-z0-9_-]{43,}$/)
  assert.notEqual(one.state, two.state)
  assert.notEqual(one.verifier, two.verifier)
})

test('AES-GCM token envelope round trips without plaintext leakage', () => {
  const value = { access_token: 'access-value', refresh_token: 'refresh-value', expiresAt: 42 }
  const encrypted = encryptJson(value, secret)
  assert.equal(JSON.stringify(encrypted).includes('access-value'), false)
  assert.deepEqual(decryptJson(encrypted, secret), value)
  assert.throws(() => decryptJson(encrypted, `${secret}changed`))
})

test('webhook verifier accepts exact Kick signed input and rejects tampering', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const timestamp = new Date().toISOString(); const id = 'message-123'; const rawBody = Buffer.from('{"broadcaster":{"user_id":7}}')
  const signature = sign('RSA-SHA256', Buffer.from(`${id}.${timestamp}.${rawBody}`), privateKey).toString('base64')
  const headers = { 'Kick-Event-Message-Id': id, 'Kick-Event-Message-Timestamp': timestamp, 'Kick-Event-Signature': signature, 'Kick-Event-Type': 'channel.followed', 'Kick-Event-Version': '1' }
  assert.equal(verifyKickWebhook({ headers, rawBody, publicKey }).ok, true)
  assert.deepEqual(verifyKickWebhook({ headers, rawBody: Buffer.from('{}'), publicKey }), { ok: false, reason: 'invalid_signature' })
})

test('webhook verifier rejects missing and stale headers before processing', () => {
  assert.deepEqual(verifyKickWebhook({ headers: {}, rawBody: Buffer.from('{}'), publicKey: 'unused' }), { ok: false, reason: 'missing_headers' })
  const headers = { 'Kick-Event-Message-Id': 'x', 'Kick-Event-Message-Timestamp': '2020-01-01T00:00:00Z', 'Kick-Event-Signature': 'x', 'Kick-Event-Type': 'x', 'Kick-Event-Version': '1' }
  assert.deepEqual(verifyKickWebhook({ headers, rawBody: Buffer.from('{}'), publicKey: 'x', now: Date.parse('2020-01-01T01:00:00Z') }), { ok: false, reason: 'stale_timestamp' })
})

test('redaction recursively removes sensitive values', () => {
  const redacted = redact({ accessToken: 'a', nested: { client_secret: 'b', safe: 'visible' }, list: [{ verifier: 'c' }] })
  assert.equal(redacted.accessToken, '[REDACTED]')
  assert.equal(redacted.nested.client_secret, '[REDACTED]')
  assert.equal(redacted.nested.safe, 'visible')
  assert.equal(redacted.list[0].verifier, '[REDACTED]')
  assert.equal(safeEqual('same', 'same'), true)
  assert.equal(safeEqual('same', 'different'), false)
})
