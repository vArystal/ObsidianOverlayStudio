import { describe, expect, it } from 'vitest'
import { ALERT_AUDIO_MAX_BYTES, validateAlertAudio } from './alerts'

describe('alert audio guard', () => {
  // CP37: the studio uploader accepted 8 MB while the inspector accepted 600 KB, so a file could be stored one way
  // and rejected the other. Both now ask this one validator.
  it('rejects a file larger than the published budget with the same message everywhere', () => {
    const verdict = validateAlertAudio({ type: 'audio/mpeg', size: 8 * 1024 * 1024 })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain(`${Math.round(ALERT_AUDIO_MAX_BYTES / 1024)} KB`)
    expect(verdict.message).toContain('published source')
  })

  it('rejects a format the published source cannot carry', () => {
    const verdict = validateAlertAudio({ type: 'audio/flac', size: 1024 })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('MP3')
  })

  it('accepts WebM at the budget edge, which the studio uploader used to reject', () => {
    expect(validateAlertAudio({ type: 'audio/webm', size: ALERT_AUDIO_MAX_BYTES }).ok).toBe(true)
    expect(validateAlertAudio({ type: 'audio/mpeg', size: ALERT_AUDIO_MAX_BYTES + 1 }).ok).toBe(false)
  })
})
