import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Camera, Eye, Gamepad2, Image as ImageIcon, Radio, UserPlus, UserRound } from 'lucide-react'
import { useLiveData } from './LiveDataProvider'
import { resolveDecoration } from '../lib/themes'
import { containerStyle } from '../lib/elements'
import { fontStack, isFontMissing, readTypography, textBoxStyle, typographyStyle } from '../lib/typography'
import { shellElement, renderKickWidget, Shell } from './widgets'
import { AlertRuntime, useAlertSurface } from './alerts/AlertRuntime'
import type { OverlayElement, OverlayTheme } from '../types'

interface ElementRendererProps {
  element: OverlayElement
  theme?: OverlayTheme
  /** Published output: live data or nothing, never placeholders. */
  runtime?: boolean
  /** Editor preview: every configured element, clean of editor chrome, no fabricated live data. */
  preview?: boolean
}
const text = (element: OverlayElement, key: string, fallback = '') => String(element.props[key] ?? fallback)
const num = (element: OverlayElement, key: string, fallback = 0) => Number(element.props[key] ?? fallback)
const bool = (element: OverlayElement, key: string, fallback = false) => Boolean(element.props[key] ?? fallback)

const sampleMessages = [
  { id: 'sample-1', username: 'Roya', content: 'سلام! قاب جدید فوق‌العاده‌ست ✨', createdAt: new Date().toISOString(), color: '#f1d89a', avatar: 'ر', badges: [{ type: 'subscriber', text: 'SUB', count: 6 }] },
  { id: 'sample-2', username: 'ArashGG', content: 'برای راند بعدی آماده‌ایم!', createdAt: new Date().toISOString(), color: '#67e8f9', avatar: 'A', badges: [{ type: 'vip', text: 'VIP' }] },
  { id: 'sample-3', username: 'NovaSky', content: 'That Persian frame is so clean.', createdAt: new Date().toISOString(), color: '#c4b5fd', avatar: 'N', badges: [{ type: 'moderator', text: 'MOD' }] },
]

function colorWithOpacity(hex: string | undefined, opacity: number) {
  // Older saved overlays and hand-edited storage can lack theme colours; a throw here would take down
  // every element in the runtime, so an unknown colour degrades to no tint instead.
  if (typeof hex !== 'string' || hex.length === 0) return 'transparent'
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`
}

function DecoratedWidget({ element, theme, children }: { element: OverlayElement; theme?: OverlayTheme; children: ReactNode }) {
  if (children === null) return null
  const decoration = theme ? resolveDecoration(element.decoration, theme) : element.decoration
  if (!decoration?.enabled) return <>{children}</>
  const texture = theme?.chrome.texture ?? 'none'
  const style = {
    '--frame-border': decoration.borderColor,
    '--frame-border-opacity': decoration.borderOpacity,
    '--frame-inner': decoration.innerBorderColor,
    '--frame-inner-opacity': decoration.innerBorderOpacity,
    '--frame-bg': colorWithOpacity(decoration.backgroundColor, decoration.backgroundOpacity),
    '--frame-radius': `${decoration.radius}px`,
    '--frame-width': `${decoration.borderVisible ? decoration.borderWidth : 0}px`,
    '--frame-padding': `${decoration.padding}px`,
    '--frame-glow': theme?.glow ?? decoration.borderColor,
  } as CSSProperties
  return (
    <div className={`decorated-widget pattern-${decoration.pattern} ${decoration.innerBorder ? 'has-inner-border' : ''} ${decoration.shadow ? 'has-frame-shadow' : ''} ${decoration.glow ? 'has-frame-glow' : ''} ${decoration.highlight ? 'has-highlight' : ''} texture-${texture}`} style={style}>
      {decoration.cornerOrnaments && <><i className="persian-corner corner-tl" /><i className="persian-corner corner-tr" /><i className="persian-corner corner-bl" /><i className="persian-corner corner-br" /></>}
      {decoration.separator && <span className="ornamental-separator"><b /><i /> <b /></span>}
      <div className="decorated-content" dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: text(element, 'fontFamily') ? fontStack(text(element, 'fontFamily')) : undefined, fontSize: element.props.fontSize ? num(element, 'fontSize') : undefined, textAlign: (text(element, 'contentAlign') || undefined) as CSSProperties['textAlign'] }}>{children}</div>
    </div>
  )
}

function ChatWidget({ element, runtime, preview }: { element: OverlayElement; runtime: boolean; preview: boolean }) {
  const live = useLiveData()
  const [clock, setClock] = useState(Date.now())
  const duration = Math.max(3, num(element, 'messageDuration', 28)) * 1000
  useEffect(() => { if (!runtime) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [runtime])
  const max = Math.max(1, Math.min(20, num(element, 'maxMessages', 7)))
  const messages = runtime
    ? live.messages.filter((message) => clock - Date.parse(message.createdAt) < duration).slice(-max).map((message) => ({ ...message, color: message.usernameColor || '#f1d89a', avatar: message.avatar, exiting: clock - Date.parse(message.createdAt) > duration - 700 }))
    : preview
      // A design preview must show the frame and its typography without inventing a conversation.
      ? []
      : sampleMessages.slice(0, max)
  if (runtime && !messages.length) return null
  return (
    <div className={`chat-widget premium-chat ${bool(element, 'scrolling', true) ? 'chat-scroll' : 'chat-stack'}`} dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: fontStack(text(element, 'fontFamily', 'vazirmatn')), fontSize: num(element, 'fontSize', 20), color: text(element, 'textColor', '#fff8e7'), gap: num(element, 'messageSpacing', 14) }}>
      {!runtime && !preview && <div className="preview-chip">نمونه نمایشی · SAMPLE ONLY</div>}
      {preview && !messages.length && <div className="chat-empty"><span>{text(element, 'emptyText', 'Chat messages appear here')}</span><small>Your frame, type and colours render now · real messages arrive when the channel is live</small></div>}
      {messages.map((message, index) => (
        <div className={`chat-message live-message entrance-${text(element, 'entrance', 'ornamental')} ${'exiting' in message && message.exiting ? `message-exit-${text(element, 'exit', 'fade')}` : ''}`} key={message.id} style={{ animationDelay: `${index * 60}ms` }}>
          {bool(element, 'showAvatars', true) && <span className="chat-avatar" style={{ background: message.color }}>{typeof message.avatar === 'string' && message.avatar.length < 3 ? message.avatar : message.username[0]}</span>}
          <span className="chat-copy">
            <span className="chat-meta">
              {bool(element, 'showTimestamps') && <small className="chat-time">{messageTime(message.createdAt)}</small>}
              {bool(element, 'showUsernames', true) && <strong style={{ color: message.color }}>{message.username}</strong>}
              {bool(element, 'showBadges', true) && ('badges' in message ? message.badges : []).slice(0, 3).map((badge: { type: string; text: string; count?: number }) => (
                <span className="chat-badge" key={`${badge.type}-${badge.text}`} title={badge.type}>{badge.text || badge.type}{badge.count ? ` ×${badge.count}` : ''}</span>
              ))}
              {'test' in message && message.test && live.testMode && <small className="test-event-mark">TEST</small>}
            </span>
            <span>{message.content}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

type CameraState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported'

/**
 * A browser source can capture a camera the streamer grants it, and that is the one capture a browser
 * genuinely performs. Everything else in this widget is a frame to align an OBS source with, which is
 * what the editor text says; nothing here pretends to read another application's window.
 */
function WebcamElement({ element, runtime, preview }: { element: OverlayElement; runtime: boolean; preview: boolean }) {
  const mode = text(element, 'captureMode', 'frame')
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>('idle')
  const radius = text(element, 'shape') === 'circle' ? '50%' : num(element, 'borderRadius', 24)
  useEffect(() => {
    if ((!runtime && !preview) || mode !== 'camera') return
    if (!navigator.mediaDevices?.getUserMedia) { setCamera('unsupported'); return }
    let stream: MediaStream | null = null
    let cancelled = false
    setCamera('requesting')
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((media) => {
        // A source can be reloaded mid-permission; without this the camera light stays on forever.
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return }
        stream = media
        if (video.current) video.current.srcObject = media
        setCamera('live')
      })
      .catch(() => { if (!cancelled) setCamera('denied') })
    return () => { cancelled = true; stream?.getTracks().forEach((track) => track.stop()) }
  }, [runtime, preview, mode])

  if (mode === 'camera') {
    return (
      <div className="placeholder-element webcam-placeholder camera-source" style={{ borderRadius: radius, background: 'transparent', overflow: 'hidden' }}>
        <video ref={video} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: camera === 'live' ? 'block' : 'none', borderRadius: radius }} />
        {camera !== 'live' && (
          <div className="camera-state">
            <Camera />
            <span>{camera === 'requesting' ? 'Requesting camera permission' : camera === 'denied' ? 'CAMERA BLOCKED' : camera === 'unsupported' ? 'CAMERA UNSUPPORTED' : text(element, 'label')}</span>
            <small>{camera === 'denied' ? 'Allow camera access for this source in OBS, then reload' : camera === 'unsupported' ? 'This browser exposes no camera API' : 'A permission prompt may appear behind the source'}</small>
          </div>
        )}
      </div>
    )
  }

  // Frame mode is alignment geometry, not a picture: in OBS it must never cover the real camera feed.
  return (
    <div className="placeholder-element webcam-placeholder" style={{ borderRadius: radius, background: runtime ? 'transparent' : colorWithOpacity(text(element, 'fillColor', '#170b20'), num(element, 'fillOpacity', .2)) }}>
      {!runtime && !preview && <><Camera /><span>{text(element, 'label')}</span><small>Frame only · place your OBS camera behind this source</small></>}
      {preview && <div className="camera-state"><Camera /><span>{text(element, 'label')}</span><small>Frame only · align your OBS camera here, or switch Camera source to this browser</small></div>}
    </div>
  )
}

function Countdown({ element }: { element: OverlayElement }) {
  // An absolute target survives OBS restarts; a bare duration cannot, so it is documented as
  // restarting with the overlay and the inspector says so next to the field.
  const targetAt = text(element, 'targetAt', '')
  const minutes = Math.max(0, num(element, 'minutes', 10))
  const target = useMemo(() => {
    const parsed = targetAt ? new Date(targetAt).getTime() : Number.NaN
    return Number.isNaN(parsed) ? Date.now() + minutes * 60_000 : parsed
  }, [targetAt, minutes])
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.round((target - Date.now()) / 1000)))
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [target])
  const hours = Math.floor(remaining / 3600)
  const formatted = hours > 0
    ? `${hours}:${Math.floor((remaining % 3600) / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
    : `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`
  return <Shell element={element} className={`metric-widget countdown-widget ${remaining === 0 ? 'countdown-done' : ''}`}><small>{text(element, 'label', 'شروع استریم تا')}</small><strong>{formatted}</strong></Shell>
}

/** Wall-clock for a chat line. Invalid or missing timestamps render nothing rather than a fake time. */
function messageTime(createdAt: string | undefined) {
  if (!createdAt) return ''
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * CP25: the alert element delegates to the shared queue runtime. The surface (settings + live wiring) comes from
 * context so the canvas and the published source cannot be given different documents, and a studio preview never
 * opens a connection or acknowledges anything.
 */
function LiveAlert({ element, runtime }: { element: OverlayElement; runtime: boolean }) {
  const live = useLiveData()
  const surface = useAlertSurface()
  const settings = surface.settings
  // Studio test plays live in the surface so the toolbar buttons and the inspector share one queue.
  return (
    <AlertRuntime
      settings={settings}
      live={runtime ? surface.live : null}
      testMode={surface.testMode && !runtime}
      reducedMotion={surface.reducedMotion || element.animation.reducedMotion === 'static'}
      preview={!runtime}
      incoming={runtime ? (live.alerts.length ? live.alerts : []) : []}
      testQueue={surface.testMode ? surface.testQueue : []}
    />
  )
}

function ElementContent({ element, runtime, preview }: { element: OverlayElement; runtime: boolean; preview: boolean }) {
  const live = useLiveData(); const p = element.props
  // CP24: every widget in the registry renders through one shared component tree, so the editor canvas and the
  // published source cannot drift. `runtime`/`preview` are deliberately not forwarded: the widget's job is to show
  // the truth of its data, and hiding a disconnected state in the editor is what makes the runtime a surprise.
  const shared = renderKickWidget(element)
  if (shared !== undefined) return <>{shared}</>
  switch (element.type) {
    // CP23: text is painted entirely by the shared typography builders, so the editor canvas and the OBS runtime
    // cannot disagree about family, weight, size, leading, tracking, direction, shadow, stroke or wrapping.
    case 'text': return (
      <div
        className={`text-element ${isFontMissing(p.fontFamily) ? 'font-missing' : ''}`}
        dir={text(element, 'direction', 'auto') as 'ltr' | 'rtl' | 'auto'}
        style={{ ...typographyStyle(p), ...textBoxStyle(p) }}
        data-font={readTypography(p).fontFamily}
      >
        {/* dir sits on the painted run as well as the box: bidi resolution must follow the text, and tests read it there. */}
        <span className="text-element-run" dir={text(element, 'direction', 'auto') as 'ltr' | 'rtl' | 'auto'}>{text(element, 'text', 'Text')}</span>
      </div>
    )
    case 'image': return text(element, 'src')
      ? <img className="image-element" draggable={false} src={text(element, 'src')} alt={text(element, 'alt')} style={{ objectFit: text(element, 'fit', 'contain') as 'contain' | 'cover' | 'fill' }} />
      : runtime ? null : <div className="empty-image"><ImageIcon /><span>Upload an image in Properties</span></div>
    case 'webcam': return <WebcamElement element={element} runtime={runtime} preview={preview} />
    case 'capture': {
      // No browser API can read a game window, so in OBS this element is a layout guide only: transparent
      // interior, optional border, and no label that could read as a captured picture.
      const shape = text(element, 'shape') === 'circle' ? '50%' : num(element, 'borderRadius', 24)
      return <div className="placeholder-element capture-placeholder" style={{ borderRadius: shape, background: runtime ? 'transparent' : colorWithOpacity(text(element, 'fillColor', '#0b0610'), num(element, 'fillOpacity', .34)) }}>{!runtime && !preview && <><Gamepad2 /><span>{text(element, 'label')}</span><small>Layout guide only · add your game source in OBS</small></>}{preview && <><Gamepad2 /><span>{text(element, 'label')}</span><small>Transparent guide · capture your game window in OBS, not here</small></>}</div>
    }
    case 'chat': return <ChatWidget element={element} runtime={runtime} preview={preview} />
    case 'alert': return <LiveAlert element={element} runtime={runtime} />
    case 'goal': {
      if (runtime && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
      const target = Math.max(1, num(element, 'target', 1000)); const current = Math.max(0, num(element, 'current', 0)); const progress = Math.min(100, current / target * 100)
      return <Shell element={shellElement(element, 'textColor', '#fff8e7')} className="goal-widget"><div className="goal-copy"><strong>{text(element, 'title')}</strong><span>{text(element, 'currency', '€')}{current} / {text(element, 'currency', '€')}{target}</span></div><div className="goal-track" style={{ background: text(element, 'trackColor', '#2b1238') }}><div className="animated-progress" style={{ width: `${progress}%`, background: text(element, 'fillColor', '#d8ad55') }} /></div>{!runtime && <small className="data-note">MANUAL PREVIEW · NOT VERIFIED PAYMENT DATA</small>}</Shell>
    }
    case 'container': {
      // A container is a single CSS box: no children, no images, nothing to lay out per frame.
      const style = containerStyle(element.props, 1)
      return <div className="container-element" style={style as CSSProperties} />
    }
    case 'shape': return <div className="shape-element" style={{ background: colorWithOpacity(text(element, 'fillColor', '#6d28a8'), num(element, 'fillOpacity', .16)), borderColor: text(element, 'borderColor', '#d8ad55'), borderWidth: num(element, 'borderWidth', 2), borderRadius: text(element, 'shape') === 'ellipse' ? '50%' : num(element, 'borderRadius', 24) }} />
    case 'frame': return <div className="standalone-frame" />
    case 'counter': return <Shell element={element} className="metric-widget"><small>{text(element, 'label')}</small><strong key={text(element, 'value')} className="number-transition">{text(element, 'value', '0')}</strong></Shell>
    case 'countdown': return <Countdown element={element} />
    case 'viewerCount': {
      // Four states must stay distinguishable: a stale cached count is not the same as offline,
      // and an API failure must never be rendered as zero viewers.
      const status = live.viewer.status
      const known = (status === 'live' || status === 'stale') && typeof live.viewer.count === 'number'
      // "No Kick connection attached" and "the Kick API failed" are different problems with different
      // fixes; showing UNREACHABLE for an unconnected overlay sends the operator hunting a broken API.
      const connected = live.configured !== false
      // A blank text prop means "use the honest default for this state", so an empty inspector field can never
      // collapse "not connected" and "API unreachable" into one label.
      const value = known ? live.viewer.count : status === 'offline' ? (text(element, 'offlineText') || 'آفلاین') : (text(element, 'unavailableText') || (connected ? 'Unavailable' : 'Not connected'))
      const caption = !runtime ? 'LIVE WHEN CONNECTED' : !connected ? 'KICK NOT CONNECTED' : status === 'stale' ? 'CACHED · STALE' : status === 'unavailable' ? 'KICK API UNREACHABLE' : status === 'offline' ? 'OFFLINE' : 'LIVE'
      // Surface props (background, border, radius, shadow, padding, font) come from the shared Shell, exactly as
      // the CP24 widgets do; only the live states and geometry below are specific to this widget.
      return <Shell element={element} className={`metric-widget live-metric viewer-${status}`}><Eye /><small>{text(element, 'label', 'بیننده زنده')}</small><strong key={String(live.viewer.count)} className="number-transition">{value}</strong><em>{caption}</em></Shell>
    }
    case 'sessionFollowers': return <Shell element={element} className="metric-widget live-metric"><UserPlus /><small>{text(element, 'label')}</small><strong key={live.sessionFollowerCount} className="number-transition">{runtime ? live.sessionFollowerCount : num(element, 'startValue', 0)}</strong><em>{runtime ? 'follows this session' : 'follows this session · live'}</em></Shell>
    case 'latestFollower': return <Shell element={element} className="supporter-widget"><UserRound /><span><small>{text(element, 'label')}</small><strong>{live.latestFollower?.username || text(element, 'emptyText', 'No follower yet')}</strong></span><em>{live.latestFollower ? 'latest follow' : 'updates on the next real follow'}</em></Shell>
    case 'supporter': if (runtime && text(element, 'dataSource', 'none') === 'none') return null; return <Shell element={element} className="supporter-widget"><UserRound /><span><small>{text(element, 'label')}</small><strong>{text(element, 'value')}</strong></span>{!runtime && <Radio className="offline-indicator" />}</Shell>
    default: return <div>{String(p.label ?? element.name)}</div>
  }
}

export function ElementRenderer({ element, theme, runtime = false, preview = false }: ElementRendererProps) {
  const live = useLiveData()
  // These gates describe what a published source may put on air. Applying them to the editor preview
  // is what made configured elements vanish from Preview.
  if (runtime && element.type === 'chat' && !live.messages.length) return null
  if (runtime && element.type === 'supporter' && text(element, 'dataSource', 'none') === 'none') return null
  if (runtime && element.type === 'goal' && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
  const content = <ElementContent element={element} runtime={runtime} preview={preview} />
  return <DecoratedWidget element={element} theme={theme}>{content}</DecoratedWidget>
}
