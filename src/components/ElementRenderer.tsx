import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Camera, Eye, Gamepad2, Image as ImageIcon, Radio, Sparkles, UserPlus, UserRound } from 'lucide-react'
import { useLiveData } from './LiveDataProvider'
import { resolveDecoration } from '../lib/themes'
import { ThornRoseSprig } from './ThornRoseSprig'
import type { LiveOverlayEvent, OverlayElement, OverlayTheme } from '../types'

interface ElementRendererProps {
  element: OverlayElement
  theme?: OverlayTheme
  /** Published output: live data or nothing, never placeholders. */
  runtime?: boolean
  /** Editor preview: every configured element, clean of editor chrome, no fabricated live data. */
  preview?: boolean
  testAlertNonce?: number
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
  // Thorn & Rose swaps the geometric corner runners for its own botanical edge art.
  const thorn = theme?.id === 'thorn-rose'
  return (
    <div className={`decorated-widget pattern-${decoration.pattern} ${decoration.innerBorder ? 'has-inner-border' : ''} ${decoration.shadow ? 'has-frame-shadow' : ''} ${decoration.glow ? 'has-frame-glow' : ''} ${decoration.highlight ? 'has-highlight' : ''} ${thorn ? 'thorn-framed' : ''}`} style={style}>
      {thorn && <><ThornRoseSprig className="sprig-a" /><ThornRoseSprig className="sprig-b" /><ThornRoseSprig className="sprig-c" /></>}
      {decoration.cornerOrnaments && !thorn && <><i className="persian-corner corner-tl" /><i className="persian-corner corner-tr" /><i className="persian-corner corner-bl" /><i className="persian-corner corner-br" /></>}
      {decoration.separator && <span className="ornamental-separator"><b /><i /> <b /></span>}
      <div className="decorated-content" dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: text(element, 'fontFamily') || undefined, fontSize: element.props.fontSize ? num(element, 'fontSize') : undefined, textAlign: (text(element, 'contentAlign') || undefined) as CSSProperties['textAlign'] }}>{children}</div>
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
    <div className={`chat-widget premium-chat ${bool(element, 'scrolling', true) ? 'chat-scroll' : 'chat-stack'}`} dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: text(element, 'fontFamily', 'Vazirmatn, Tahoma, sans-serif'), fontSize: num(element, 'fontSize', 20), color: text(element, 'textColor', '#fff8e7'), gap: num(element, 'messageSpacing', 14) }}>
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
  return <div className={`metric-widget countdown-widget ${remaining === 0 ? 'countdown-done' : ''}`} style={{ color: text(element, 'color', '#fff8e7') }}><small>{text(element, 'label', 'شروع استریم تا')}</small><strong>{formatted}</strong></div>
}

/** Wall-clock for a chat line. Invalid or missing timestamps render nothing rather than a fake time. */
function messageTime(createdAt: string | undefined) {
  if (!createdAt) return ''
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function alertCopy(event: LiveOverlayEvent | null, element: OverlayElement) {
  if (!event) return { title: text(element, 'title', 'رویداد جدید'), message: text(element, 'message', '') }
  const data = event.data as Record<string, any>
  if (event.type === 'channel.followed') return { title: 'دنبال‌کننده جدید', message: `${data.follower?.username || 'Someone'} به جمع ما پیوست` }
  if (event.type === 'channel.subscription.new') return { title: 'اشتراک جدید', message: `${data.subscriber?.username || 'Someone'} مشترک شد` }
  if (event.type === 'channel.subscription.renewal') return { title: 'تمدید اشتراک', message: `${data.subscriber?.username || 'Someone'} اشتراک خود را تمدید کرد` }
  if (event.type === 'channel.subscription.gifts') return { title: 'هدیه اشتراک', message: `${data.gifter?.username || 'Anonymous'} اشتراک هدیه داد` }
  if (event.type === 'kicks.gifted') return { title: 'KICKs هدیه', message: `${data.sender?.username || 'Someone'} · ${data.gift?.amount ?? ''} ${data.gift?.name ?? ''}` }
  return { title: text(element, 'title'), message: text(element, 'message') }
}

function LiveAlert({ element, runtime, preview, nonce }: { element: OverlayElement; runtime: boolean; preview: boolean; nonce: number }) {
  const live = useLiveData(); const [phase, setPhase] = useState<'enter' | 'exit'>('enter'); const played = useRef('')
  // The shared history keeps only the last 20 alerts, so an index cursor could point past the end and the
  // widget would never render again. This local queue holds what has not been played yet and is drained
  // by identity, which survives history trimming and reconnects.
  const [queue, setQueue] = useState<LiveOverlayEvent[]>([])
  const known = useRef(new Set<string>())
  useEffect(() => {
    if (!runtime) return
    setQueue((pending) => {
      const additions = live.alerts.filter((alert) => !known.current.has(alert.id))
      if (!additions.length) return pending
      additions.forEach((alert) => known.current.add(alert.id))
      // Bursts should not build an unbounded backlog behind a 3s alert; the newest few are enough.
      return [...pending, ...additions].slice(-6)
    })
  }, [live.alerts, runtime])
  const event = runtime ? queue[0] ?? null : null
  useEffect(() => {
    if (!runtime || !event) return
    setPhase('enter')
    const exitTimer = window.setTimeout(() => setPhase('exit'), element.animation.holdDuration)
    const nextTimer = window.setTimeout(() => setQueue((pending) => pending.slice(1)), element.animation.holdDuration + element.animation.exitDuration)
    if (bool(element, 'soundEnabled') && element.props.soundSrc && played.current !== event.id) { played.current = event.id; void new Audio(String(element.props.soundSrc)).play().catch(() => undefined) }
    return () => { clearTimeout(exitTimer); clearTimeout(nextTimer) }
  }, [event?.id, runtime, element.animation.holdDuration, element.animation.exitDuration, element.props.soundSrc])
  if (runtime && !event) return null
  const copy = alertCopy(event, element)
  return (
    <div key={runtime ? event?.id : nonce} className={`alert-widget alert-phase-${phase} ${phase === 'exit' ? `element-exit-${element.animation.exit}` : ''}`} style={{ color: text(element, 'textColor', '#fff8e7'), animationDuration: `${phase === 'exit' ? element.animation.exitDuration : element.animation.duration}ms` }}>
      <div className="alert-art" style={{ color: text(element, 'accentColor', '#d8ad55') }}>{text(element, 'imageSrc') ? <img src={text(element, 'imageSrc')} alt="" /> : <Sparkles />}</div>
      <strong>{copy.title}</strong><span>{copy.message}</span>
      {/* The alert's configured title/message is a design state, not a claim that an event happened. */}
      {!runtime && !preview && <small className="data-note">SHOWS YOUR ALERT TEXT · FILLS IN WHEN A REAL EVENT ARRIVES</small>}
      {runtime && event?.test && live.testMode && <small className="test-event-mark">TEST EVENT · NOT A KICK DELIVERY</small>}
    </div>
  )
}

function ElementContent({ element, runtime, preview, testAlertNonce }: { element: OverlayElement; runtime: boolean; preview: boolean; testAlertNonce: number }) {
  const live = useLiveData(); const p = element.props
  switch (element.type) {
    case 'text': return <div className="text-element" dir={text(element, 'direction', 'auto') as 'ltr' | 'rtl' | 'auto'} style={{ fontFamily: text(element, 'fontFamily'), fontSize: num(element, 'fontSize', 52), fontWeight: num(element, 'fontWeight', 700), color: text(element, 'color', '#fff8e7'), textAlign: text(element, 'textAlign', 'right') as 'left' | 'center' | 'right', lineHeight: num(element, 'lineHeight', 1.3) }}>{text(element, 'text', 'Text')}</div>
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
    case 'alert': return <LiveAlert element={element} runtime={runtime} preview={preview} nonce={testAlertNonce} />
    case 'goal': {
      if (runtime && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
      const target = Math.max(1, num(element, 'target', 1000)); const current = Math.max(0, num(element, 'current', 0)); const progress = Math.min(100, current / target * 100)
      return <div className="goal-widget" style={{ color: text(element, 'textColor', '#fff8e7') }}><div className="goal-copy"><strong>{text(element, 'title')}</strong><span>{text(element, 'currency', '€')}{current} / {text(element, 'currency', '€')}{target}</span></div><div className="goal-track" style={{ background: text(element, 'trackColor', '#2b1238') }}><div className="animated-progress" style={{ width: `${progress}%`, background: text(element, 'fillColor', '#d8ad55') }} /></div>{!runtime && <small className="data-note">MANUAL PREVIEW · NOT VERIFIED PAYMENT DATA</small>}</div>
    }
    case 'shape': return <div className="shape-element" style={{ background: colorWithOpacity(text(element, 'fillColor', '#6d28a8'), num(element, 'fillOpacity', .16)), borderColor: text(element, 'borderColor', '#d8ad55'), borderWidth: num(element, 'borderWidth', 2), borderRadius: text(element, 'shape') === 'ellipse' ? '50%' : num(element, 'borderRadius', 24) }} />
    case 'frame': return <div className="standalone-frame" />
    case 'counter': return <div className="metric-widget" style={{ color: text(element, 'color', '#fff8e7') }}><small>{text(element, 'label')}</small><strong key={text(element, 'value')} className="number-transition">{text(element, 'value', '0')}</strong></div>
    case 'countdown': return <Countdown element={element} />
    case 'viewerCount': {
      // Four states must stay distinguishable: a stale cached count is not the same as offline,
      // and an API failure must never be rendered as zero viewers.
      const status = live.viewer.status
      const known = (status === 'live' || status === 'stale') && typeof live.viewer.count === 'number'
      // "No Kick connection attached" and "the Kick API failed" are different problems with different
      // fixes; showing UNREACHABLE for an unconnected overlay sends the operator hunting a broken API.
      const connected = live.configured !== false
      const value = known ? live.viewer.count : status === 'offline' ? text(element, 'offlineText', 'آفلاین') : text(element, 'unavailableText', connected ? 'Unavailable' : 'Not connected')
      const caption = !runtime ? 'LIVE WHEN CONNECTED' : !connected ? 'KICK NOT CONNECTED' : status === 'stale' ? 'CACHED · STALE' : status === 'unavailable' ? 'KICK API UNREACHABLE' : status === 'offline' ? 'OFFLINE' : 'LIVE'
      return <div className={`metric-widget live-metric viewer-${status}`} style={{ color: text(element, 'color', '#fff8e7') }}><Eye /><small>{text(element, 'label', 'بیننده زنده')}</small><strong key={String(live.viewer.count)} className="number-transition">{value}</strong><em>{caption}</em></div>
    }
    case 'sessionFollowers': return <div className="metric-widget live-metric" style={{ color: text(element, 'color', '#fff8e7') }}><UserPlus /><small>{text(element, 'label')}</small><strong key={live.sessionFollowerCount} className="number-transition">{runtime ? live.sessionFollowerCount : num(element, 'startValue', 0)}</strong><em>{runtime ? 'follows this session' : 'follows this session · live'}</em></div>
    case 'latestFollower': return <div className="supporter-widget" style={{ color: text(element, 'color', '#fff8e7') }}><UserRound /><span><small>{text(element, 'label')}</small><strong>{live.latestFollower?.username || text(element, 'emptyText', 'No follower yet')}</strong></span><em>{live.latestFollower ? 'latest follow' : 'updates on the next real follow'}</em></div>
    case 'supporter': if (runtime && text(element, 'dataSource', 'none') === 'none') return null; return <div className="supporter-widget" style={{ color: text(element, 'color') }}><UserRound /><span><small>{text(element, 'label')}</small><strong>{text(element, 'value')}</strong></span>{!runtime && <Radio className="offline-indicator" />}</div>
    default: return <div>{String(p.label ?? element.name)}</div>
  }
}

export function ElementRenderer({ element, theme, runtime = false, preview = false, testAlertNonce = 0 }: ElementRendererProps) {
  const live = useLiveData()
  // These gates describe what a published source may put on air. Applying them to the editor preview
  // is what made configured elements vanish from Preview.
  if (runtime && element.type === 'alert' && !live.alerts.length) return null
  if (runtime && element.type === 'chat' && !live.messages.length) return null
  if (runtime && element.type === 'supporter' && text(element, 'dataSource', 'none') === 'none') return null
  if (runtime && element.type === 'goal' && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
  const content = <ElementContent element={element} runtime={runtime} preview={preview} testAlertNonce={testAlertNonce} />
  return <DecoratedWidget element={element} theme={theme}>{content}</DecoratedWidget>
}
