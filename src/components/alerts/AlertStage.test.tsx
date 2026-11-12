import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertStage } from './AlertStage'
import { AlertRuntime } from './AlertRuntime'
import { createAlertSettings, testAlertEvent } from '../../lib/alerts'
import type { QueuedAlert } from '../../lib/alertQueue'

const settings = createAlertSettings()
const alert: QueuedAlert = { event: testAlertEvent('follow', { username: 'Nova' }, 'evt_1'), kind: 'follow', enqueuedAt: 0 }

describe('alert rendering parity', () => {
  it('paints the same markup the runtime paints, from one settings document', () => {
    // The editor draws through the same component the published source uses, so an alert approved in the studio
    // is the markup that goes on air. This asserts that literally, not by comparing screenshots.
    const studio = render(<AlertStage settings={settings} alert={alert} phase="hold" preview reducedMotion />)
    const air = render(<AlertStage settings={settings} alert={alert} phase="hold" reducedMotion />)
    const studioMarkup = studio.container.querySelector('.alert-stage')?.outerHTML ?? ''
    const airMarkup = air.container.querySelector('.alert-stage')?.outerHTML ?? ''
    // The only permitted difference is the preview caption.
    expect(studioMarkup.replace(/<small class="alert-preview-note">.*?<\/small>/, '')).toBe(airMarkup)
    expect(studioMarkup).toContain('Nova')
  })

  it('renders nothing on air until a real event arrives', () => {
    const { container } = render(<AlertRuntime settings={settings} live={null} />)
    expect(container.querySelector('.alert-stage')).toBeNull()
  })

  it('carries the configured colours and animation into the stage', () => {
    const custom = { ...settings, templates: { ...settings.templates, follow: { ...settings.templates.follow, enter: 'pop' as const, accentColor: '#bfe3dd' } } }
    const { container } = render(<AlertStage settings={custom} alert={alert} phase="enter" />)
    const stage = container.querySelector('.alert-stage') as HTMLElement
    expect(stage.className).toContain('alert-anim-pop')
    expect(stage.getAttribute('style')).toContain('--alert-accent: #bfe3dd')
  })
})
