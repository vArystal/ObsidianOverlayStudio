import { describe, expect, it } from 'vitest'
import type { LiveOverlayEvent } from '../types'
import type { LiveDataState } from '../components/LiveDataProvider'
import {
  connectionPhase, dataPhase, fieldPhase, formatClock, formatCount, formatDuration, toActivity, widgetSnapshot,
} from './widgetData'

const base: LiveDataState = {
  state: 'connected', messages: [], viewer: { status: 'live', count: 42, updatedAt: '2026-11-05T09:00:00.000Z' },
  latestFollower: null, sessionFollowerCount: 0, alerts: [], lastEventAt: null, configured: true,
}

describe('widget snapshot normalisation', () => {
  it('turns every absent field into null and never into a zero', () => {
    const snapshot = widgetSnapshot({ ...base, stream: null, channel: undefined, recentFollowers: undefined, activities: undefined })
    expect(snapshot.stream).toEqual({ title: null, category: null, isLive: null, startedAt: null })
    expect(snapshot.channel.activeSubscribers).toBeNull()
    expect(snapshot.subscribers.active).toBeNull()
    expect(snapshot.followers.recent).toEqual([])
    expect(snapshot.activities).toEqual([])
    // A real zero from the backend stays a zero: that is data, not an absence.
    const zero = widgetSnapshot({ ...base, channel: { slug: 'arystal', activeSubscribers: 0 } })
    expect(zero.subscribers.active).toBe(0)
  })

  it('keeps isLive ternary: true, false and unknown stay distinguishable', () => {
    const live = widgetSnapshot({ ...base, stream: { title: 'x', category: null, isLive: true, startedAt: null, updatedAt: null } })
    expect(live.stream.isLive).toBe(true)
    const offline = widgetSnapshot({ ...base, stream: { title: null, category: null, isLive: false, startedAt: null, updatedAt: null } })
    expect(offline.stream.isLive).toBe(false)
    expect(widgetSnapshot({ ...base, stream: null }).stream.isLive).toBeNull()
  })
})

describe('widget state machine', () => {
  it('maps connection states to phases, and treats an unconfigured overlay as disconnected', () => {
    expect(connectionPhase({ state: 'connected', configured: true })).toBe('live')
    expect(connectionPhase({ state: 'connecting', configured: true })).toBe('loading')
    expect(connectionPhase({ state: 'reconnecting', configured: true })).toBe('loading')
    expect(connectionPhase({ state: 'error', configured: true })).toBe('error')
    expect(connectionPhase({ state: 'disconnected', configured: true })).toBe('disconnected')
    expect(connectionPhase({ state: 'disconnected', configured: false })).toBe('disconnected')
  })

  it('separates an empty list from a disconnected channel', () => {
    expect(dataPhase({ state: 'connected', configured: true }, false)).toBe('empty')
    expect(dataPhase({ state: 'connected', configured: true }, true)).toBe('live')
    expect(dataPhase({ state: 'disconnected', configured: true }, false)).toBe('disconnected')
  })

  it('calls a blank reported field unavailable rather than empty', () => {
    expect(fieldPhase({ state: 'connected', configured: true }, 'Valorant')).toBe('live')
    expect(fieldPhase({ state: 'connected', configured: true }, null)).toBe('unavailable')
    expect(fieldPhase({ state: 'connected', configured: true }, '')).toBe('unavailable')
    expect(fieldPhase({ state: 'error', configured: true }, null)).toBe('error')
  })
})

describe('formatting', () => {
  it('formats durations with and without hours', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03')
    expect(formatDuration(249_000)).toBe('0:04:09')
    expect(formatDuration(249_000, false)).toBe('04:09')
    expect(formatDuration(-5_000)).toBe('0:00:00')
  })

  it('formats counts without inventing a zero', () => {
    expect(formatCount(12)).toBe('12')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(null)).toBe('')
    expect(formatCount(Number.NaN)).toBe('')
  })

  it('formats a clock and survives an invalid time zone instead of throwing', () => {
    const date = new Date('2026-11-05T10:30:05Z')
    expect(formatClock(date, { hour12: false, showSeconds: true, timeZone: 'UTC' })).toMatch(/^\d{2}:30:05$/)
    expect(formatClock(date, { hour12: false, showSeconds: false, timeZone: 'UTC' })).toMatch(/^\d{2}:30$/)
    expect(() => formatClock(date, { timeZone: 'Asia/Tehrn' })).not.toThrow()
    expect(formatClock(date, { timeZone: 'Asia/Tehrn' })).toMatch(/\d{2}:\d{2}/)
  })
})

describe('activity mapping', () => {
  const event = (type: string, data: Record<string, unknown>): LiveOverlayEvent => ({ id: `${type}-1`, type, receivedAt: '2026-11-05T09:00:00.000Z', test: false, data })

  it('names the actor and the action for each supported event', () => {
    expect(toActivity(event('channel.followed', { follower: { username: 'greasea' } }))).toMatchObject({ kind: 'follow', username: 'greasea', detail: 'followed' })
    expect(toActivity(event('channel.subscription.renewal', { subscriber: { username: 'nova' } }))).toMatchObject({ kind: 'subscription', username: 'nova', detail: 'renewed a subscription' })
    expect(toActivity(event('channel.subscription.new', { subscriber: { username: 'nova' } }))).toMatchObject({ detail: 'subscribed' })
    expect(toActivity(event('kicks.gifted', { sender: { username: 'k' }, gift: { amount: 5, name: 'KICKs' } }))).toMatchObject({ kind: 'gift', detail: '5 KICKs' })
    expect(toActivity(event('chat.message.sent', { content: 'hi', sender: { username: 'nova' } }))).toMatchObject({ kind: 'chat', detail: 'hi' })
  })

  it('does not invent a name for an anonymous gift', () => {
    expect(toActivity(event('kicks.gifted', { gift: { amount: 1, name: 'KICKs' } })).username).toBe('anonymous')
  })
})
