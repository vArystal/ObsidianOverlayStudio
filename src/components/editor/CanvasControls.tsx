import { Grid3X3, Maximize, ScanLine, Sparkles } from 'lucide-react'

interface CanvasControlsProps {
  grid: boolean
  snap: boolean
  safe: boolean
  transparent: boolean
  onGrid: () => void
  onSnap: () => void
  onSafe: () => void
  onTransparent: () => void
  onFit: () => void
}

export function CanvasControls(props: CanvasControlsProps) {
  return (
    <div className="canvas-controls" aria-label="Canvas display controls">
      <button className={props.grid ? 'active' : ''} onClick={props.onGrid} title="Toggle grid"><Grid3X3 /></button>
      <button className={props.snap ? 'active' : ''} onClick={props.onSnap} title="Snap to canvas edges and center"><Sparkles /></button>
      <button className={props.safe ? 'active' : ''} onClick={props.onSafe} title="Toggle safe area"><ScanLine /></button>
      <button className={props.transparent ? 'active checker-icon' : ''} onClick={props.onTransparent} title="Toggle transparent preview"><span /></button>
      <i />
      <button onClick={props.onFit} title="Fit canvas"><Maximize /></button>
    </div>
  )
}
