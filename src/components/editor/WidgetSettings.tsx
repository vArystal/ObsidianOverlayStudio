/**
 * CP24 inspector for registry widgets. Sections come from the widget definition's `controls`, so a clock never
 * shows list limits and a follower list never shows a countdown field: the panel can only offer settings that
 * the renderer actually reads.
 */
import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import type { OverlayElement } from '../../types'
import { FONT_FAMILIES, fontStack } from '../../lib/typography'
import { resetWidgetProps, widgetFor } from '../../lib/widgets'

const str = (element: OverlayElement, key: string, fallback = '') => String(element.props[key] ?? fallback)
const num = (element: OverlayElement, key: string, fallback = 0) => Number(element.props[key] ?? fallback)
const bool = (element: OverlayElement, key: string, fallback = false) => Boolean(element.props[key] ?? fallback)

interface GroupProps {
  element: OverlayElement
  onProp: (key: string, value: string | number | boolean | null) => void
  onReplaceProps: (props: Record<string, string | number | boolean | null>) => void
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="property-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

const Swatch = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
)

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    </label>
  )
}

export function WidgetSettings({ element, onProp, onReplaceProps }: GroupProps) {
  const definition = widgetFor(element.type)
  if (!definition || Object.keys(definition.defaults).length === 0) return null
  const has = (group: string) => definition.controls.includes(group as never)
  const defaults = definition.defaults
  const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(defaults, key)

  return (
    <>
      <details className="property-section" open>
        <summary>Widget · {definition.label}</summary>
        <div className="property-section-body">
          <div className={`integration-card ${definition.availability === 'unsupported' ? 'warning' : ''}`}>
            <div>
              <strong>{definition.availability === 'unsupported' ? 'Not available in this project' : definition.availability === 'requires-kick' ? 'Reads your Kick channel' : 'Works without an integration'}</strong>
              <p>{definition.note ?? definition.blurb}</p>
            </div>
          </div>

          {has('content') && (
            <>
              {hasKey('label') && <Row label="Label"><input value={str(element, 'label')} maxLength={64} onChange={(event) => onProp('label', event.target.value)} /></Row>}
              {hasKey('showLabel') && <ToggleRow label="Show label" checked={bool(element, 'showLabel', true)} onChange={(value) => onProp('showLabel', value)} />}
              {hasKey('fallback') && <Row label="Empty-state text" hint="Shown when Kick has not reported this value. It is a label, never a substitute number."><input value={str(element, 'fallback')} onChange={(event) => onProp('fallback', event.target.value)} /></Row>}
              {hasKey('liveText') && <Row label="Live text"><input value={str(element, 'liveText')} maxLength={24} onChange={(event) => onProp('liveText', event.target.value)} /></Row>}
              {hasKey('offlineText') && <Row label="Offline text" hint={element.type === 'streamDuration' ? 'Shown when the channel is offline; a frozen uptime would be a lie.' : undefined}><input value={str(element, 'offlineText')} maxLength={24} onChange={(event) => onProp('offlineText', event.target.value)} /></Row>}
              {hasKey('unknownText') && <Row label="Unknown text" hint="Until Kick reports live or offline. Never guessed."><input value={str(element, 'unknownText')} maxLength={24} onChange={(event) => onProp('unknownText', event.target.value)} /></Row>}
              {hasKey('unavailableText') && <Row label="Unavailable text" hint="Kick does not publish this figure for every channel."><input value={str(element, 'unavailableText')} maxLength={32} onChange={(event) => onProp('unavailableText', event.target.value)} /></Row>}
              {hasKey('emptyText') && <Row label="Empty text"><input value={str(element, 'emptyText')} maxLength={64} onChange={(event) => onProp('emptyText', event.target.value)} /></Row>}
              {hasKey('maxLines') && <Row label="Max lines"><input type="number" min={1} max={6} value={num(element, 'maxLines', 2)} onChange={(event) => onProp('maxLines', Number(event.target.value))} /></Row>}
              {hasKey('showPulse') && <ToggleRow label="Pulse while live" checked={bool(element, 'showPulse', true)} onChange={(value) => onProp('showPulse', value)} />}
              {hasKey('showHours') && <ToggleRow label="Always show hours" checked={bool(element, 'showHours', true)} onChange={(value) => onProp('showHours', value)} />}
              {hasKey('hour12') && <ToggleRow label="12-hour clock" checked={bool(element, 'hour12')} onChange={(value) => onProp('hour12', value)} />}
              {hasKey('showSeconds') && <ToggleRow label="Show seconds" checked={bool(element, 'showSeconds', true)} onChange={(value) => onProp('showSeconds', value)} />}
              {hasKey('timeZone') && <Row label="Time zone" hint="IANA name such as Europe/Berlin. Leave blank for the viewer’s zone; an invalid name falls back to it instead of breaking the source."><input value={str(element, 'timeZone')} placeholder="Europe/Berlin" onChange={(event) => onProp('timeZone', event.target.value)} /></Row>}
            </>
          )}

          {has('social') && (
            <>
              <Row label="Links" hint="One per line: “Kick @arystal” or “Instagram|arystal”.">
                <textarea rows={4} value={str(element, 'links')} onChange={(event) => onProp('links', event.target.value)} />
              </Row>
              <Row label="Handle prefix"><input value={str(element, 'handlePrefix', '@')} maxLength={4} onChange={(event) => onProp('handlePrefix', event.target.value)} /></Row>
            </>
          )}

          {has('community') && (
            <>
              {hasKey('maxItems') && <Row label="Rows shown"><input type="number" min={1} max={20} value={num(element, 'maxItems', 5)} onChange={(event) => onProp('maxItems', Number(event.target.value))} /></Row>}
              {hasKey('showAvatars') && <ToggleRow label="Show avatars" checked={bool(element, 'showAvatars', true)} onChange={(value) => onProp('showAvatars', value)} />}
              {hasKey('showTimestamps') && <ToggleRow label="Show times" checked={bool(element, 'showTimestamps', true)} onChange={(value) => onProp('showTimestamps', value)} />}
              {hasKey('showKinds') && <ToggleRow label="Show subscription kind" checked={bool(element, 'showKinds', true)} onChange={(value) => onProp('showKinds', value)} />}
              {hasKey('includeChat') && <ToggleRow label="Include chat lines" checked={bool(element, 'includeChat', true)} onChange={(value) => onProp('includeChat', value)} />}
              {hasKey('includeFollows') && <ToggleRow label="Include follows" checked={bool(element, 'includeFollows', true)} onChange={(value) => onProp('includeFollows', value)} />}
              {hasKey('includeSubs') && <ToggleRow label="Include subscriptions" checked={bool(element, 'includeSubs', true)} onChange={(value) => onProp('includeSubs', value)} />}
            </>
          )}

          {has('typography') && (
            <>
              <Row label="Typeface">
                <select value={str(element, 'fontFamily', 'inter')} onChange={(event) => onProp('fontFamily', event.target.value)}>
                  {FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                </select>
              </Row>
              <div className="two-columns">
                <Row label="Size"><input type="number" min={8} max={220} value={num(element, 'fontSize', 22)} onChange={(event) => onProp('fontSize', Number(event.target.value))} /></Row>
                <Row label="Weight">
                  <select value={num(element, 'fontWeight', 600)} onChange={(event) => onProp('fontWeight', Number(event.target.value))}>
                    {[400, 500, 600, 700, 800].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                  </select>
                </Row>
              </div>
              {hasKey('textAlign') && (
                <Row label="Alignment">
                  <select value={str(element, 'textAlign', 'left')} onChange={(event) => onProp('textAlign', event.target.value)}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                </Row>
              )}
            </>
          )}

          {has('colors') && (
            <>
              <Row label="Text colour"><Swatch value={str(element, 'color', '#f6f6f4')} onChange={(value) => onProp('color', value)} /></Row>
              {hasKey('accentColor') && <Row label="Accent colour"><Swatch value={str(element, 'accentColor', '#e8e8e6')} onChange={(value) => onProp('accentColor', value)} /></Row>}
              {hasKey('liveColor') && <Row label="Live colour"><Swatch value={str(element, 'liveColor', '#f6f6f4')} onChange={(value) => onProp('liveColor', value)} /></Row>}
              {hasKey('offlineColor') && <Row label="Offline colour"><Swatch value={str(element, 'offlineColor', '#a5a5a2')} onChange={(value) => onProp('offlineColor', value)} /></Row>}
              {hasKey('backgroundColor') && <Row label="Background"><Swatch value={str(element, 'backgroundColor', '#121214')} onChange={(value) => onProp('backgroundColor', value)} /></Row>}
            </>
          )}

          {has('surface') && (
            <>
              {hasKey('backgroundOpacity') && <Row label="Background opacity"><input type="range" min={0} max={100} value={Math.round(num(element, 'backgroundOpacity', 0.72) * 100)} onChange={(event) => onProp('backgroundOpacity', Number(event.target.value) / 100)} aria-label="Background opacity" /></Row>}
              {hasKey('borderWidth') && <Row label="Border width"><input type="number" min={0} max={12} value={num(element, 'borderWidth', 1)} onChange={(event) => onProp('borderWidth', Number(event.target.value))} /></Row>}
              {hasKey('borderColor') && <Row label="Border colour"><Swatch value={str(element, 'borderColor', '#2a2a2e')} onChange={(value) => onProp('borderColor', value)} /></Row>}
              {hasKey('radius') && <Row label="Corner radius"><input type="number" min={0} max={80} value={num(element, 'radius', 16)} onChange={(event) => onProp('radius', Number(event.target.value))} /></Row>}
              {hasKey('padding') && <Row label="Padding"><input type="number" min={0} max={64} value={num(element, 'padding', 18)} onChange={(event) => onProp('padding', Number(event.target.value))} /></Row>}
              {hasKey('shadow') && <ToggleRow label="Drop shadow" checked={bool(element, 'shadow', true)} onChange={(value) => onProp('shadow', value)} />}
            </>
          )}

          <button type="button" className="secondary-button full" onClick={() => onReplaceProps(resetWidgetProps(element.type))}>
            <RotateCcw /> Reset {definition.label.toLowerCase()} settings
          </button>
          <p className="widget-preview-font">Renders in {fontStack(str(element, 'fontFamily', 'inter')).split(',')[0].replace(/"/g, '')} · same component in the editor and in OBS.</p>
        </div>
      </details>
    </>
  )
}
