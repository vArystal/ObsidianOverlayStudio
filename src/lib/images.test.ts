import { describe, expect, it } from 'vitest'
import { dataUrlBytes, formatBytes, snapshotBudget, SNAPSHOT_BLOCK_CHARS, SNAPSHOT_WARN_CHARS } from './images'

describe('snapshot budget', () => {
  it('treats a small composition as safe', () => {
    expect(snapshotBudget(4_000).level).toBe('ok')
  })

  it('warns above the Firefox URL ceiling but stays publishable', () => {
    expect(snapshotBudget(SNAPSHOT_WARN_CHARS + 1).level).toBe('warn')
    expect(snapshotBudget(SNAPSHOT_WARN_CHARS + 1).message).toContain('Firefox')
  })

  it('blocks a snapshot Chromium could never load instead of reporting success', () => {
    const verdict = snapshotBudget(SNAPSHOT_BLOCK_CHARS + 1)
    expect(verdict.level).toBe('blocked')
    expect(verdict.message).toContain('OBS could not open it')
  })
})

describe('data url sizing', () => {
  it('matches the decoded length for padded and unpadded payloads', () => {
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3)
    expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2)
    expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1)
    expect(dataUrlBytes('not-a-data-url')).toBe(0)
  })

  it('formats sizes for humans', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
