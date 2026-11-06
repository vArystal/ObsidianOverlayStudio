import { describe, expect, it } from 'vitest'
import {
  ALERT_KINDS, ALERT_AUDIO_MAX_BYTES, alertKindFor, alertPayload, createAlertSettings, enabledKinds, fillTemplate,
  normalizeAlertSettings, normalizeTemplate, renderAlertCopy, testAlertEvent,
} from './alerts'
import type { LiveOverlayEvent } from '../types'

const event = (type: string, data: Record<string, unknown> = {}, id = 'evt_1'): LiveOverlayEvent => ({ id, type, receivedAt: '2026-11-05T10:00:00.000Z', test: false, data } as LiveOverlayEvent)

describe('alert event support', () => {
  it('maps every supported Kick delivery to exactly one alert kind', () => {
    expect(alertKindFor(event('channel.followed'))).toBe('follow')
    expect(alertKindFor(event('channel.subscription.new'))).toBe('subscribe')
    expect(alertKindFor(event('channel.subscription.renewal'))).toBe('resubscribe')
    expect(alertKindFor(event('channel.subscription.gifts'))).toBe('gift')
    expect(alertKindFor(event('kicks.gifted'))).toBe('kicks')
    expect(alertKindFor(event('alert.milestone'))).toBe('milestone')
  })

  it('refuses to invent an alert for data that is not an alert', () => {
    expect(alertKindFor(event('chat.message.sent'))).toBeNull()
    expect(alertKindFor(event('livestream.status.updated'))).toBeNull()
    expect(alertKindFor(event('metric.viewer.updated'))).toBeNull()
  })

  it('reads only fields the delivery carried', () => {
    const payload = alertPayload(event('channel.followed', { follower: { username: 'Aria' } }))
    expect(payload.username).toBe('Aria')
    // A KICKs amount that was never sent stays empty rather than becoming 0.
    expect(alertPayload(event('channel.followed', {})).amount).toBe('')
    expect(alertPayload(event('kicks.gifted', { sender: { username: 'Sahar' }, gift: { amount: 25, name: 'KICKs' } })).amount).toBe('25')
  })
})

describe('alert copy', () => {
  const settings = createAlertSettings()

  it('fills tokens from the real delivery', () => {
    const copy = renderAlertCopy(settings, event('kicks.gifted', { sender: { username: 'Sahar' }, gift: { amount: 25, name: 'KICKs' } }))
    expect(copy.message).toBe('Sahar · 25 KICKs')
  })

  it('leaves unknown tokens visible instead of silently dropping them', () => {
    expect(fillTemplate('hello {nickname}', alertPayload(event('channel.followed', {})))).toBe('hello {nickname}')
  })

  it('separates the username when the message does not contain it', () => {
    const patched = { ...settings, templates: { ...settings.templates, follow: { ...settings.templates.follow, message: 'welcome aboard' } } }
    const copy = renderAlertCopy(patched, event('channel.followed', { follower: { username: 'Nova' } }))
    expect(copy.hasUsername).toBe(true)
    expect(copy.username).toBe('Nova')
    // Nothing arrived, so no name is claimed.
    expect(renderAlertCopy(patched, event('channel.followed', {})).hasUsername).toBe(false)
  })
})

describe('settings normalising', () => {
  it('is idempotent', () => {
    const once = normalizeAlertSettings(createAlertSettings())
    expect(normalizeAlertSettings(once)).toEqual(once)
  })

  it('repairs hostile or legacy input instead of throwing', () => {
    const broken = normalizeAlertSettings({ maxQueued: -5, gapMs: 'soon', volume: 9, overflow: 'explode', templates: { follow: { headline: 42, holdDuration: 1 } } })
    expect(broken.maxQueued).toBe(1)
    expect(broken.gapMs).toBe(createAlertSettings().gapMs)
    expect(broken.volume).toBe(1)
    expect(broken.overflow).toBe('drop-oldest')
    // A non-string headline falls back to the preset rather than rendering "[object Object]".
    expect(broken.templates.follow.headline).toBe(createAlertSettings().templates.follow.headline)
    expect(broken.templates.follow.holdDuration).toBe(300)
  })

  it('defaults a missing document to a usable one', () => {
    expect(normalizeAlertSettings(undefined).templates.follow.enabled).toBe(true)
    expect(normalizeAlertSettings(null).sequential).toBe(true)
  })

  it('keeps every kind addressable', () => {
    expect(Object.keys(createAlertSettings().templates).sort()).toEqual(ALERT_KINDS.map((kind) => kind.id).sort())
  })

  it('clamps audio volume and keeps a missing cue missing', () => {
    const template = normalizeTemplate({ audio: { enabled: true, src: 'data:audio/mpeg;base64,xx', volume: 4 } }, createAlertSettings().templates.follow)
    expect(template.audio.volume).toBe(1)
    expect(normalizeTemplate({ audio: { enabled: true } }, createAlertSettings().templates.follow).audio.src).toBe('')
  })

  it('drops a disabled kind from the enabled list', () => {
    const settings = createAlertSettings()
    const off = { ...settings, templates: { ...settings.templates, kicks: { ...settings.templates.kicks, enabled: false } } }
    expect(enabledKinds(off)).not.toContain('kicks')
    expect(enabledKinds(off)).toContain('follow')
  })
})

describe('test isolation', () => {
  it('marks every synthetic alert as a test with no server identity', () => {
    for (const kind of ALERT_KINDS) {
      const synthetic = testAlertEvent(kind.id, {}, `test_${kind.id}_1`)
      expect(synthetic.test).toBe(true)
      expect(synthetic.id.startsWith('test_')).toBe(true)
    }
  })

  it('uses an obvious placeholder name, never a real-looking viewer', () => {
    expect(testAlertEvent('follow').data).toMatchObject({ follower: { username: 'Nova' } })
  })

  it('never carries a production counter or target of its own', () => {
    expect(testAlertEvent('milestone').data).toMatchObject({ metric: 'followers', count: 100 })
  })

  it('keeps the audio budget small enough to ride in a published snapshot', () => {
    expect(ALERT_AUDIO_MAX_BYTES).toBeLessThanOrEqual(600 * 1024)
  })
})
