import { useRef, useState } from 'react'
import {
  AlignJustify,
  BellRing,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Frame,
  RadioTower,
  UserPlus,
  Gamepad2,
  Image,
  ImagePlus,
  Layers3,
  Lock,
  MessageSquare,
  MousePointer2,
  Plus,
  Shapes,
  TextCursorInput,
  Trash2,
  Unlock,
  Upload,
  UserRound,
} from 'lucide-react'
import type { ElementType, OverlayElement } from '../../types'

const library: Array<{ type: ElementType; icon: typeof TextCursorInput; title: string; description: string; group: string }> = [
  { type: 'text', icon: TextCursorInput, title: 'Text', description: 'Custom RTL or LTR copy', group: 'Content' },
  { type: 'image', icon: Image, title: 'Image / Logo', description: 'PNG, JPEG or WebP', group: 'Content' },
  { type: 'shape', icon: Shapes, title: 'Shape / Border', description: 'Decorative visual layer', group: 'Content' },
  { type: 'frame', icon: Frame, title: 'Persian ornamental frame', description: 'Independent girih border layer', group: 'Content' },
  { type: 'capture', icon: Gamepad2, title: 'Game capture plan', description: 'Layout guide — not a capture', group: 'Planning' },
  { type: 'webcam', icon: Camera, title: 'Webcam frame', description: 'Frame or planning guide', group: 'Planning' },
  { type: 'chat', icon: MessageSquare, title: 'Chat box', description: 'Preview-ready integration slot', group: 'Widgets' },
  { type: 'alert', icon: BellRing, title: 'Alert box', description: 'Testable event surface', group: 'Widgets' },
  { type: 'goal', icon: CircleDollarSign, title: 'Donation goal', description: 'Preview data only', group: 'Widgets' },
  { type: 'counter', icon: AlignJustify, title: 'Custom counter', description: 'Manual numeric metric', group: 'Widgets' },
  { type: 'countdown', icon: Clock3, title: 'Countdown', description: 'Local countdown timer', group: 'Widgets' },
  { type: 'viewerCount', icon: RadioTower, title: 'Live viewer count', description: 'Official Kick livestream metric', group: 'Live Kick' },
  { type: 'sessionFollowers', icon: UserPlus, title: 'Session follows', description: 'Real follow events received now', group: 'Live Kick' },
  { type: 'latestFollower', icon: UserRound, title: 'Latest Kick follower', description: 'Official channel.followed event', group: 'Live Kick' },
  { type: 'supporter', icon: UserRound, title: 'Latest supporter', description: 'Donation adapter slot', group: 'Widgets' },
]

interface ElementsPanelProps {
  elements: OverlayElement[]
  selectedId: string | null
  onAdd: (type: ElementType) => void
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onRename: (id: string) => void
  onMoveLayer: (id: string, direction: 'up' | 'down') => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onUploadAsset: (file: File) => void
  onUploadBackground: (file: File) => void
}

type Tab = 'elements' | 'layers' | 'assets'

export function ElementsPanel(props: ElementsPanelProps) {
  const [tab, setTab] = useState<Tab>('elements')
  const uploadRef = useRef<HTMLInputElement>(null)
  const backgroundRef = useRef<HTMLInputElement>(null)
  const assetElements = props.elements.filter((element) => element.type === 'image' && element.props.src)

  return (
    <aside className="editor-panel left-panel">
      <div className="panel-tabs" role="tablist">
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}><Plus /> Elements</button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><Layers3 /> Layers <span>{props.elements.length}</span></button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}><ImagePlus /> Assets</button>
      </div>

      {tab === 'elements' && (
        <div className="panel-scroll element-library">
          <div className="panel-heading"><div><h2>Add element</h2><p>Nothing is added until you choose it.</p></div></div>
          {['Content', 'Planning', 'Live Kick', 'Widgets'].map((group) => (
            <section key={group}>
              <h3>{group}</h3>
              <div className="element-list">
                {library.filter((item) => item.group === group).map((item) => (
                  <button key={item.type} onClick={() => props.onAdd(item.type)}>
                    <span className="element-icon"><item.icon /></span>
                    <span><strong>{item.title}</strong><small>{item.description}</small></span>
                    <Plus className="add-icon" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'layers' && (
        <div className="panel-scroll layers-panel">
          <div className="panel-heading"><div><h2>Layers</h2><p>Top items render in front.</p></div></div>
          {!props.elements.length && <div className="panel-empty"><Layers3 /><strong>No layers yet</strong><span>Add an element to begin.</span></div>}
          <div className="layers-list">
            {[...props.elements].reverse().map((element, reverseIndex) => {
              const actualIndex = props.elements.length - 1 - reverseIndex
              return (
                <button
                  key={element.id}
                  className={`layer-row ${props.selectedId === element.id ? 'selected' : ''} ${!element.visible ? 'muted' : ''}`}
                  onClick={() => props.onSelect(element.id)}
                  onDoubleClick={() => props.onRename(element.id)}
                >
                  <MousePointer2 className="drag-dots" />
                  <span className="layer-copy"><strong>{element.name}</strong><small>{element.type}{!element.includeInOutput ? ' · editor only' : ''}</small></span>
                  <span className="layer-actions">
                    <span role="button" aria-label="Toggle layer visibility" onClick={(event) => { event.stopPropagation(); props.onToggleVisible(element.id) }}>{element.visible ? <Eye /> : <EyeOff />}</span>
                    <span role="button" aria-label="Toggle layer lock" onClick={(event) => { event.stopPropagation(); props.onToggleLock(element.id) }}>{element.locked ? <Lock /> : <Unlock />}</span>
                  </span>
                  {props.selectedId === element.id && (
                    <span className="layer-expanded-actions">
                      <span role="button" title="Move forward" className={actualIndex === props.elements.length - 1 ? 'disabled' : ''} onClick={(event) => { event.stopPropagation(); props.onMoveLayer(element.id, 'up') }}><ChevronUp /></span>
                      <span role="button" title="Move backward" className={actualIndex === 0 ? 'disabled' : ''} onClick={(event) => { event.stopPropagation(); props.onMoveLayer(element.id, 'down') }}><ChevronDown /></span>
                      <span role="button" title="Duplicate" onClick={(event) => { event.stopPropagation(); props.onDuplicate(element.id) }}><Copy /></span>
                      <span role="button" title="Delete" className="danger" onClick={(event) => { event.stopPropagation(); props.onDelete(element.id) }}><Trash2 /></span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="panel-scroll assets-panel">
          <div className="panel-heading"><div><h2>Assets</h2><p>Stored inside this browser.</p></div></div>
          <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && props.onUploadAsset(event.target.files[0])} />
          <input ref={backgroundRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && props.onUploadBackground(event.target.files[0])} />
          <button className="asset-drop" onClick={() => uploadRef.current?.click()}><Upload /><strong>Upload overlay image</strong><span>PNG, JPEG or WebP · max 2 MB</span></button>
          <button className="secondary-button full" onClick={() => backgroundRef.current?.click()}><ImagePlus /> Set planning background</button>
          <div className="asset-grid">
            {assetElements.map((element) => <button key={element.id} onClick={() => props.onSelect(element.id)}><img src={String(element.props.src)} alt={element.name} /><span>{element.name}</span></button>)}
          </div>
          {!assetElements.length && <div className="subtle-empty">Uploaded assets will appear here.</div>}
          <div className="limit-note"><strong>Storage note</strong>Embedded images count toward browser storage and snapshot URL size. Use a hosted asset service for production-scale media.</div>
        </div>
      )}
    </aside>
  )
}
