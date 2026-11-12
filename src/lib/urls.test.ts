import { describe, expect, it } from 'vitest'
import { buildHashUrl } from './urls'

describe('static-host URLs', () => {
  it('keeps a GitHub Pages repository path and puts the app route in the hash', () => {
    window.history.replaceState({}, '', '/jubilant-octo-lamp/#/overlays')
    const result = new URL(buildHashUrl('/overlay/public-123?snapshot=encoded'))
    expect(result.origin).toBe(window.location.origin)
    expect(result.pathname).toBe('/jubilant-octo-lamp/')
    expect(result.hash).toBe('#/overlay/public-123?snapshot=encoded')
    expect(result.search).toBe('')
  })
})
