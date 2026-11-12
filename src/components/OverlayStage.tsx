import { useMemo } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ElementRenderer } from './ElementRenderer'
import { AlertProvider } from './alerts/AlertRuntime'
import { BackgroundLayer } from './BackgroundLayer'
import { MotionHost } from './MotionHost'
import { normalizeAlertSettings } from '../lib/alerts'
import { normalizeBackground } from '../lib/backgrounds'
import type { LiveOverlayEvent, Overlay, OverlayElement, OverlayTheme } from '../types'

/**
 * CP34: one renderer for the editor canvas and the published OBS source.
 *
 * The two used to build their own element wrappers, and they had drifted: the runtime rendered the idle glow and
 * sparkle layers, the editor did not, so two effects the inspector offers were invisible while authoring, and the
 * runtime rebuilt an AlertProvider per element on every render. Both surfaces now mount this component; the only
 * legitimate differences live behind `mode`.
 *
 * CP35 owns the motion host wiring: the runtime mounts MotionHost today, the editor passes `motionHost={false}` so
 * this phase does not silently start animating the canvas. That is the one remaining divergence, and it is a prop
 * this component already owns rather than two copies of the wrapper.
 */
export interface OverlayStageProps {
  overlay: Overlay
  theme: OverlayTheme
  mode: 'editor' | 'runtime'
  /** Logical-to-screen scale. The runtime derives it from the source, the editor from its zoom control. */
  scale: number
  /** `zoom` keeps glyphs crisp under scaling (OBS); `transform` is the fallback and stretches nothing. */
  scaleMode?: 'zoom' | 'transform'
  /** True when entrance and idle effects must hold still (staticMotion, or reduced motion in the runtime). */
  staticElements: boolean
  /** True when the animated background must hold still. */
  reducedMotion: boolean
  /** Editor-only: the preview flag the renderer uses to hide sample data. */
  preview?: boolean
  selectedId?: string | null
  /** Editor-only: the remount key a studio test play uses to restart an alert. */
  testAlertNonce?: number
  /** Editor-only: studio test plays, queued through the same engine the published source uses. */
  alertTests?: LiveOverlayEvent[]
  /** Editor-only chrome that belongs to the stage, such as guides or the empty hint. */
  children?: ReactNode
  /** Editor-only: selection handles and size readout for one element. */
  renderElementChrome?: (element: OverlayElement) => ReactNode
  /** Editor-only: drag and resize start. */
  onElementPointerDown?: (event: ReactPointerEvent, element: OverlayElement) => void
  /** Editor-only: the stage paints its own backdrop and selection surface. */
  className?: string
  style?: CSSProperties
  backgroundClassName?: string
  /** Runtime mounts the shared motion host; the editor leaves that to CP35. */
  motionHost?: boolean
  /** Extra data-* attributes on the stage element, used by the runtime's diagnostics and probes. */
  stageAttributes?: Record<string, string>
}

export function OverlayStage(props: OverlayStageProps) {
  const { overlay, theme, mode } = props
  const editor = mode === 'editor'
  // One settings normalisation and one provider per stage, not per element per render.
  const settings = useMemo(() => normalizeAlertSettings(overlay.alerts), [overlay.alerts])
  const background = useMemo(() => normalizeBackground(overlay.background), [overlay.background])
  // The editor shows every visible layer so an author can place a widget that output filters out; the runtime
  // only ever paints what the composition says goes to air.
  const elements = useMemo(
    () => overlay.elements.filter((element) => element.visible && (editor || element.includeInOutput)),
    [overlay.elements, editor],
  )
  const scaleStyle: CSSProperties = props.scaleMode === 'zoom' && Math.abs(props.scale - 1) > 0.001
    ? { zoom: props.scale }
    : { transform: `scale(${props.scale})` }

  return (
    <div
      // `canvas-stage` / `runtime-stage` are the existing style hooks: the stage keeps its identity in CSS while
      // gaining the shared wrapper, so no rule had to be duplicated for the new component.
      className={`overlay-stage ${editor ? 'canvas-stage' : 'runtime-stage'} stage-${mode} theme-${theme.id} ${overlay.staticMotion ? 'static-motion' : ''} ${props.className ?? ''}`}
      style={{
        width: overlay.width,
        height: overlay.height,
        ...scaleStyle,
        ...props.style,
      }}
      {...props.stageAttributes}
    >
      <BackgroundLayer background={background} reducedMotion={props.reducedMotion} className={props.backgroundClassName} />
      <AlertProvider value={{ settings, live: overlay.live, testMode: editor, reducedMotion: props.staticElements, testQueue: editor ? props.alertTests ?? [] : [] }}>
        {elements.map((element, index) => {
          const idle = props.staticElements || element.animation.reducedMotion === 'static' ? 'none' : element.animation.idle
          const enter = props.staticElements ? 'none' : element.animation.type
          const content = (
            <div className={`element-idle element-idle-${idle}`}>
              {(idle === 'glow' || idle === 'sparkle') && <span className={`idle-layer idle-${idle}`} aria-hidden="true" />}
              <ElementRenderer element={element} theme={theme} runtime={!editor} preview={editor && Boolean(props.preview)} />
            </div>
          )
          return (
            <div
              key={element.id}
              className={`stage-element ${editor ? 'canvas-element' : 'runtime-element'} ${editor && props.selectedId === element.id && !props.preview ? 'selected' : ''} ${element.locked ? 'locked' : ''}`}
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                opacity: element.opacity,
                transform: `rotate(${element.rotation}deg)`,
                zIndex: index + (editor ? 2 : 1),
                animationDuration: `${element.animation.duration}ms`,
              }}
              onPointerDown={editor && props.onElementPointerDown ? (event) => props.onElementPointerDown!(event, element) : undefined}
            >
              <div
                key={`${element.id}:${editor && props.selectedId === element.id ? props.testAlertNonce ?? 0 : 0}`}
                className={`element-content element-anim-${enter}`}
                style={{
                  animationDuration: `${element.animation.duration}ms`,
                  animationDelay: `${element.animation.delay}ms`,
                  animationTimingFunction: element.animation.easing,
                  '--anim-intensity': element.animation.intensity,
                  '--slide-x': element.animation.direction === 'left' ? '-42px' : element.animation.direction === 'right' ? '42px' : '0px',
                  '--slide-y': element.animation.direction === 'up' ? '42px' : element.animation.direction === 'down' ? '-42px' : '0px',
                } as CSSProperties}
              >
                {props.motionHost === false
                  ? content
                  : <MotionHost element={element} reducedMotion={props.staticElements}>{content}</MotionHost>}
              </div>
              {editor && props.renderElementChrome ? props.renderElementChrome(element) : null}
            </div>
          )
        })}
        {props.children}
      </AlertProvider>
    </div>
  )
}
