import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ElementRenderer } from '../components/ElementRenderer'
import { LiveDataProvider } from '../components/LiveDataProvider'
import { decodeOverlaySnapshot, getOverlayByPublicId } from '../lib/storage'

export function OverlayRuntime() {
  const { publicId = '' } = useParams(); const [params] = useSearchParams()
  const overlay = useMemo(() => { const snapshot = params.get('snapshot'); return snapshot ? decodeOverlaySnapshot(snapshot) : getOverlayByPublicId(publicId) }, [params, publicId])
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    document.documentElement.classList.add('runtime-root'); document.body.classList.add('runtime-root')
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', update)
    return () => { document.documentElement.classList.remove('runtime-root'); document.body.classList.remove('runtime-root'); window.removeEventListener('resize', update) }
  }, [])
  // Legacy snapshots may omit theme colours. Defaulting keeps a live source on air instead of failing.
  const theme = { accent: '#d8ad55', primary: '#0f0a14', surface: '#170f17', ...overlay?.theme }
  if (!overlay) return <div className="runtime-error"><strong>Overlay unavailable</strong><span>This local design or snapshot could not be found.</span></div>
  const scale = Math.min(viewport.width / overlay.width, viewport.height / overlay.height)
  return (
    <LiveDataProvider config={overlay.live}>
      <main className={`overlay-runtime theme-${theme.id || 'royal-persian'} ${overlay.staticMotion ? 'static-motion' : ''}`} aria-label={`${overlay.name} output`} style={{ '--theme-accent': theme.accent, '--theme-primary': theme.primary, '--theme-surface': theme.surface } as CSSProperties}>
        <div className="runtime-stage" style={{ width: overlay.width, height: overlay.height, transform: `scale(${scale})` }}>
          {overlay.elements.filter((element) => element.visible && element.includeInOutput).map((element, index) => (
            <div className="runtime-element" key={element.id} style={{ left: element.x, top: element.y, width: element.width, height: element.height, opacity: element.opacity, transform: `rotate(${element.rotation}deg)`, zIndex: index + 1 }}>
              <div className={`element-content element-anim-${overlay.staticMotion || element.animation.reducedMotion === 'static' ? 'none' : element.animation.type}`} style={{ animationDuration: `${element.animation.duration}ms`, animationDelay: `${element.animation.delay}ms`, animationTimingFunction: element.animation.easing, '--anim-intensity': element.animation.intensity, '--slide-x': element.animation.direction === 'left' ? '-42px' : element.animation.direction === 'right' ? '42px' : '0px', '--slide-y': element.animation.direction === 'up' ? '42px' : element.animation.direction === 'down' ? '-42px' : '0px' } as CSSProperties}>
                {(() => {
                  // Idle effects animate dedicated, compositor-only layers instead of the widget itself.
                  // Animating filter or background-position repaints the whole element every frame, which
                  // cost a measured 13fps at 33 layers; opacity/transform layers stay on the compositor.
                  const idle = overlay.staticMotion || element.animation.reducedMotion === 'static' ? 'none' : element.animation.idle
                  return (
                    <div className={`element-idle element-idle-${idle}`}>
                      {(idle === 'glow' || idle === 'sparkle') && <span className={`idle-layer idle-${idle}`} aria-hidden="true" />}
                      <ElementRenderer element={element} theme={overlay.theme} runtime />
                    </div>
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
