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
  SquareDashed,
  TextCursorInput,
  Trash2,
  Unlock,
  Upload,
  UserRound,
} from 'lucide-react'
import type { ElementType, OverlayElement } from '../../types'
import { WIDGETS, WIDGET_GROUPS, availabilityLabel, searchWidgets } from '../../lib/widgets'
import type { WidgetIcon } from '../../lib/widgets'

/**
 * CP24: the palette is generated from the widget registry, so a widget can never be addable here but missing an
 * inspector section (or vice versa). Icons are the only thing kept in this file, because they are presentation.
 */
const ICONS: Record<WidgetIcon, typeof TextCursorInput> = {
  text: TextCursorInput, image: Image, shape: Shapes, container: SquareDashed, frame: Frame, capture: Gamepad2,
  webcam: Camera, chat: MessageSquare, alert: BellRing, goal: CircleDollarSign, counter: AlignJustify,
  countdown: Clock3, viewer: RadioTower, followers: UserPlus, follower: UserRound, supporter: UserRound,
  title: TextCursorInput, status: RadioTower, category: Gamepad2, duration: Clock3, subscribers: UserPlus,
  activity: AlignJustify, clock: Clock3, links: UserRound,
}

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
  const [query, setQuery] = useState('')
  const results = searchWidgets(query)
  const tabs = ['elements', 'layers', 'assets'] as const
  const handleTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const at = tabs.indexOf(tab)
    const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }
  const uploadRef = useRef<HTMLInputElement>(null)
  const backgroundRef = useRef<HTMLInputElement>(null)
  const assetElements = props.elements.filter((element) => element.type === 'image' && element.props.src)

  return (
    <aside className="editor-panel left-panel">
      <div className="panel-tabs" role="tablist" aria-label="Editor panels" onKeyDown={handleTabKey}>
        <button role="tab" id="tab-elements" aria-selected={tab === 'elements'} aria-controls="panel-elements" tabIndex={tab === 'elements' ? 0 : -1} className={tab === 'elements' ? 'active' : ''} onClick={() => setTab('elements')}><Plus /> Elements</button>
        <button role="tab" id="tab-layers" aria-selected={tab === 'layers'} aria-controls="panel-layers" tabIndex={tab === 'layers' ? 0 : -1} className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><Layers3 /> Layers <span aria-label={`${props.elements.length} layers`}>{props.elements.length}</span></button>
        <button role="tab" id="tab-assets" aria-selected={tab === 'assets'} aria-controls="panel-assets" tabIndex={tab === 'assets' ? 0 : -1} className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}><ImagePlus /> Assets</button>
      </div>

      {tab === 'elements' && (
        <div className="panel-scroll element-library" role="tabpanel" id="panel-elements" aria-labelledby="tab-elements">
          <div className="panel-heading"><div><h2>Add element</h2><p>{WIDGETS.length} widgets · nothing is added until you choose one.</p></div></div>
          <div className="library-search">
            <label htmlFor="widget-search" className="sr-only">Search widgets</label>
            <input id="widget-search" type="search" value={query} placeholder="Search widgets, groups or types" onChange={(event) => setQuery(event.target.value)} />
          </div>
          {WIDGET_GROUPS.map((group) => {
            const items = results.filter((widget) => widget.group === group)
            if (!items.length) return null
            return (
              <section key={group}>
                <h3>{group}</h3>
                <div className="element-list">
                  {items.map((widget) => {
                    const Icon = ICONS[widget.icon] ?? TextCursorInput
                    return (
                      <button key={widget.type} onClick={() => props.onAdd(widget.type)} data-widget-type={widget.type}>
                        <span className="element-icon"><Icon /></span>
                        <span>
                          <strong>{widget.label}</strong>
                          <small>{widget.blurb}</small>
                          {widget.availability !== 'available' && <em className={`widget-badge badge-${widget.availability}`}>{availabilityLabel(widget)}</em>}
                        </span>
                        <Plus className="add-icon" />
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {!results.length && <div className="panel-empty"><strong>No widget matches “{query}”</strong><span>Try “chat”, “goal” or “clock”.</span></div>}
        </div>
      )}

      {tab === 'layers' && (
        <div className="panel-scroll layers-panel" role="tabpanel" id="panel-layers" aria-labelledby="tab-layers">
          <div className="panel-heading"><div><h2>Layers</h2><p>Top items render in front.</p></div></div>
          {!props.elements.length && <div className="panel-empty"><Layers3 /><strong>No layers yet</strong><span>Add an element to begin.</span></div>}
          <div className="layers-list">
            {[...props.elements].reverse().map((element, reverseIndex) => {
              const actualIndex = props.elements.length - 1 - reverseIndex
              return (
                <div
                  key={element.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={props.selectedId === element.id}
                  aria-label={`${element.name} layer`}
                  className={`layer-row ${props.selectedId === element.id ? 'selected' : ''} ${!element.visible ? 'muted' : ''}`}
                  onClick={() => props.onSelect(element.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(element.id) }
                  }}
                  onDoubleClick={() => props.onRename(element.id)}
                >
                  <MousePointer2 className="drag-dots" />
                  <span className="layer-copy"><strong>{element.name}</strong><small>{element.type}{!element.includeInOutput ? ' · editor only' : ''}</small></span>
                  <span className="layer-actions">
                    <button type="button" aria-label="Toggle layer visibility" onClick={(event) => { event.stopPropagation(); props.onToggleVisible(element.id) }}>{element.visible ? <Eye /> : <EyeOff />}</button>
                    <button type="button" aria-label="Toggle layer lock" onClick={(event) => { event.stopPropagation(); props.onToggleLock(element.id) }}>{element.locked ? <Lock /> : <Unlock />}</button>
                  </span>
                  {props.selectedId === element.id && (
                    <span className="layer-expanded-actions">
                      <button type="button" aria-label="Move layer forward" title="Move forward" className={actualIndex === props.elements.length - 1 ? 'disabled' : ''} onClick={(event) => { event.stopPropagation(); props.onMoveLayer(element.id, 'up') }}><ChevronUp /></button>
                      <button type="button" aria-label="Move layer backward" title="Move backward" className={actualIndex === 0 ? 'disabled' : ''} onClick={(event) => { event.stopPropagation(); props.onMoveLayer(element.id, 'down') }}><ChevronDown /></button>
                      <button type="button" aria-label="Duplicate layer" title="Duplicate" onClick={(event) => { event.stopPropagation(); props.onDuplicate(element.id) }}><Copy /></button>
                      <button type="button" aria-label="Delete layer" title="Delete" className="danger" onClick={(event) => { event.stopPropagation(); props.onDelete(element.id) }}><Trash2 /></button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="panel-scroll assets-panel" role="tabpanel" id="panel-assets" aria-labelledby="tab-assets">
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
