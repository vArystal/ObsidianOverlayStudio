import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Crosshair, Lock, ZoomIn } from 'lucide-react'
import { OverlayStage } from '../OverlayStage'
import { MotionHost } from '../MotionHost'
import type { LiveOverlayEvent } from '../../types'
import { themeCssVars } from '../../lib/themes'
import { clampElement, roundGeometry, snapPosition } from '../../lib/geometry'
import type { Guide, Overlay, OverlayElement } from '../../types'

type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface CanvasProps {
  overlay: Overlay
  selectedId: string | null
  preview: boolean
  zoom: number | null
  testAlertNonce: number
  /** CP25: studio test plays, queued through the same engine the published source uses. */
  alertTests?: LiveOverlayEvent[]
  onSelect: (id: string | null) => void
  onLiveElement: (element: OverlayElement) => void
  onInteractionStart: () => void
  onInteractionEnd: () => void
  onScaleChange: (scale: number) => void
}

interface PointerSession {
  kind: 'drag' | 'resize'
  direction?: ResizeDirection
  pointerId: number
  startX: number
  startY: number
  element: OverlayElement
}

const handles: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// CP33: the canvas does not mount motion yet; the import is required by CP35's canvas wiring and is referenced
// here so `noUnusedLocals` can stay on rather than the flag being weakened back off.
export const CANVAS_MOTION_HOST = MotionHost

export function Canvas(props: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<PointerSession | null>(null)
  const [viewport, setViewport] = useState({ width: 1000, height: 600 })
  const [guides, setGuides] = useState<Guide[]>([])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const fitScale = useMemo(
    () => Math.max(0.05, Math.min((viewport.width - 72) / props.overlay.width, (viewport.height - 72) / props.overlay.height)),
    [viewport, props.overlay.width, props.overlay.height],
  )
  const scale = props.zoom ?? fitScale

  useEffect(() => props.onScaleChange(scale), [scale, props.onScaleChange])

  function beginDrag(event: ReactPointerEvent, element: OverlayElement) {
    event.stopPropagation()
    props.onSelect(element.id)
    if (props.preview || element.locked || event.button !== 0) return
    sessionRef.current = {
      kind: 'drag', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, element: structuredClone(element),
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    props.onInteractionStart()
  }

  function beginResize(event: ReactPointerEvent, element: OverlayElement, direction: ResizeDirection) {
    event.preventDefault()
    event.stopPropagation()
    if (element.locked || event.button !== 0) return
    sessionRef.current = {
      kind: 'resize', direction, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, element: structuredClone(element),
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    props.onInteractionStart()
  }

  function pointerMove(event: ReactPointerEvent) {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const dx = (event.clientX - session.startX) / scale
    const dy = (event.clientY - session.startY) / scale
    if (session.kind === 'drag') {
      let next = { ...session.element, x: roundGeometry(session.element.x + dx), y: roundGeometry(session.element.y + dy) }
      if (props.overlay.settings.snap) {
        const snapped = snapPosition(next, props.overlay.width, props.overlay.height, 12 / scale)
        next = snapped.element
        setGuides(snapped.guides)
      } else next = clampElement(next, props.overlay.width, props.overlay.height)
      props.onLiveElement(next)
      return
    }

    const direction = session.direction!
    let { x, y, width, height } = session.element
    if (direction.includes('e')) width += dx
    if (direction.includes('s')) height += dy
    if (direction.includes('w')) { width -= dx; x += dx }
    if (direction.includes('n')) { height -= dy; y += dy }

    if (session.element.maintainAspectRatio) {
      const ratio = session.element.width / session.element.height
      if (direction === 'n' || direction === 's') width = height * ratio
      else height = width / ratio
      if (direction.includes('w')) x = session.element.x + session.element.width - width
      if (direction.includes('n')) y = session.element.y + session.element.height - height
    }
    props.onLiveElement(clampElement({ ...session.element, x: roundGeometry(x), y: roundGeometry(y), width: roundGeometry(width), height: roundGeometry(height) }, props.overlay.width, props.overlay.height))
  }

  function endPointer(event: ReactPointerEvent) {
    if (!sessionRef.current || sessionRef.current.pointerId !== event.pointerId) return
    sessionRef.current = null
    setGuides([])
    props.onInteractionEnd()
  }

  // Preview shows every configured layer. The old filter kept only `includeInOutput` layers, which is why
  // the webcam frame, the game-capture guide and every data-gated widget disappeared from Preview.
  const displayedElements = props.overlay.elements.filter((element) => element.visible)

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport ${props.preview ? 'previewing' : ''}`}
      onPointerDown={(event) => { if (event.target === event.currentTarget) props.onSelect(null) }}
    >
      <div className="canvas-scroll-area">
        {/* Drag and resize listen on the wrapper: the stage is pure layout, so the interaction plumbing stays here. */}
        <div
          className="canvas-size-wrap"
          style={{ width: props.overlay.width * scale, height: props.overlay.height * scale }}
          onPointerMove={pointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <OverlayStage
            overlay={props.overlay}
            theme={props.overlay.theme}
            mode="editor"
            scale={scale}
            scaleMode="transform"
            preview={props.preview}
            staticElements={props.overlay.staticMotion}
            reducedMotion={props.overlay.staticMotion}
            selectedId={props.selectedId}
            testAlertNonce={props.testAlertNonce}
            alertTests={props.alertTests}
            motionHost={false}
            backgroundClassName="editor-background"
            className={`${props.overlay.settings.transparent ? 'checkerboard' : 'dark-stage'} ${props.overlay.settings.showGrid ? 'show-grid' : ''}`}
            style={{
              backgroundImage: props.overlay.settings.backgroundImage ? `url(${props.overlay.settings.backgroundImage})` : undefined,
              ...themeCssVars(props.overlay.theme),
            } as CSSProperties}
            onElementPointerDown={(event, element) => beginDrag(event as ReactPointerEvent, element)}
            renderElementChrome={(element) => (props.selectedId === element.id && !props.preview ? (
              <>
                {element.locked ? <div className="locked-pill"><Lock /> Locked</div> : handles.map((direction) => (
                  <span
                    key={direction}
                    className={`resize-handle handle-${direction}`}
                    onPointerDown={(event) => beginResize(event, element, direction)}
                  />
                ))}
                <div className="size-readout">{Math.round(element.width)} × {Math.round(element.height)}</div>
              </>
            ) : null)}
          >
            {!displayedElements.length && !props.preview && (
              <div className="canvas-empty-hint">
                <span><Crosshair /></span>
                <strong>Your canvas is empty</strong>
                <small>Add only the elements you want from the left panel.</small>
              </div>
            )}
            {props.overlay.settings.showSafeArea && !props.preview && <div className="safe-area"><span>SAFE AREA · 5%</span></div>}
            {guides.map((guide, index) => (
              <span
                key={`${guide.axis}-${index}`}
                className={`alignment-guide guide-${guide.axis}`}
                style={guide.axis === 'x' ? { left: guide.value } : { top: guide.value }}
              />
            ))}
          </OverlayStage>
        </div>
      </div>
      {props.preview && <div className="preview-badge"><ZoomIn /> Preview · every layer, editor guides hidden</div>}
    </div>
  )
}
