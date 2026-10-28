import type { ReactNode } from 'react'
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowUpToLine,
  Box,
  Copy,
  Eye,
  EyeOff,
  Info,
  Lock,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Upload,
  Zap,
} from 'lucide-react'
import type { Overlay, OverlayElement } from '../../types'

interface PropertiesPanelProps {
  overlay: Overlay
  element: OverlayElement | null
  onPatch: (patch: Partial<OverlayElement>) => void
  onProp: (key: string, value: string | number | boolean | null) => void
  onAlign: (horizontal?: 'left' | 'center' | 'right', vertical?: 'top' | 'center' | 'bottom') => void
  onLayerEdge: (edge: 'front' | 'back') => void
  onDuplicate: () => void
  onDelete: () => void
  onUpload: (file: File, target: 'image' | 'alert-image' | 'alert-sound') => void
  onTest: () => void
  onCanvasSize: (width: number, height: number) => void
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="property-section" open={open}><summary>{title}</summary><div className="property-section-body">{children}</div></details>
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="property-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function NumberInput({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return <span className="number-input"><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <i>{suffix}</i>}</span>
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <span className="color-input"><input type="color" value={value || '#000000'} onChange={(event) => onChange(event.target.value)} /><input value={value} onChange={(event) => onChange(event.target.value)} maxLength={9} /></span>
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>
}

const asString = (element: OverlayElement, key: string, fallback = '') => String(element.props[key] ?? fallback)
const asNumber = (element: OverlayElement, key: string, fallback = 0) => Number(element.props[key] ?? fallback)
const asBoolean = (element: OverlayElement, key: string, fallback = false) => Boolean(element.props[key] ?? fallback)

export function PropertiesPanel(props: PropertiesPanelProps) {
  const element = props.element
  if (!element) {
    return (
      <aside className="editor-panel right-panel">
        <div className="inspector-title"><span><SlidersHorizontal /></span><div><h2>Canvas</h2><p>No element selected</p></div></div>
        <div className="panel-scroll properties-scroll">
          <Section title="Composition size">
            <div className="two-columns">
              <Field label="Width"><NumberInput value={props.overlay.width} min={320} max={7680} onChange={(value) => props.onCanvasSize(value, props.overlay.height)} suffix="px" /></Field>
              <Field label="Height"><NumberInput value={props.overlay.height} min={240} max={4320} onChange={(value) => props.onCanvasSize(props.overlay.width, value)} suffix="px" /></Field>
            </div>
            <div className="aspect-readout">Aspect ratio <strong>{(props.overlay.width / props.overlay.height).toFixed(2)}:1</strong></div>
          </Section>
          <Section title="Output behavior">
            <div className="integration-card"><Info /><div><strong>Transparent browser source</strong><p>The published route contains no editor chrome. Planning placeholders stay out unless explicitly included.</p></div></div>
            <div className="integration-card warning"><Info /><div><strong>Local persistence</strong><p>No account or cloud backend is connected. Save data remains in this browser.</p></div></div>
          </Section>
          <div className="select-prompt"><Box /><strong>Select an element</strong><span>Click a layer or an object on the canvas to edit its properties.</span></div>
        </div>
      </aside>
    )
  }

  const prop = props.onProp
  return (
    <aside className="editor-panel right-panel">
      <div className="inspector-title">
        <span><SlidersHorizontal /></span>
        <div><h2>{element.name}</h2><p>{element.type} · {Math.round(element.width)} × {Math.round(element.height)}</p></div>
      </div>
      <div className="panel-scroll properties-scroll">
        <Section title="Layer">
          <Field label="Layer name"><input value={element.name} maxLength={60} onChange={(event) => props.onPatch({ name: event.target.value })} /></Field>
          <div className="quick-actions four">
            <button onClick={() => props.onLayerEdge('front')} title="Bring to front"><ArrowUpToLine /></button>
            <button onClick={() => props.onLayerEdge('back')} title="Send to back"><ArrowDownToLine /></button>
            <button onClick={props.onDuplicate} title="Duplicate"><Copy /></button>
            <button className="danger" onClick={props.onDelete} title="Delete"><Trash2 /></button>
          </div>
          <Toggle checked={element.visible} onChange={(visible) => props.onPatch({ visible })} label={element.visible ? 'Visible' : 'Hidden'} />
          <Toggle checked={element.locked} onChange={(locked) => props.onPatch({ locked })} label={element.locked ? 'Locked' : 'Unlocked'} description="Locked layers cannot be moved or resized." />
          <Toggle checked={element.includeInOutput} onChange={(includeInOutput) => props.onPatch({ includeInOutput })} label="Include in OBS output" description={element.type === 'capture' || element.type === 'webcam' ? 'Off by default for planning placeholders.' : 'Hidden layers are always excluded.'} />
        </Section>

        <Section title="Position & size">
          <div className="two-columns">
            <Field label="X"><NumberInput value={element.x} min={0} onChange={(x) => props.onPatch({ x })} suffix="px" /></Field>
            <Field label="Y"><NumberInput value={element.y} min={0} onChange={(y) => props.onPatch({ y })} suffix="px" /></Field>
            <Field label="Width"><NumberInput value={element.width} min={32} onChange={(width) => props.onPatch({ width })} suffix="px" /></Field>
            <Field label="Height"><NumberInput value={element.height} min={32} onChange={(height) => props.onPatch({ height })} suffix="px" /></Field>
          </div>
          <Toggle checked={element.maintainAspectRatio} onChange={(maintainAspectRatio) => props.onPatch({ maintainAspectRatio })} label="Preserve aspect ratio" />
          <Field label="Rotate"><NumberInput value={element.rotation} min={-180} max={180} onChange={(rotation) => props.onPatch({ rotation })} suffix="°" /></Field>
          <div className="align-controls">
            <span>Align to canvas</span>
            <div className="quick-actions six">
              <button onClick={() => props.onAlign('left')} title="Align left"><AlignHorizontalJustifyStart /></button>
              <button onClick={() => props.onAlign('center')} title="Center horizontally"><AlignHorizontalJustifyCenter /></button>
              <button onClick={() => props.onAlign('right')} title="Align right"><AlignHorizontalJustifyEnd /></button>
              <button onClick={() => props.onAlign(undefined, 'top')} title="Align top"><AlignVerticalJustifyStart /></button>
              <button onClick={() => props.onAlign(undefined, 'center')} title="Center vertically"><AlignVerticalJustifyCenter /></button>
              <button onClick={() => props.onAlign(undefined, 'bottom')} title="Align bottom"><AlignVerticalJustifyEnd /></button>
            </div>
          </div>
        </Section>

        {element.type === 'text' && (
          <Section title="Content & typography">
            <Field label="Text"><textarea rows={4} value={asString(element, 'text')} onChange={(event) => prop('text', event.target.value)} /></Field>
            <Field label="Font family"><select value={asString(element, 'fontFamily', 'Inter')} onChange={(event) => prop('fontFamily', event.target.value)}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Tahoma</option><option>Vazirmatn</option><option>monospace</option></select></Field>
            <div className="two-columns">
              <Field label="Font size"><NumberInput value={asNumber(element, 'fontSize', 54)} min={8} max={300} onChange={(value) => prop('fontSize', value)} suffix="px" /></Field>
              <Field label="Weight"><select value={asNumber(element, 'fontWeight', 700)} onChange={(event) => prop('fontWeight', Number(event.target.value))}><option value="300">Light</option><option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option><option value="900">Black</option></select></Field>
            </div>
            <Field label="Text color"><ColorInput value={asString(element, 'color', '#ffffff')} onChange={(value) => prop('color', value)} /></Field>
            <Field label="Direction"><select value={asString(element, 'direction', 'auto')} onChange={(event) => prop('direction', event.target.value)}><option value="auto">Auto detect</option><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></Field>
            <div className="segmented-control"><button className={asString(element, 'textAlign') === 'left' ? 'active' : ''} onClick={() => prop('textAlign', 'left')}><AlignLeft /></button><button className={asString(element, 'textAlign') === 'center' ? 'active' : ''} onClick={() => prop('textAlign', 'center')}><AlignCenter /></button><button className={asString(element, 'textAlign') === 'right' ? 'active' : ''} onClick={() => prop('textAlign', 'right')}><AlignRight /></button></div>
            <Field label="Line spacing"><NumberInput value={asNumber(element, 'lineHeight', 1.15)} min={0.7} max={3} step={0.05} onChange={(value) => prop('lineHeight', value)} /></Field>
          </Section>
        )}

        {element.type === 'image' && (
          <Section title="Image">
            <label className="upload-control"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && props.onUpload(event.target.files[0], 'image')} /><Upload /><span><strong>{asString(element, 'src') ? 'Replace image' : 'Upload image'}</strong><small>PNG, JPEG or WebP · max 2 MB</small></span></label>
            <Field label="Alternative text"><input value={asString(element, 'alt')} onChange={(event) => prop('alt', event.target.value)} /></Field>
            <Field label="Image fit"><select value={asString(element, 'fit', 'contain')} onChange={(event) => prop('fit', event.target.value)}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></Field>
          </Section>
        )}

        {element.type === 'webcam' && (
          <Section title="Webcam frame">
            <div className="integration-card"><Info /><div><strong>Frame / planning placeholder</strong><p>Your camera remains an OBS Video Capture Device. This browser layer cannot capture it.</p></div></div>
            <Field label="Frame shape"><select value={asString(element, 'shape', 'rounded')} onChange={(event) => prop('shape', event.target.value)}><option value="rectangle">Rectangle</option><option value="rounded">Rounded</option><option value="circle">Circle / ellipse</option></select></Field>
            <div className="two-columns"><Field label="Border"><NumberInput value={asNumber(element, 'borderWidth', 8)} min={0} max={48} onChange={(value) => prop('borderWidth', value)} suffix="px" /></Field><Field label="Radius"><NumberInput value={asNumber(element, 'borderRadius', 28)} min={0} max={300} onChange={(value) => prop('borderRadius', value)} suffix="px" /></Field></div>
            <Field label="Border color"><ColorInput value={asString(element, 'borderColor', '#8b5cf6')} onChange={(value) => prop('borderColor', value)} /></Field>
            <Field label="Fill color"><ColorInput value={asString(element, 'fillColor', '#15151d')} onChange={(value) => prop('fillColor', value)} /></Field>
            <Field label="Fill opacity"><NumberInput value={asNumber(element, 'fillOpacity', 0.48) * 100} min={0} max={100} onChange={(value) => prop('fillOpacity', value / 100)} suffix="%" /></Field>
          </Section>
        )}

        {element.type === 'capture' && (
          <Section title="Capture planning guide">
            <div className="integration-card warning"><Info /><div><strong>Not a capture source</strong><p>Add Game Capture, Window Capture, or Display Capture separately inside OBS.</p></div></div>
            <Field label="Guide label"><input value={asString(element, 'label')} onChange={(event) => prop('label', event.target.value)} /></Field>
            <Field label="Border color"><ColorInput value={asString(element, 'borderColor', '#64748b')} onChange={(value) => prop('borderColor', value)} /></Field>
            <Field label="Border width"><NumberInput value={asNumber(element, 'borderWidth', 3)} min={0} max={24} onChange={(value) => prop('borderWidth', value)} suffix="px" /></Field>
          </Section>
        )}

        {element.type === 'chat' && (
          <Section title="Chat box">
            <div className="integration-card warning"><Info /><div><strong>Preview feed only</strong><p>No Kick or chat provider is connected. Sample messages never appear in the published output.</p></div></div>
            <div className="two-columns"><Field label="Font size"><NumberInput value={asNumber(element, 'fontSize', 20)} min={10} max={72} onChange={(value) => prop('fontSize', value)} suffix="px" /></Field><Field label="Messages"><NumberInput value={asNumber(element, 'maxMessages', 5)} min={1} max={10} onChange={(value) => prop('maxMessages', value)} /></Field></div>
            <Field label="Font"><select value={asString(element, 'fontFamily', 'Inter')} onChange={(event) => prop('fontFamily', event.target.value)}><option>Inter</option><option>Arial</option><option>Tahoma</option><option>Vazirmatn</option><option>monospace</option></select></Field>
            <Field label="Text color"><ColorInput value={asString(element, 'textColor', '#f8fafc')} onChange={(value) => prop('textColor', value)} /></Field>
            <Field label="Background"><ColorInput value={asString(element, 'backgroundColor', '#0d0d13')} onChange={(value) => prop('backgroundColor', value)} /></Field>
            <div className="two-columns"><Field label="Background opacity"><NumberInput value={asNumber(element, 'backgroundOpacity', .76) * 100} min={0} max={100} onChange={(value) => prop('backgroundOpacity', value / 100)} suffix="%" /></Field><Field label="Spacing"><NumberInput value={asNumber(element, 'messageSpacing', 14)} min={0} max={60} onChange={(value) => prop('messageSpacing', value)} suffix="px" /></Field></div>
            <Toggle checked={asBoolean(element, 'showUsernames', true)} onChange={(value) => prop('showUsernames', value)} label="Show usernames" />
            <Toggle checked={asBoolean(element, 'showTimestamps')} onChange={(value) => prop('showTimestamps', value)} label="Show timestamps" />
            <Toggle checked={asBoolean(element, 'showAvatars', true)} onChange={(value) => prop('showAvatars', value)} label="Show avatars" />
            <Toggle checked={asBoolean(element, 'scrolling')} onChange={(value) => prop('scrolling', value)} label="Scrolling behavior" description="Overflow scroll is clipped to this widget." />
            <Field label="Message entrance"><select value={asString(element, 'entrance', 'fade')} onChange={(event) => prop('entrance', event.target.value)}><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide</option></select></Field>
          </Section>
        )}

        {element.type === 'alert' && (
          <Section title="Alert content">
            <div className="integration-card warning"><Info /><div><strong>No event provider</strong><p>Test alerts stay in the editor. Connect a secure server-side event provider for real alerts.</p></div></div>
            <Field label="Headline"><input value={asString(element, 'title')} onChange={(event) => prop('title', event.target.value)} /></Field>
            <Field label="Message"><textarea rows={3} value={asString(element, 'message')} onChange={(event) => prop('message', event.target.value)} /></Field>
            <Field label="Accent color"><ColorInput value={asString(element, 'accentColor', '#a78bfa')} onChange={(value) => prop('accentColor', value)} /></Field>
            <label className="upload-control compact-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && props.onUpload(event.target.files[0], 'alert-image')} /><Upload /><span><strong>Alert image</strong><small>{asString(element, 'imageSrc') ? 'Image loaded' : 'Optional'}</small></span></label>
            <label className="upload-control compact-upload"><input type="file" accept="audio/mpeg,audio/wav,audio/ogg" onChange={(event) => event.target.files?.[0] && props.onUpload(event.target.files[0], 'alert-sound')} /><Upload /><span><strong>Alert sound</strong><small>{asString(element, 'soundName', 'No sound selected')}</small></span></label>
            <button className="secondary-button full" onClick={props.onTest}><Zap /> Test preview alert</button>
          </Section>
        )}

        {element.type === 'goal' && (
          <Section title="Donation goal">
            <div className="integration-card warning"><Info /><div><strong>Sample data</strong><p>No payment provider is connected. Preview data is excluded from output by default.</p></div></div>
            <Field label="Title"><input value={asString(element, 'title')} onChange={(event) => prop('title', event.target.value)} /></Field>
            <div className="two-columns"><Field label="Preview current"><NumberInput value={asNumber(element, 'current', 420)} min={0} onChange={(value) => prop('current', value)} /></Field><Field label="Target"><NumberInput value={asNumber(element, 'target', 1000)} min={1} onChange={(value) => prop('target', value)} /></Field></div>
            <Field label="Currency"><input value={asString(element, 'currency', '€')} maxLength={6} onChange={(event) => prop('currency', event.target.value)} /></Field>
            <Field label="Progress color"><ColorInput value={asString(element, 'fillColor', '#8b5cf6')} onChange={(value) => prop('fillColor', value)} /></Field>
            <Field label="Track color"><ColorInput value={asString(element, 'trackColor', '#242433')} onChange={(value) => prop('trackColor', value)} /></Field>
            <Toggle checked={asBoolean(element, 'includePreviewOutput')} onChange={(value) => prop('includePreviewOutput', value)} label="Publish manual sample value" description="This is still not verified payment data." />
          </Section>
        )}

        {element.type === 'shape' && (
          <Section title="Shape appearance">
            <Field label="Shape"><select value={asString(element, 'shape', 'rectangle')} onChange={(event) => prop('shape', event.target.value)}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option></select></Field>
            <Field label="Fill color"><ColorInput value={asString(element, 'fillColor', '#8b5cf6')} onChange={(value) => prop('fillColor', value)} /></Field>
            <Field label="Fill opacity"><NumberInput value={asNumber(element, 'fillOpacity', .18) * 100} min={0} max={100} onChange={(value) => prop('fillOpacity', value / 100)} suffix="%" /></Field>
            <Field label="Border color"><ColorInput value={asString(element, 'borderColor', '#8b5cf6')} onChange={(value) => prop('borderColor', value)} /></Field>
            <div className="two-columns"><Field label="Border"><NumberInput value={asNumber(element, 'borderWidth', 3)} min={0} max={48} onChange={(value) => prop('borderWidth', value)} suffix="px" /></Field><Field label="Radius"><NumberInput value={asNumber(element, 'borderRadius', 24)} min={0} max={500} onChange={(value) => prop('borderRadius', value)} suffix="px" /></Field></div>
          </Section>
        )}

        {(element.type === 'counter' || element.type === 'countdown' || element.type === 'supporter') && (
          <Section title="Widget content">
            {element.type === 'supporter' && <div className="integration-card warning"><Info /><div><strong>Integration slot</strong><p>No supporter provider is connected, so this widget is excluded at runtime.</p></div></div>}
            <Field label="Label"><input value={asString(element, 'label')} onChange={(event) => prop('label', event.target.value)} /></Field>
            {element.type === 'counter' && <Field label="Value"><NumberInput value={asNumber(element, 'value')} onChange={(value) => prop('value', value)} /></Field>}
            {element.type === 'countdown' && <Field label="Minutes"><NumberInput value={asNumber(element, 'minutes', 10)} min={0} max={1440} onChange={(value) => prop('minutes', value)} /></Field>}
            {element.type === 'supporter' && <Field label="Placeholder"><input value={asString(element, 'value')} onChange={(event) => prop('value', event.target.value)} /></Field>}
            <Field label="Text color"><ColorInput value={asString(element, 'color', '#ffffff')} onChange={(value) => prop('color', value)} /></Field>
            <Field label="Accent color"><ColorInput value={asString(element, 'accentColor', '#8b5cf6')} onChange={(value) => prop('accentColor', value)} /></Field>
            <Field label="Background"><ColorInput value={asString(element, 'backgroundColor', '#111118')} onChange={(value) => prop('backgroundColor', value)} /></Field>
          </Section>
        )}

        <Section title="Appearance & animation">
          <Field label="Layer opacity"><NumberInput value={Math.round(element.opacity * 100)} min={0} max={100} onChange={(value) => props.onPatch({ opacity: value / 100 })} suffix="%" /></Field>
          <Field label="Entrance animation"><select value={element.animation.type} onChange={(event) => props.onPatch({ animation: { ...element.animation, type: event.target.value as OverlayElement['animation']['type'] } })}><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide up</option><option value="scale">Scale in</option></select></Field>
          <Field label="Duration"><NumberInput value={element.animation.duration} min={100} max={3000} step={50} onChange={(duration) => props.onPatch({ animation: { ...element.animation, duration } })} suffix="ms" /></Field>
        </Section>
      </div>
    </aside>
  )
}
