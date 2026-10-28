import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ElementRenderer } from '../components/ElementRenderer'
import { decodeOverlaySnapshot, getOverlayByPublicId } from '../lib/storage'

export function OverlayRuntime() {
  const { publicId = '' } = useParams()
  const [params] = useSearchParams()
  const overlay = useMemo(() => {
    const snapshot = params.get('snapshot')
    return snapshot ? decodeOverlaySnapshot(snapshot) : getOverlayByPublicId(publicId)
  }, [params, publicId])
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    document.documentElement.classList.add('runtime-root')
    document.body.classList.add('runtime-root')
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => {
      document.documentElement.classList.remove('runtime-root')
      document.body.classList.remove('runtime-root')
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!overlay) {
    return <div className="runtime-error"><strong>Overlay unavailable</strong><span>This local design or snapshot could not be found.</span></div>
  }

  const scale = Math.min(viewport.width / overlay.width, viewport.height / overlay.height)
  return (
    <main className="overlay-runtime" aria-label={`${overlay.name} output`}>
      <div
        className="runtime-stage"
        style={{ width: overlay.width, height: overlay.height, transform: `scale(${scale})` }}
      >
        {overlay.elements.filter((element) => element.visible && element.includeInOutput).map((element, index) => (
          <div
            className="runtime-element"
            key={element.id}
            style={{
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              opacity: element.opacity,
              transform: `rotate(${element.rotation}deg)`,
              zIndex: index + 1,
              animationDuration: `${element.animation.duration}ms`,
            }}
          >
            <ElementRenderer element={element} runtime />
          </div>
        ))}
      </div>
    </main>
  )
}
