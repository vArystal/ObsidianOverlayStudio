/**
 * CP25 alert studio.
 *
 * The configuration surface for the alert document. It edits one settings object and hands it back whole, so the
 * editor never keeps a second copy of the alert state, and every control writes something the runtime reads.
 *
 * Test plays go through the same engine as production, from a queue that never leaves this browser.
 */
import { useMemo, useRef, useState } from 'react'
import { Play, Trash2, Upload, Zap } from 'lucide-react'
import { ALERT_AUDIO_MAX_BYTES, ALERT_AUDIO_TYPES, ALERT_KINDS, ALERT_PRESETS, createAlertSettings, normalizeAlertSettings, testAlertEvent } from '../../lib/alerts'
import type { AlertKind, AlertSettings, AlertTemplate } from '../../lib/alerts'
import { FONT_FAMILIES } from '../../lib/typography'
import type { LiveOverlayEvent } from '../../types'
import { AlertStage, previewAlert } from '../alerts/AlertStage'
import type { AlertAudioStatus } from '../alerts/AlertRuntime'

type Patch<T> = Partial<T>

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="alert-field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function Slider({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string }) {
  return <span className="alert-slider"><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{Math.round(value * 100) / 100}{suffix}</output></span>
}

export interface AlertStudioProps {
  settings: AlertSettings
  onChange: (settings: AlertSettings) => void
  /** Real upload path from the editor; returns a data URL it has already validated. */
  onAudioFile: (file: File) => Promise<string | null>
  onImageFile: (file: File) => Promise<string | null>
  /** Test events are handed to the canvas queue; they are never sent to the backend. */
  onTestEvents: (events: LiveOverlayEvent[]) => void
}

export function AlertStudio({ settings, onChange, onAudioFile, onImageFile, onTestEvents }: AlertStudioProps) {
  const [kind, setKind] = useState<AlertKind>('follow')
  const [audioStatus, setAudioStatus] = useState<AlertAudioStatus>({ state: 'idle', message: '' })
  const [testName, setTestName] = useState('Nova')
  const [testMessage, setTestMessage] = useState('')
  const [busy, setBusy] = useState('')
  const template = settings.templates[kind]
  const preview = useMemo(() => previewAlert(settings, kind), [settings, kind])
  const soundRef = useRef<HTMLAudioElement | null>(null)

  const patchTemplate = (patch: Patch<AlertTemplate>) => {
    onChange({ ...settings, templates: { ...settings.templates, [kind]: { ...template, ...patch } } })
  }
  const patchSettings = (patch: Patch<AlertSettings>) => onChange({ ...settings, ...patch })
  const patchMilestone = (metric: 'followers' | 'subscribers', target: number, enabled: boolean) => {
    patchSettings({ milestones: settings.milestones.map((item) => item.metric === metric ? { ...item, target, enabled } : item) })
  }

  async function setAudio(file: File) {
    if (!(ALERT_AUDIO_TYPES as readonly string[]).includes(file.type)) { setAudioStatus({ state: 'error', message: 'Use MP3, WAV, OGG or WebM audio' }); return }
    if (file.size > ALERT_AUDIO_MAX_BYTES) { setAudioStatus({ state: 'error', message: `Audio must be under ${Math.round(ALERT_AUDIO_MAX_BYTES / 1024)} KB so the published source can carry it` }); return }
    setBusy('Reading audio…')
    const src = await onAudioFile(file)
    setBusy('')
    if (!src) { setAudioStatus({ state: 'error', message: 'That file could not be read' }); return }
    patchTemplate({ audio: { ...template.audio, src, name: file.name, enabled: true } })
    setAudioStatus({ state: 'idle', message: '' })
  }

  async function setImage(file: File) {
    setBusy('Reading image…')
    const src = await onImageFile(file)
    setBusy('')
    if (src) patchTemplate({ imageSrc: src, icon: 'image' })
  }

  function playAudio() {
    if (!template.audio.src) { setAudioStatus({ state: 'error', message: 'No sound uploaded for this alert' }); return }
    const audio = new Audio(template.audio.src)
    audio.volume = Math.min(1, Math.max(0, settings.volume * template.audio.volume))
    soundRef.current = audio
    audio.play().then(() => setAudioStatus({ state: 'played', message: 'Sound safe to play in the editor' }))
      .catch((error: unknown) => setAudioStatus({ state: 'error', message: error instanceof Error && error.name === 'NotAllowedError' ? 'Browser blocked playback until you click' : 'That audio could not be played' }))
  }

  const fireTest = (count = 1) => {
    const events = Array.from({ length: count }, (_, index) => testAlertEvent(kind, { username: testName || 'Nova' }, `test_${kind}_${Date.now()}_${index}`))
    onTestEvents(events)
    setAudioStatus((status) => status.state === 'idle' ? { state: 'played', message: `Queued ${count} test alert${count === 1 ? '' : 's'} locally` } : status)
  }

  return (
    <div className="alert-studio" data-testid="alert-studio">
      <div className="alert-studio-preview" aria-hidden="false">
        <AlertStage settings={settings} alert={preview} phase="hold" preview reducedMotion />
      </div>

      <div className="alert-kinds" role="tablist" aria-label="Alert type">
        {ALERT_KINDS.map((info) => (
          <button key={info.id} type="button" role="tab" aria-selected={kind === info.id} className={kind === info.id ? 'active' : ''} onClick={() => setKind(info.id)}>
            {info.label}
            {!settings.templates[info.id].enabled && <small>off</small>}
          </button>
        ))}
      </div>
      <p className="alert-source">{ALERT_KINDS.find((info) => info.id === kind)?.source}</p>

      <fieldset className="alert-group">
        <legend>Template</legend>
        <label className="alert-toggle"><input type="checkbox" checked={template.enabled} onChange={(event) => patchTemplate({ enabled: event.target.checked })} /><span>Play this alert type</span></label>
        <div className="alert-presets">
          {ALERT_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="alert-preset" onClick={() => patchTemplate(preset.apply(template))} title={preset.description}>
              <strong>{preset.name}</strong><small>{preset.description}</small>
            </button>
          ))}
        </div>
        <Row label="Headline" hint="supports {username} {amount} {gift} {count}">
          <input value={template.headline} onChange={(event) => patchTemplate({ headline: event.target.value })} />
        </Row>
        <Row label="Message">
          <textarea rows={2} value={template.message} onChange={(event) => patchTemplate({ message: event.target.value })} />
        </Row>
        <div className="alert-row">
          <label className="alert-toggle"><input type="checkbox" checked={template.showHeadline} onChange={(event) => patchTemplate({ showHeadline: event.target.checked })} /><span>Headline</span></label>
          <label className="alert-toggle"><input type="checkbox" checked={template.showMessage} onChange={(event) => patchTemplate({ showMessage: event.target.checked })} /><span>Message</span></label>
          <label className="alert-toggle"><input type="checkbox" checked={template.showAvatar} onChange={(event) => patchTemplate({ showAvatar: event.target.checked })} /><span>Avatar</span></label>
        </div>
      </fieldset>

      <fieldset className="alert-group">
        <legend>Typography</legend>
        <Row label="Family">
          <select value={template.fontId} onChange={(event) => patchTemplate({ fontId: event.target.value })}>
            {FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
          </select>
        </Row>
        <Row label="Headline size"><Slider value={template.headlineSize} min={12} max={64} onChange={(value) => patchTemplate({ headlineSize: value })} suffix="px" /></Row>
        <Row label="Message size"><Slider value={template.messageSize} min={12} max={48} onChange={(value) => patchTemplate({ messageSize: value })} suffix="px" /></Row>
        <Row label="Alignment">
          <select value={template.align} onChange={(event) => patchTemplate({ align: event.target.value as AlertTemplate['align'] })}>
            <option value="left">Left</option><option value="center">Center</option>
          </select>
        </Row>
        <Row label="Layout">
          <select value={template.layout} onChange={(event) => patchTemplate({ layout: event.target.value as AlertTemplate['layout'] })}>
            <option value="stack">Stack</option><option value="split">Split</option><option value="banner">Banner</option>
          </select>
        </Row>
      </fieldset>

      <fieldset className="alert-group">
        <legend>Surface</legend>
        <div className="alert-row">
          <Row label="Text"><input type="color" value={template.textColor} onChange={(event) => patchTemplate({ textColor: event.target.value })} /></Row>
          <Row label="Accent"><input type="color" value={template.accentColor} onChange={(event) => patchTemplate({ accentColor: event.target.value })} /></Row>
          <Row label="Panel"><input type="color" value={template.backgroundColor} onChange={(event) => patchTemplate({ backgroundColor: event.target.value })} /></Row>
          <Row label="Border"><input type="color" value={template.borderColor} onChange={(event) => patchTemplate({ borderColor: event.target.value })} /></Row>
        </div>
        <Row label="Panel opacity"><Slider value={template.backgroundOpacity} min={0} max={1} step={0.02} onChange={(value) => patchTemplate({ backgroundOpacity: value })} /></Row>
        <Row label="Border width"><Slider value={template.borderWidth} min={0} max={8} onChange={(value) => patchTemplate({ borderWidth: value })} suffix="px" /></Row>
        <Row label="Radius"><Slider value={template.radius} min={0} max={48} onChange={(value) => patchTemplate({ radius: value })} suffix="px" /></Row>
        <Row label="Ornament">
          <select value={template.ornament} onChange={(event) => patchTemplate({ ornament: event.target.value as AlertTemplate['ornament'] })}>
            <option value="none">None</option><option value="rule">Rule</option><option value="corners">Corner marks</option><option value="double">Double border</option>
          </select>
        </Row>
        <Row label="Icon">
          <select value={template.icon} onChange={(event) => patchTemplate({ icon: event.target.value as AlertTemplate['icon'] })}>
            <option value="none">None</option><option value="glyph">Glyph</option><option value="image">Uploaded image</option>
          </select>
        </Row>
        <label className="alert-upload">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void setImage(event.target.files[0])} />
          <Upload size={14} /><span>{template.imageSrc ? 'Replace artwork' : 'Upload artwork or GIF'}</span>
        </label>
      </fieldset>

      <fieldset className="alert-group">
        <legend>Motion and timing</legend>
        <Row label="Entrance">
          <select value={template.enter} onChange={(event) => patchTemplate({ enter: event.target.value as AlertTemplate['enter'] })}>
            <option value="fade">Fade</option><option value="slide">Slide</option><option value="scale">Scale</option><option value="pop">Pop</option><option value="ornamental">Ornamental</option>
          </select>
        </Row>
        <Row label="Exit">
          <select value={template.exit} onChange={(event) => patchTemplate({ exit: event.target.value as AlertTemplate['exit'] })}>
            <option value="fade">Fade</option><option value="slide">Slide</option><option value="scale">Scale</option>
          </select>
        </Row>
        <Row label="Display duration"><Slider value={template.holdDuration} min={1000} max={15000} step={100} onChange={(value) => patchTemplate({ holdDuration: value })} suffix="ms" /></Row>
        <Row label="Entrance time"><Slider value={template.enterDuration} min={100} max={2000} step={20} onChange={(value) => patchTemplate({ enterDuration: value })} suffix="ms" /></Row>
        <Row label="Exit time"><Slider value={template.exitDuration} min={100} max={2000} step={20} onChange={(value) => patchTemplate({ exitDuration: value })} suffix="ms" /></Row>
      </fieldset>

      <fieldset className="alert-group">
        <legend>Audio</legend>
        <label className="alert-toggle"><input type="checkbox" checked={template.audio.enabled} onChange={(event) => patchTemplate({ audio: { ...template.audio, enabled: event.target.checked } })} /><span>Play a sound for this alert</span></label>
        <label className="alert-upload">
          <input type="file" accept={ALERT_AUDIO_TYPES.join(',')} onChange={(event) => event.target.files?.[0] && void setAudio(event.target.files[0])} />
          <Upload size={14} /><span>{template.audio.name || 'Upload MP3, WAV, OGG or WebM'}</span>
        </label>
        <Row label="Cue volume"><Slider value={template.audio.volume} min={0} max={1} step={0.02} onChange={(value) => patchTemplate({ audio: { ...template.audio, volume: value } })} /></Row>
        <div className="alert-row">
          <button type="button" className="secondary-button" onClick={playAudio}><Play size={14} /> Preview sound</button>
          {template.audio.src && <button type="button" className="secondary-button" onClick={() => patchTemplate({ audio: { ...template.audio, src: '', name: '' } })}><Trash2 size={14} /> Remove</button>}
        </div>
        {audioStatus.message && <p className={`alert-status ${audioStatus.state}`}>{audioStatus.message}</p>}
      </fieldset>

      <fieldset className="alert-group">
        <legend>Queue</legend>
        <label className="alert-toggle"><input type="checkbox" checked={settings.sequential} onChange={(event) => patchSettings({ sequential: event.target.checked })} /><span>One alert at a time</span></label>
        <Row label="Gap between alerts"><Slider value={settings.gapMs} min={0} max={5000} step={100} onChange={(value) => patchSettings({ gapMs: value })} suffix="ms" /></Row>
        <Row label="Queue limit"><Slider value={settings.maxQueued} min={1} max={30} onChange={(value) => patchSettings({ maxQueued: value })} /></Row>
        <Row label="When the queue is full">
          <select value={settings.overflow} onChange={(event) => patchSettings({ overflow: event.target.value as AlertSettings['overflow'] })}>
            <option value="drop-oldest">Keep the newest</option><option value="drop-newest">Keep the oldest</option>
          </select>
        </Row>
        <Row label="Minimum on screen"><Slider value={settings.minDurationMs} min={500} max={8000} step={100} onChange={(value) => patchSettings({ minDurationMs: value })} suffix="ms" /></Row>
        <label className="alert-toggle"><input type="checkbox" checked={settings.muted} onChange={(event) => patchSettings({ muted: event.target.checked })} /><span>Mute all alert sounds</span></label>
        <Row label="Master volume"><Slider value={settings.volume} min={0} max={1} step={0.02} onChange={(value) => patchSettings({ volume: value })} /></Row>
      </fieldset>

      <fieldset className="alert-group">
        <legend>Milestones</legend>
        <p className="alert-hint">Counted from verified webhook deliveries on this connection, never from a guessed total. Subscriber milestones count new subscriptions.</p>
        {settings.milestones.map((milestone) => (
          <div key={milestone.metric} className="alert-row">
            <label className="alert-toggle"><input type="checkbox" checked={milestone.enabled} onChange={(event) => patchMilestone(milestone.metric, milestone.target, event.target.checked)} /><span>{milestone.metric === 'followers' ? 'Followers' : 'Subscribers'}</span></label>
            <input type="number" min={1} value={milestone.target} onChange={(event) => patchMilestone(milestone.metric, Number(event.target.value), milestone.enabled)} />
          </div>
        ))}
      </fieldset>

      <fieldset className="alert-group">
        <legend>Test mode</legend>
        <p className="alert-hint">Test alerts stay in this browser. They are never written to the production event table, never acknowledged and never counted.</p>
        <Row label="Username"><input value={testName} maxLength={40} onChange={(event) => setTestName(event.target.value)} /></Row>
        <Row label="Message override" hint="optional">
          <input value={testMessage} maxLength={120} onChange={(event) => {
            setTestMessage(event.target.value)
            if (event.target.value) patchTemplate({ message: event.target.value })
          }} />
        </Row>
        <div className="alert-row">
          <button type="button" className="primary-button" onClick={() => fireTest(1)}><Zap size={14} /> Test this alert</button>
          <button type="button" className="secondary-button" onClick={() => fireTest(3)}>Test three in a row</button>
        </div>
        <button type="button" className="secondary-button" onClick={() => onChange(createAlertSettings())}>Reset alert settings</button>
        <button type="button" className="secondary-button" onClick={() => onChange(normalizeAlertSettings(settings))}>Repair invalid fields</button>
        {busy && <p className="alert-status">{busy}</p>}
      </fieldset>
    </div>
  )
}
