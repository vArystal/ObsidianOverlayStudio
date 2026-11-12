import { beforeEach, describe, expect, it } from 'vitest'
import { clearAlertFailure, getAlertHealth, reportAlertFailure, resetAlertHealth, subscribeAlertHealth } from './alertHealth'

beforeEach(() => resetAlertHealth())

describe('alert feed health', () => {
  // CP37: the polling loop swallowed feed and ack errors, so a backend returning 500 looked like a quiet channel.
  it('marks the connection degraded with the cause, then clears on recovery', () => {
    let notifications = 0
    const off = subscribeAlertHealth(() => { notifications += 1 })
    reportAlertFailure(new Error('alerts 500'))
    expect(getAlertHealth().degraded).toBe(true)
    expect(getAlertHealth().message).toContain('alerts 500')
    expect(getAlertHealth().message).toContain('degraded')
    clearAlertFailure()
    expect(getAlertHealth().degraded).toBe(false)
    expect(getAlertHealth().message).toBe('')
    expect(notifications).toBe(2)
    off()
    reportAlertFailure('ack 404')
    expect(notifications).toBe(2)
    expect(getAlertHealth().message).toContain('ack 404')
  })
})
