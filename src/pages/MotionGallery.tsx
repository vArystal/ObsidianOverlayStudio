import { useEffect, useRef, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { MotionBackground } from '../components/MotionBackground'
import { VARIANTS, presetsFor } from '../motion/catalog'
import { defaultConfig } from '../motion/config'
import type { MotionBackgroundHandle, MotionConfig, QualityTier, VariantId, FrameStats } from '../motion/types'
import { DEFAULT_BACKGROUND, normalizeBackground, motionConfigFor } from '../lib/backgrounds'
import type { OverlayBackground } from '../types'
import '../styles/motion-gallery.css'

/**
 * The gallery is the design-time surface for the motion system: ten live variants, every preset, the generated
 * poster swatch, the engine's real frame stats and a copy-paste config. It is an ordinary route, so it ships with the
 * app but is never part of the runtime overlay.
 */
export function MotionGallery() {
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [quality, setQuality] = useState<QualityTier | 'auto'>('auto')
  const [fps, setFps] = useState(60)
  const [stats, setStats] = useState<Partial<Record<VariantId, FrameStats>>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const engines = useRef(new Map<VariantId, MotionBackgroundHandle>())

  const [cards, setCards] = useState<Record<string, OverlayBackground>>(() => Object.fromEntries(
    VARIANTS.map((variant) => {
      const config = defaultConfig(variant.id)
      return [variant.id, normalizeBackground({
        ...DEFAULT_BACKGROUND,
        enabled: true,
        kind: variant.id,
        primary: config.colors[0],
        secondary: config.colors[1],
        accent: config.colors[2],
        params: config.params,
        preset: variant.presets[0].id,
      })]
    }),
  ))

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let smooth = 60
    const tick = (now: number) => {
      const dt = now - last
      last = now
      if (dt > 0) smooth = smooth * 0.9 + (1000 / dt) * 0.1
      setFps(smooth)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const next: Partial<Record<VariantId, FrameStats>> = {}
      for (const [id, engine] of engines.current) next[id] = engine.stats()
      setStats(next)
    }, 700)
    return () => clearInterval(timer)
  }, [])

  const card = (id: VariantId) => cards[id]
  const update = (id: VariantId, next: Partial<OverlayBackground>) => {
    setCards((previous) => ({ ...previous, [id]: normalizeBackground({ ...previous[id], ...next }) }))
  }
  const applyPreset = (id: VariantId, presetId: string) => {
    const preset = presetsFor(id).find((item) => item.id === presetId)
    if (!preset) return
    update(id, {
      primary: preset.colors[0],
      secondary: preset.colors[1],
      accent: preset.colors[2],
      preset: preset.id,
      params: { ...card(id).params, ...preset.params },
    })
  }
  const shuffle = () => {
    const seed = Math.floor(Math.random() * 90000) + 1
    setCards((previous) => Object.fromEntries(Object.entries(previous).map(([id, background]) => [id, { ...background, seed }])))
  }
  const copy = async (id: VariantId) => {
    const config: MotionConfig = motionConfigFor(card(id))
    const payload = JSON.stringify({ variant: id, config }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(id)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      setCopied(null)
    }
  }

  return (
    <AppShell>
      <main className="mg-page">
        <header className="mg-header">
          <div>
            <p className="mg-kicker">Motion system</p>
            <h1>Ten backdrops, one engine</h1>
            <p className="mg-lede">
              Every variant below is live: WebGL2 shaders where the look needs per-pixel work, Canvas2D for the
              particle, lattice and reaction-diffusion scenes, and one pure-CSS variant. Same palette logic, same
              grain, same finish pass. Pick a preset to recolour it, shuffle the seed for a new composition.
            </p>
          </div>
          <div className="mg-hud" aria-live="off">
            <div><span>Page</span><b>{Math.round(fps)} fps</b></div>
            <div><span>DPR</span><b>{typeof window !== 'undefined' ? window.devicePixelRatio : 1}×</b></div>
          </div>
        </header>

        <div className="mg-toolbar">
          <label className="mg-toggle">
            <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />
            Pause all
          </label>
          <label className="mg-toggle">
            <input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} />
            Reduced motion
          </label>
          <label className="mg-select">
            Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value as QualityTier | 'auto')}>
              <option value="auto">Auto</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={shuffle}>Shuffle seeds</button>
        </div>

        <div className="mg-grid">
          {VARIANTS.map((variant) => {
            const background = card(variant.id)
            const stat = stats[variant.id]
            const presets = presetsFor(variant.id)
            return (
              <article key={variant.id} className="mg-card">
                <div className="mg-stage">
                  <MotionBackground
                    background={{ ...background, paused }}
                    reducedMotion={reduced}
                    quality={quality}
                    onEngine={(handle) => {
                      if (handle) engines.current.set(variant.id, handle)
                      else engines.current.delete(variant.id)
                    }}
                  />
                  <span className="mg-badge">{variant.backend === 'gl' ? 'WebGL2' : variant.backend === '2d' ? 'Canvas2D' : 'CSS'}</span>
                </div>
                <div className="mg-body">
                  <div className="mg-title">
                    <h2>{variant.label}</h2>
                    <span>{stat ? `${stat.frameMs.toFixed(1)} ms · ${stat.tier}` : 'starting…'}</span>
                  </div>
                  <p>{variant.description}</p>
                  <code>{variant.tech}</code>
                  <div className="mg-presets">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={background.preset === preset.id ? 'is-active' : ''}
                        onClick={() => applyPreset(variant.id, preset.id)}
                        style={{ background: `linear-gradient(120deg, ${preset.colors[0]}, ${preset.colors[1]} 55%, ${preset.colors[2]})` }}
                        aria-label={`${variant.label} ${preset.label} preset`}
                        title={preset.label}
                      />
                    ))}
                    <button type="button" className="mg-copy" onClick={() => void copy(variant.id)}>
                      {copied === variant.id ? 'Copied' : 'Copy config'}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <section className="mg-snippet">
          <h2>Use it</h2>
          <pre>{`<MotionBackground
  background={{ ...overlay.background, kind: 'liquid-glass' }}
  reducedMotion={prefersReducedMotion}
/>`}</pre>
          <p>
            The document stores only a variant id, three colours, look values and validated params. Publishing and
            share links therefore survive renderer changes, and an overlay from before this system still resolves
            through the legacy map instead of losing its backdrop.
          </p>
        </section>
      </main>
    </AppShell>
  )
}

