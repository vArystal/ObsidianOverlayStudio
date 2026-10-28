import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Camera, Eye, Gamepad2, Image as ImageIcon, Radio, Sparkles, UserPlus, UserRound } from 'lucide-react'
import { useLiveData } from './LiveDataProvider'
import { resolveDecoration } from '../lib/themes'
import type { LiveOverlayEvent, OverlayElement, OverlayTheme } from '../types'

interface ElementRendererProps { element: OverlayElement; theme?: OverlayTheme; runtime?: boolean; testAlertNonce?: number }
const text = (element: OverlayElement, key: string, fallback = '') => String(element.props[key] ?? fallback)
const num = (element: OverlayElement, key: string, fallback = 0) => Number(element.props[key] ?? fallback)
const bool = (element: OverlayElement, key: string, fallback = false) => Boolean(element.props[key] ?? fallback)

const sampleMessages = [
  { id: 'sample-1', username: 'Roya', content: 'سلام! قاب جدید فوق‌العاده‌ست ✨', createdAt: new Date().toISOString(), color: '#f1d89a', avatar: 'ر' },
  { id: 'sample-2', username: 'ArashGG', content: 'برای راند بعدی آماده‌ایم!', createdAt: new Date().toISOString(), color: '#67e8f9', avatar: 'A' },
  { id: 'sample-3', username: 'NovaSky', content: 'That Persian frame is so clean.', createdAt: new Date().toISOString(), color: '#c4b5fd', avatar: 'N' },
]

function colorWithOpacity(hex: string, opacity: number) {
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
  return (
    <div className={`decorated-widget pattern-${decoration.pattern} ${decoration.innerBorder ? 'has-inner-border' : ''} ${decoration.shadow ? 'has-frame-shadow' : ''} ${decoration.glow ? 'has-frame-glow' : ''} ${decoration.highlight ? 'has-highlight' : ''}`} style={style}>
      {decoration.cornerOrnaments && <><i className="persian-corner corner-tl" /><i className="persian-corner corner-tr" /><i className="persian-corner corner-bl" /><i className="persian-corner corner-br" /></>}
      {decoration.separator && <span className="ornamental-separator"><b /><i /> <b /></span>}
      <div className="decorated-content" dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: text(element, 'fontFamily') || undefined, fontSize: element.props.fontSize ? num(element, 'fontSize') : undefined, textAlign: (text(element, 'contentAlign') || undefined) as CSSProperties['textAlign'] }}>{children}</div>
    </div>
  )
}

function ChatWidget({ element, runtime }: { element: OverlayElement; runtime: boolean }) {
  const live = useLiveData()
  const [clock, setClock] = useState(Date.now())
  const duration = Math.max(3, num(element, 'messageDuration', 28)) * 1000
  useEffect(() => { if (!runtime) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [runtime])
  const max = Math.max(1, Math.min(20, num(element, 'maxMessages', 7)))
  const messages = runtime
    ? live.messages.filter((message) => clock - Date.parse(message.createdAt) < duration).slice(-max).map((message) => ({ ...message, color: message.usernameColor || '#f1d89a', avatar: message.avatar, exiting: clock - Date.parse(message.createdAt) > duration - 700 }))
    : sampleMessages.slice(0, max)
  if (runtime && !messages.length) return null
  return (
    <div className="chat-widget premium-chat" dir={text(element, 'direction', 'auto') as 'auto' | 'ltr' | 'rtl'} style={{ fontFamily: text(element, 'fontFamily', 'Vazirmatn, Tahoma, sans-serif'), fontSize: num(element, 'fontSize', 20), color: text(element, 'textColor', '#fff8e7'), gap: num(element, 'messageSpacing', 14) }}>
      {!runtime && <div className="preview-chip">نمونه نمایشی · SAMPLE ONLY</div>}
      {messages.map((message, index) => (
        <div className={`chat-message live-message entrance-${text(element, 'entrance', 'ornamental')} ${'exiting' in message && message.exiting ? `message-exit-${text(element, 'exit', 'fade')}` : ''}`} key={message.id} style={{ animationDelay: `${index * 60}ms` }}>
          {bool(element, 'showAvatars', true) && <span className="chat-avatar" style={{ background: message.color }}>{typeof message.avatar === 'string' && message.avatar.length < 3 ? message.avatar : message.username[0]}</span>}
          <span className="chat-copy">
            <span className="chat-meta">{bool(element, 'showUsernames', true) && <strong style={{ color: message.color }}>{message.username}</strong>}{'test' in message && message.test && <small className="test-event-mark">TEST</small>}</span>
            <span>{message.content}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Countdown({ element }: { element: OverlayElement }) {
  const initial = Math.max(0, Math.round(num(element, 'minutes', 10) * 60)); const [remaining, setRemaining] = useState(initial)
  useEffect(() => { setRemaining(initial); const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [initial])
  const formatted = useMemo(() => `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`, [remaining])
  return <div className="metric-widget countdown-widget" style={{ color: text(element, 'color', '#fff8e7') }}><small>{text(element, 'label', 'شروع استریم تا')}</small><strong>{formatted}</strong></div>
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

function LiveAlert({ element, runtime, nonce }: { element: OverlayElement; runtime: boolean; nonce: number }) {
  const live = useLiveData(); const [cursor, setCursor] = useState(0); const [phase, setPhase] = useState<'enter' | 'exit'>('enter'); const played = useRef('')
  const event = runtime ? live.alerts[cursor] ?? null : null
  useEffect(() => {
    if (!runtime || !event) return
    setPhase('enter')
    const exitTimer = window.setTimeout(() => setPhase('exit'), element.animation.holdDuration)
    const nextTimer = window.setTimeout(() => setCursor((value) => value + 1), element.animation.holdDuration + element.animation.exitDuration)
    if (bool(element, 'soundEnabled') && element.props.soundSrc && played.current !== event.id) { played.current = event.id; void new Audio(String(element.props.soundSrc)).play().catch(() => undefined) }
    return () => { clearTimeout(exitTimer); clearTimeout(nextTimer) }
  }, [event?.id, runtime, element.animation.holdDuration, element.animation.exitDuration, element.props.soundSrc])
  if (runtime && !event) return null
  const copy = alertCopy(event, element)
  return (
    <div key={runtime ? event?.id : nonce} className={`alert-widget alert-phase-${phase} ${phase === 'exit' ? `element-exit-${element.animation.exit}` : ''}`} style={{ color: text(element, 'textColor', '#fff8e7'), animationDuration: `${phase === 'exit' ? element.animation.exitDuration : element.animation.duration}ms` }}>
      <div className="alert-art" style={{ color: text(element, 'accentColor', '#d8ad55') }}>{text(element, 'imageSrc') ? <img src={text(element, 'imageSrc')} alt="" /> : <Sparkles />}</div>
      <strong>{copy.title}</strong><span>{copy.message}</span>
      {(!runtime || event?.test) && <small className="test-event-mark">TEST PREVIEW · NOT A REAL KICK EVENT</small>}
    </div>
  )
}

function ElementContent({ element, runtime, testAlertNonce }: { element: OverlayElement; runtime: boolean; testAlertNonce: number }) {
  const live = useLiveData(); const p = element.props
  switch (element.type) {
    case 'text': return <div className="text-element" dir={text(element, 'direction', 'auto') as 'ltr' | 'rtl' | 'auto'} style={{ fontFamily: text(element, 'fontFamily'), fontSize: num(element, 'fontSize', 52), fontWeight: num(element, 'fontWeight', 700), color: text(element, 'color', '#fff8e7'), textAlign: text(element, 'textAlign', 'right') as 'left' | 'center' | 'right', lineHeight: num(element, 'lineHeight', 1.3) }}>{text(element, 'text', 'Text')}</div>
    case 'image': return text(element, 'src') ? <img className="image-element" draggable={false} src={text(element, 'src')} alt={text(element, 'alt')} style={{ objectFit: text(element, 'fit', 'contain') as 'contain' | 'cover' | 'fill' }} /> : <div className="empty-image"><ImageIcon /><span>Upload an image in Properties</span></div>
    case 'webcam': return <div className="placeholder-element webcam-placeholder" style={{ borderRadius: text(element, 'shape') === 'circle' ? '50%' : num(element, 'borderRadius', 24), background: colorWithOpacity(text(element, 'fillColor', '#170b20'), num(element, 'fillOpacity', .2)) }}>{!runtime && <><Camera /><span>{text(element, 'label')}</span><small>OBS owns the camera source</small></>}</div>
    case 'capture': return <div className="placeholder-element capture-placeholder" style={{ background: colorWithOpacity(text(element, 'fillColor', '#0b0610'), num(element, 'fillOpacity', .34)) }}>{!runtime && <><Gamepad2 /><span>{text(element, 'label')}</span><small>Planning only · capture this source in OBS</small></>}</div>
    case 'chat': return <ChatWidget element={element} runtime={runtime} />
    case 'alert': return <LiveAlert element={element} runtime={runtime} nonce={testAlertNonce} />
    case 'goal': {
      if (runtime && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
      const target = Math.max(1, num(element, 'target', 1000)); const current = Math.max(0, num(element, 'current', 0)); const progress = Math.min(100, current / target * 100)
      return <div className="goal-widget" style={{ color: text(element, 'textColor', '#fff8e7') }}><div className="goal-copy"><strong>{text(element, 'title')}</strong><span>{text(element, 'currency', '€')}{current} / {text(element, 'currency', '€')}{target}</span></div><div className="goal-track" style={{ background: text(element, 'trackColor', '#2b1238') }}><div className="animated-progress" style={{ width: `${progress}%`, background: text(element, 'fillColor', '#d8ad55') }} /></div>{!runtime && <small className="data-note">MANUAL PREVIEW · NOT VERIFIED PAYMENT DATA</small>}</div>
    }
    case 'shape': return <div className="shape-element" style={{ background: colorWithOpacity(text(element, 'fillColor', '#6d28a8'), num(element, 'fillOpacity', .16)), borderColor: text(element, 'borderColor', '#d8ad55'), borderWidth: num(element, 'borderWidth', 2), borderRadius: text(element, 'shape') === 'ellipse' ? '50%' : num(element, 'borderRadius', 24) }} />
    case 'frame': return <div className="standalone-frame" />
    case 'counter': return <div className="metric-widget" style={{ color: text(element, 'color', '#fff8e7') }}><small>{text(element, 'label')}</small><strong key={text(element, 'value')} className="number-transition">{text(element, 'value', '0')}</strong></div>
    case 'countdown': return <Countdown element={element} />
    case 'viewerCount': return <div className="metric-widget live-metric" style={{ color: text(element, 'color', '#fff8e7') }}><Eye /><small>{text(element, 'label', 'بیننده زنده')}</small><strong key={live.viewer.count ?? 'offline'} className="number-transition">{live.viewer.status === 'live' ? live.viewer.count : text(element, 'offlineText', 'آفلاین')}</strong><em>{runtime ? live.viewer.status : 'LIVE API PREVIEW'}</em></div>
    case 'sessionFollowers': return <div className="metric-widget live-metric" style={{ color: text(element, 'color', '#fff8e7') }}><UserPlus /><small>{text(element, 'label')}</small><strong key={live.sessionFollowerCount} className="number-transition">{runtime ? live.sessionFollowerCount : num(element, 'startValue', 0)}</strong><em>events received this connection</em></div>
    case 'latestFollower': return <div className="supporter-widget" style={{ color: text(element, 'color', '#fff8e7') }}><UserRound /><span><small>{text(element, 'label')}</small><strong>{runtime ? live.latestFollower?.username || text(element, 'emptyText') : 'Roya · TEST PREVIEW'}</strong></span>{!runtime && <Radio className="offline-indicator" />}</div>
    case 'supporter': if (runtime && text(element, 'dataSource', 'none') === 'none') return null; return <div className="supporter-widget" style={{ color: text(element, 'color') }}><UserRound /><span><small>{text(element, 'label')}</small><strong>{text(element, 'value')}</strong></span>{!runtime && <Radio className="offline-indicator" />}</div>
    default: return <div>{String(p.label ?? element.name)}</div>
  }
}

export function ElementRenderer({ element, theme, runtime = false, testAlertNonce = 0 }: ElementRendererProps) {
  const live = useLiveData()
  if (runtime && element.type === 'alert' && !live.alerts.length) return null
  if (runtime && element.type === 'chat' && !live.messages.length) return null
  if (runtime && element.type === 'supporter' && text(element, 'dataSource', 'none') === 'none') return null
  if (runtime && element.type === 'goal' && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
  const content = <ElementContent element={element} runtime={runtime} testAlertNonce={testAlertNonce} />
  return <DecoratedWidget element={element} theme={theme}>{content}</DecoratedWidget>
}
