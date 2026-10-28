import { useEffect, useMemo, useState } from 'react'
import {
  Camera,
  Gamepad2,
  Image as ImageIcon,
  MessageCircle,
  Radio,
  Sparkles,
  Timer,
  UserRound,
} from 'lucide-react'
import type { OverlayElement } from '../types'

interface ElementRendererProps {
  element: OverlayElement
  runtime?: boolean
  testAlertNonce?: number
}

const text = (element: OverlayElement, key: string, fallback = '') =>
  String(element.props[key] ?? fallback)
const num = (element: OverlayElement, key: string, fallback = 0) =>
  Number(element.props[key] ?? fallback)
const bool = (element: OverlayElement, key: string, fallback = false) =>
  Boolean(element.props[key] ?? fallback)

const sampleMessages = [
  { user: 'NovaSky', message: 'That transition is so clean!', time: '20:41', color: '#c4b5fd' },
  { user: 'PixelFox', message: 'Good luck with the next round 👏', time: '20:42', color: '#67e8f9' },
  { user: 'Roya', message: 'سلام! استریم عالیه', time: '20:43', color: '#f9a8d4' },
  { user: 'ArcadeKid', message: 'Let’s go!', time: '20:44', color: '#86efac' },
  { user: 'Mina', message: 'New layout looks amazing.', time: '20:45', color: '#fde68a' },
]

function ChatPreview({ element, runtime }: ElementRendererProps) {
  const max = Math.max(1, Math.min(10, num(element, 'maxMessages', 5)))
  const messages = runtime ? [] : sampleMessages.slice(0, max)
  if (runtime && text(element, 'dataSource', 'preview') === 'preview') return null
  return (
    <div
      className="chat-widget"
      style={{
        fontFamily: text(element, 'fontFamily', 'Inter'),
        fontSize: num(element, 'fontSize', 20),
        color: text(element, 'textColor', '#fff'),
        backgroundColor: colorWithOpacity(
          text(element, 'backgroundColor', '#0d0d13'),
          num(element, 'backgroundOpacity', 0.75),
        ),
        gap: num(element, 'messageSpacing', 14),
        borderRadius: num(element, 'borderRadius', 20),
      }}
    >
      {!runtime && <div className="preview-chip">SAMPLE CHAT · PREVIEW ONLY</div>}
      {messages.map((message, index) => (
        <div
          className={`chat-message entrance-${text(element, 'entrance', 'none')}`}
          key={message.user}
          style={{ animationDelay: `${index * 70}ms` }}
        >
          {bool(element, 'showAvatars', true) && (
            <span className="chat-avatar" style={{ background: message.color }}>
              {message.user[0]}
            </span>
          )}
          <span className="chat-copy">
            <span className="chat-meta">
              {bool(element, 'showUsernames', true) && (
                <strong style={{ color: message.color }}>{message.user}</strong>
              )}
              {bool(element, 'showTimestamps', false) && <small>{message.time}</small>}
            </span>
            <span>{message.message}</span>
          </span>
        </div>
      ))}
      {runtime && <div className="runtime-empty" />}
    </div>
  )
}

function Countdown({ element }: { element: OverlayElement }) {
  const initial = Math.max(0, Math.round(num(element, 'minutes', 10) * 60))
  const [remaining, setRemaining] = useState(initial)
  useEffect(() => {
    setRemaining(initial)
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [initial])
  const formatted = useMemo(() => {
    const hours = Math.floor(remaining / 3600)
    const mins = Math.floor((remaining % 3600) / 60)
    const secs = remaining % 60
    return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [remaining])
  return (
    <div
      className="metric-widget countdown-widget"
      style={{
        color: text(element, 'color', '#fff'),
        background: text(element, 'backgroundColor', '#111118'),
        borderColor: text(element, 'accentColor', '#8b5cf6'),
      }}
    >
      <small>{text(element, 'label', 'STREAM STARTS IN')}</small>
      <strong>{formatted}</strong>
    </div>
  )
}

function colorWithOpacity(hex: string, opacity: number) {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`
}

export function ElementRenderer({ element, runtime = false, testAlertNonce = 0 }: ElementRendererProps) {
  const p = element.props
  switch (element.type) {
    case 'text':
      return (
        <div
          className="text-element"
          dir={text(element, 'direction', 'auto') as 'ltr' | 'rtl' | 'auto'}
          style={{
            fontFamily: text(element, 'fontFamily', 'Inter'),
            fontSize: num(element, 'fontSize', 54),
            fontWeight: num(element, 'fontWeight', 700),
            color: text(element, 'color', '#fff'),
            textAlign: text(element, 'textAlign', 'left') as 'left' | 'center' | 'right',
            lineHeight: num(element, 'lineHeight', 1.15),
          }}
        >
          {text(element, 'text', 'Text')}
        </div>
      )
    case 'image':
      return text(element, 'src') ? (
        <img
          className="image-element"
          draggable={false}
          src={text(element, 'src')}
          alt={text(element, 'alt', 'Overlay asset')}
          style={{ objectFit: text(element, 'fit', 'contain') as 'contain' | 'cover' | 'fill' }}
        />
      ) : (
        <div className="empty-image"><ImageIcon /><span>Upload an image in Properties</span></div>
      )
    case 'webcam': {
      const circular = text(element, 'shape') === 'circle'
      const radius = circular ? '50%' : text(element, 'shape') === 'rectangle' ? 0 : num(element, 'borderRadius', 28)
      return (
        <div
          className="placeholder-element webcam-placeholder"
          style={{
            borderColor: text(element, 'borderColor', '#8b5cf6'),
            borderWidth: num(element, 'borderWidth', 8),
            borderRadius: radius,
            background: colorWithOpacity(text(element, 'fillColor', '#15151d'), num(element, 'fillOpacity', 0.48)),
          }}
        >
          {!runtime && <><Camera /><span>{text(element, 'label')}</span><small>OBS owns the camera source</small></>}
        </div>
      )
    }
    case 'capture':
      return (
        <div
          className="placeholder-element capture-placeholder"
          style={{
            borderColor: text(element, 'borderColor', '#64748b'),
            borderWidth: num(element, 'borderWidth', 3),
            background: colorWithOpacity(text(element, 'fillColor', '#0b0b10'), num(element, 'fillOpacity', 0.72)),
          }}
        >
          {!runtime && <><Gamepad2 /><span>{text(element, 'label')}</span><small>Planning guide only · capture the source in OBS</small></>}
        </div>
      )
    case 'chat':
      return <ChatPreview element={element} runtime={runtime} />
    case 'alert':
      if (runtime && text(element, 'provider', 'none') === 'none') return null
      return (
        <div
          key={testAlertNonce}
          className={`alert-widget ${testAlertNonce ? `element-anim-${element.animation.type}` : ''}`}
          style={{
            color: text(element, 'textColor', '#fff'),
            background: text(element, 'backgroundColor', '#111118'),
            borderColor: text(element, 'accentColor', '#a78bfa'),
            animationDuration: `${element.animation.duration}ms`,
          }}
        >
          <div className="alert-art" style={{ color: text(element, 'accentColor', '#a78bfa') }}>
            {text(element, 'imageSrc') ? <img src={text(element, 'imageSrc')} alt="Alert" /> : <Sparkles />}
          </div>
          <strong>{text(element, 'title')}</strong>
          <span>{text(element, 'message')}</span>
          {!runtime && <small>TEST PREVIEW · NO EVENT PROVIDER</small>}
        </div>
      )
    case 'goal': {
      if (runtime && text(element, 'dataSource', 'preview') === 'preview' && !bool(element, 'includePreviewOutput')) return null
      const target = Math.max(1, num(element, 'target', 1000))
      const current = Math.max(0, num(element, 'current', 420))
      const progress = Math.min(100, (current / target) * 100)
      return (
        <div className="goal-widget" style={{ color: text(element, 'textColor', '#fff') }}>
          <div className="goal-copy"><strong>{text(element, 'title')}</strong><span>{text(element, 'currency', '€')}{current} / {text(element, 'currency', '€')}{target}</span></div>
          <div className="goal-track" style={{ background: text(element, 'trackColor'), borderRadius: num(element, 'borderRadius', 16) }}>
            <div style={{ width: `${progress}%`, background: text(element, 'fillColor'), borderRadius: 'inherit' }} />
          </div>
          {!runtime && text(element, 'dataSource') === 'preview' && <small className="data-note">SAMPLE DATA · NO PAYMENT PROVIDER</small>}
        </div>
      )
    }
    case 'shape': {
      const shape = text(element, 'shape', 'rectangle')
      return (
        <div
          className="shape-element"
          style={{
            background: colorWithOpacity(text(element, 'fillColor', '#8b5cf6'), num(element, 'fillOpacity', 0.18)),
            borderColor: text(element, 'borderColor', '#8b5cf6'),
            borderWidth: num(element, 'borderWidth', 3),
            borderRadius: shape === 'ellipse' ? '50%' : num(element, 'borderRadius', 24),
          }}
        />
      )
    }
    case 'counter':
      return (
        <div className="metric-widget" style={{ color: text(element, 'color'), background: text(element, 'backgroundColor'), borderColor: text(element, 'accentColor') }}>
          <small>{text(element, 'label', 'COUNTER')}</small><strong>{text(element, 'value', '0')}</strong>
        </div>
      )
    case 'countdown':
      return <Countdown element={element} />
    case 'supporter':
      if (runtime && text(element, 'dataSource', 'none') === 'none') return null
      return (
        <div className="supporter-widget" style={{ color: text(element, 'color'), background: text(element, 'backgroundColor'), borderColor: text(element, 'accentColor') }}>
          <UserRound /><span><small>{text(element, 'label')}</small><strong>{text(element, 'value')}</strong></span>
          {!runtime && <Radio className="offline-indicator" />}
        </div>
      )
    default:
      return <div>{String(p.label ?? element.name)}</div>
  }
}
