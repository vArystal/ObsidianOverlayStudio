/**
 * CP25 alert stage.
 *
 * The one place an alert is painted. The editor preview and the OBS runtime both render this component from the
 * same settings object, so what the author approves is literally the markup that goes on air.
 */
import type { CSSProperties } from 'react'
import { alertPayload, createAlertSettings, fillTemplate, renderAlertCopy, testAlertEvent } from '../../lib/alerts'
import type { AlertKind, AlertSettings, AlertTemplate } from '../../lib/alerts'
import type { AlertPhase, QueuedAlert } from '../../lib/alertQueue'
import { fontStack } from '../../lib/typography'

const ORNAMENT_GLYPH: Record<string, string> = { none: '', rule: '—', corners: '◢', double: '❖' }

const KIND_GLYPH: Record<AlertKind, string> = {
  follow: '✦', subscribe: '★', resubscribe: '⟳', gift: '❖', kicks: '◆', milestone: '❙❙',
}

export interface AlertStageProps {
  settings: AlertSettings
  alert: QueuedAlert
  phase: AlertPhase
  /** Editor preview draws the same element, but must say that no event has happened. */
  preview?: boolean
  reducedMotion?: boolean
}

export function alertStyle(template: AlertTemplate): CSSProperties {
  return {
    '--alert-bg': template.backgroundColor,
    '--alert-bg-opacity': String(template.backgroundOpacity),
    '--alert-border': template.borderColor,
    '--alert-border-width': `${template.borderWidth}px`,
    '--alert-radius': `${template.radius}px`,
    '--alert-text': template.textColor,
    '--alert-muted': template.mutedColor,
    '--alert-accent': template.accentColor,
    '--alert-headline': `${template.headlineSize}px`,
    '--alert-message': `${template.messageSize}px`,
    '--alert-username': `${template.usernameSize}px`,
    '--alert-enter-ms': `${template.enterDuration}ms`,
    '--alert-exit-ms': `${template.exitDuration}ms`,
    fontFamily: fontStack(template.fontId),
  } as CSSProperties
}

export function AlertStage({ settings, alert, phase, preview = false, reducedMotion = false }: AlertStageProps) {
  const kind = alert.kind
  const template = settings.templates[kind]
  const copy = renderAlertCopy(settings, alert.event)
  const payload = alertPayload(alert.event)
  const ornament = template.ornament === 'none' ? '' : ORNAMENT_GLYPH[template.ornament]
  const animation = reducedMotion ? 'none' : phase === 'exit' ? template.exit : template.enter
  return (
    <div
      className={`alert-stage alert-layout-${template.layout} alert-align-${template.align} alert-ornament-${template.ornament} alert-kind-${kind} alert-anim-${animation} alert-phase-${phase}`}
      style={alertStyle(template)}
      data-alert-id={alert.event.id}
      data-alert-kind={kind}
      role="status"
      aria-live="polite"
    >
      {ornament && <span className="alert-ornament alert-ornament-before" aria-hidden="true">{ornament}</span>}
      {template.icon !== 'none' && (
        <span className="alert-icon" aria-hidden="true">
          {template.icon === 'image' && template.imageSrc ? <img src={template.imageSrc} alt="" /> : <span className="alert-glyph">{KIND_GLYPH[kind]}</span>}
        </span>
      )}
      <div className="alert-body">
        {template.showAvatar && payload.avatar && <img className="alert-avatar" src={payload.avatar} alt="" />}
        <div className="alert-copy">
          {template.showHeadline && copy.headline && <strong className="alert-headline">{copy.headline}</strong>}
          {copy.hasUsername && <span className="alert-username" style={payload.usernameColor ? { color: payload.usernameColor } : undefined}>{copy.username}</span>}
          {template.showMessage && copy.message && <span className="alert-message">{copy.message}</span>}
        </div>
      </div>
      {ornament && <span className="alert-ornament alert-ornament-after" aria-hidden="true">{ornament}</span>}
      {preview && <small className="alert-preview-note">PREVIEW · NO EVENT HAS ARRIVED</small>}
    </div>
  )
}

/**
 * A sample alert for the studio's template list. It is built by `testAlertEvent`, the same helper the test-mode
 * buttons use, so a preview card and a test play cannot disagree.
 */
export function previewAlert(settings: AlertSettings, kind: AlertKind, overrides: Partial<Record<'username' | 'amount' | 'gift' | 'count' | 'target', string>> = {}): QueuedAlert {
  void settings
  return { event: testAlertEvent(kind, overrides, `preview_${kind}`), kind, enqueuedAt: 0 }
}

/** Fills a template string against sample payload data, for studio hints. */
export function sampleCopy(template: AlertTemplate, kind: AlertKind) {
  const payload = alertPayload(previewAlert(createAlertSettings(), kind).event)
  return { headline: fillTemplate(template.headline, payload), message: fillTemplate(template.message, payload) }
}
