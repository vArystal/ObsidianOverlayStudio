import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { LiveDataProvider } from '../components/LiveDataProvider'
import { usePrefersReducedMotion } from '../components/BackgroundLayer'
import { OverlayStage } from '../components/OverlayStage'
import { decodeOverlaySnapshot, getOverlayByPublicId } from '../lib/storage'
import { getTheme, themeCssVars } from '../lib/themes'

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
  // The design is the truth: a source larger than the composition renders 1:1 instead of being blown up to fill
  // it, because any scale above 1 has to invent pixels and stops the whole stage landing on whole device pixels.
  // `fit=fill` opts back into covering, and `fit=stretch` exists only for deliberately non-proportional sources.
  const fit = params.get('fit') ?? 'contain'
  const contain = Math.min(viewport.width / overlay.width, viewport.height / overlay.height)
  const cover = Math.max(viewport.width / overlay.width, viewport.height / overlay.height)
  const scale = fit === 'stretch'
    ? 1
    : fit === 'fill' || fit === 'cover'
      ? cover
      : Math.min(1, contain)
  // OBS renders the source with a device pixel ratio of 1, so a CSS transform scale rasterises text at design size
  // and then downsamples it: the same overlay that looks crisp on a retina tab looks soft on air. `zoom` is a
  // layout-level scale in Chromium (which OBS embeds), so glyphs and vectors are re-rasterised at the final size.
  const zoomable = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1.5')
  // Test mode is opt-in per source URL, so an operator can check the wiring in OBS without waiting for a
  // real event, and a normal source can never be contaminated by the test buttons on Integrations.
  const testMode = params.get('test') === '1'
  // ?diag=1 exists because an OBS browser source is a black box: the operator needs to see the size and pixel
  // ratio OBS actually reports, and whether the stage is landing on whole pixels, without opening devtools.
  const diag = params.get('diag') === '1'
  const devicePixels = { width: Math.round(overlay.width * scale), height: Math.round(overlay.height * scale) }
  const exact = Math.abs(devicePixels.width - overlay.width * scale) < 0.01 && Math.abs(devicePixels.height - overlay.height * scale) < 0.01
  const pixelPerfect = Math.abs(scale - 1) < 0.001 && exact
  return (
    <LiveDataProvider config={overlay.live} testMode={testMode}>
      <main className={`overlay-runtime theme-${theme.id} ${overlay.staticMotion ? 'static-motion' : ''}`} aria-label={`${overlay.name} output`} style={themeCssVars(theme) as CSSProperties}>
        {testMode && <div className="runtime-test-mode" role="status">TEST MODE · SYNTHETIC EVENTS · NOT FOR AIR</div>}
        {diag && (
          <div className="runtime-diagnostics" role="status" data-pixel-perfect={pixelPerfect}>
            <strong>{pixelPerfect ? 'PIXEL PERFECT · 1:1' : `SCALED ${scale.toFixed(4)}× · NOT 1:1`}</strong>
            <span>source {viewport.width}×{viewport.height} · dpr {window.devicePixelRatio} · fit {fit}</span>
            <span>design {overlay.width}×{overlay.height} · mode {fit === 'stretch' ? 'stretch' : Math.abs(scale - 1) > 0.001 ? 'zoom' : 'transform'}</span>
            <span>{pixelPerfect ? 'set the Browser Source to the design size to keep this' : `set the Browser Source to ${overlay.width}×${overlay.height}`}</span>
          </div>
        )}
        <OverlayStage
          overlay={overlay}
          theme={theme}
          mode="runtime"
          scale={scale}
          scaleMode={fit === 'stretch' ? 'transform' : zoomable ? 'zoom' : 'transform'}
          staticElements={overlay.staticMotion || prefersReducedMotion}
          reducedMotion={overlay.staticMotion || prefersReducedMotion}
          style={fit === 'stretch' ? { width: '100%', height: '100%', transform: 'none' } : undefined}
          stageAttributes={{
            'data-scale-mode': fit === 'stretch' ? 'stretch' : zoomable && Math.abs(scale - 1) > 0.001 ? 'zoom' : 'transform',
            'data-fit': fit,
          }}
        />
      </main>
    </LiveDataProvider>
  )
}
