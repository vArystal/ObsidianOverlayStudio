import {
  Check,
  ChevronDown,
  CloudOff,
  Copy,
  Eye,
  EyeOff,
  Maximize,
  Palette,
  Redo2,
  Save,
  Undo2,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { THEMES } from '../../lib/themes'

interface EditorToolbarProps {
  name: string
  dirty: boolean
  saving: boolean
  saveError: string
  canUndo: boolean
  canRedo: boolean
  preview: boolean
  resolution: string
  themeId: string
  zoomPercent: number
  selectedIsTestable: boolean
  onNameChange: (value: string) => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onPreview: () => void
  onResolution: (value: string) => void
  onTheme: (value: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onCopyUrl: () => void
  onTest: () => void
}

export function EditorToolbar(props: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <div className="name-status">
        <input
          aria-label="Overlay name"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          maxLength={80}
        />
        <span className={props.saveError ? 'save-state error' : 'save-state'}>
          {props.saveError ? <><CloudOff /> Save failed</> : props.saving ? 'Saving…' : props.dirty ? 'Unsaved changes' : <><Check /> Saved locally</>}
        </span>
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="icon-button" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl/⌘ Z)"><Undo2 /></button>
        <button className="icon-button" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl/⌘ Shift Z)"><Redo2 /></button>
      </div>
      <button className={`toolbar-button ${props.preview ? 'active' : ''}`} onClick={props.onPreview}>
        {props.preview ? <EyeOff /> : <Eye />} {props.preview ? 'Exit preview' : 'Preview'}
      </button>
      <label className="select-control theme-control">
        <Palette />
        <select aria-label="Overlay theme" value={props.themeId} onChange={(event) => props.onTheme(event.target.value)}>
          {Object.values(THEMES).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
        </select>
        <ChevronDown />
      </label>
      <label className="select-control resolution-control">
        <Maximize />
        <select aria-label="Canvas resolution" value={props.resolution} onChange={(event) => props.onResolution(event.target.value)}>
          <option value="1920x1080">1920 × 1080</option>
          <option value="1280x720">1280 × 720</option>
          <option value="2560x1440">2560 × 1440</option>
          <option value="custom">Custom</option>
        </select>
        <ChevronDown />
      </label>
      <div className="zoom-toolbar">
        <button className="icon-button" onClick={props.onZoomOut} title="Zoom out"><ZoomOut /></button>
        <button onClick={props.onFit} title="Fit canvas to workspace">{props.zoomPercent}%</button>
        <button className="icon-button" onClick={props.onZoomIn} title="Zoom in"><ZoomIn /></button>
      </div>
      {props.selectedIsTestable && <button className="toolbar-button test-button" onClick={props.onTest}><Zap /> Test widget</button>}
      <div className="toolbar-spacer" />
      <button className="toolbar-button" onClick={props.onCopyUrl} title="Publish this composition and copy its OBS browser source URL"><Copy /> Publish</button>
      <button className="primary-button compact" onClick={props.onSave}><Save /> Save</button>
    </div>
  )
}
