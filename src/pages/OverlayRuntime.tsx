import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ElementRenderer } from '../components/ElementRenderer'
import { MotionHost } from '../components/MotionHost'
import { LiveDataProvider } from '../components/LiveDataProvider'
import { decodeOverlaySnapshot, getOverlayByPublicId } from '../lib/storage'
import { getTheme, themeCssVars } from '../lib/themes'
import { BackgroundLayer, usePrefersReducedMotion } from '../components/BackgroundLayer'
import { normalizeBackground } from '../lib/backgrounds'
import { AlertProvider } from '../components/alerts/AlertRuntime'
import { normalizeAlertSettings } from '../lib/alerts'

export function OverlayRuntime() {
  const { publicId = '' } = useParams(); const [params] = useSearchParams()
  const overlay = useMemo(() => { const snapshot = params.get('snapshot'); return snapshot ? decodeOverlaySnapshot(snapshot) : getOverlayByPublicId(publicId) }, [params, publicId])
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    document.documentElement.classList.add('runtime-root'); document.body.classList.add('runtime-root')
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', update)
    return () => { document.documentElement.classList.remove('runtime-root'); document.body.classList.remove('runtime-root'); window.removeEventListener('resize', update) }
  }, [])
  // A snapshot may carry a retired theme id or no colours at all. getTheme migrates the id and supplies the
  // whole preset, so a live source keeps rendering instead of failing on a missing field.
  const theme = getTheme(overlay?.theme?.id)
  const prefersReducedMotion = usePrefersReducedMotion()
  if (!overlay) return <div className="runtime-error"><strong>Overlay unavailable</strong><span>This local design or snapshot could not be found.</span></div>
  const scale = Math.min(viewport.width / overlay.width, viewport.height / overlay.height)
  // OBS renders the source with a device pixel ratio of 1, so a CSS transform scale rasterises text at design size
  // and then downsamples it: the same overlay that looks crisp on a retina tab looks soft on air. `zoom` is a
  // layout-level scale in Chromium (which OBS embeds), so glyphs and vectors are re-rasterised at the final size.
  const zoomable = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1.5')
  const stageSize = { width: overlay.width, height: overlay.height }
  const stageStyle: CSSProperties = zoomable && Math.abs(scale - 1) > 0.001
    ? { ...stageSize, zoom: scale }
    : { ...stageSize, transform: `scale(${scale})` }
  // Test mode is opt-in per source URL, so an operator can check the wiring in OBS without waiting for a
  // real event, and a normal source can never be contaminated by the test buttons on Integrations.
  const testMode = params.get('test') === '1'
  return (
    <LiveDataProvider config={overlay.live} testMode={testMode}>
      <main className={`overlay-runtime theme-${theme.id} ${overlay.staticMotion ? 'static-motion' : ''}`} aria-label={`${overlay.name} output`} style={themeCssVars(theme) as CSSProperties}>
        {testMode && <div className="runtime-test-mode" role="status">TEST MODE · SYNTHETIC EVENTS · NOT FOR AIR</div>}
        <div className="runtime-stage" data-scale-mode={zoomable && Math.abs(scale - 1) > 0.001 ? 'zoom' : 'transform'} style={stageStyle}>
          {/* Same component as the editor: one scene implementation, no drift between preview and air. */}
          <BackgroundLayer background={normalizeBackground(overlay.background)} reducedMotion={prefersReducedMotion} />
          {overlay.elements.filter((element) => element.visible && element.includeInOutput).map((element, index) => (
            <div className="runtime-element" key={element.id} style={{ left: element.x, top: element.y, width: element.width, height: element.height, opacity: element.opacity, transform: `rotate(${element.rotation}deg)`, zIndex: index + 1 }}>
              <div className={`element-content element-anim-${overlay.staticMotion || element.animation.reducedMotion === 'static' ? 'none' : element.animation.type}`} style={{ animationDuration: `${element.animation.duration}ms`, animationDelay: `${element.animation.delay}ms`, animationTimingFunction: element.animation.easing, '--anim-intensity': element.animation.intensity, '--slide-x': element.animation.direction === 'left' ? '-42px' : element.animation.direction === 'right' ? '42px' : '0px', '--slide-y': element.animation.direction === 'up' ? '42px' : element.animation.direction === 'down' ? '-42px' : '0px' } as CSSProperties}>
                {(() => {
                  // Idle effects animate dedicated, compositor-only layers instead of the widget itself.
                  // Animating filter or background-position repaints the whole element every frame, which
                  // cost a measured 13fps at 33 layers; opacity/transform layers stay on the compositor.
                  const idle = overlay.staticMotion || element.animation.reducedMotion === 'static' ? 'none' : element.animation.idle
                  return (
                    <MotionHost element={element} reducedMotion={overlay.staticMotion || prefersReducedMotion}><div className={`element-idle element-idle-${idle}`}>
                      {(idle === 'glow' || idle === 'sparkle') && <span className={`idle-layer idle-${idle}`} aria-hidden="true" />}
                      <AlertProvider value={{ settings: normalizeAlertSettings(overlay.alerts), live: overlay.live, testMode: false, reducedMotion: overlay.staticMotion || prefersReducedMotion, testQueue: [] }}>
                        <ElementRenderer element={element} theme={overlay.theme} runtime />
                      </AlertProvider>
                    </div></MotionHost>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      </main>
    </LiveDataProvider>
  )
}
