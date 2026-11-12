import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import type { OverlayElement } from '../../types'
import {
  MOTION_PRESETS, MOTION_PROPERTIES, MOTION_PROPERTY_LABELS, clipFromPreset, createMotion, motionSpan,
  normalizeMotion, removeKeyframe, upsertKeyframe,
} from '../../lib/motion'
import type { ElementMotion, MotionClip, MotionPreset } from '../../lib/motion'
import { setMotionPreviewTime } from '../MotionHost'

interface MotionStudioProps { element: OverlayElement; onChange: (motion: ElementMotion | undefined) => void }

const KIND_LABELS: Record<MotionPreset['kind'], string> = { entrance: 'Entrance', exit: 'Exit', loop: 'Loop', emphasis: 'Emphasis' }
export function MotionStudio({ element, onChange }: MotionStudioProps) {
  const motion = useMemo(() => normalizeMotion(element.motion) ?? createMotion(), [element.motion])
  const [selectedClip, setSelectedClip] = useState<string | null>(motion.clips[0]?.id ?? null)
  const [kind, setKind] = useState<MotionPreset['kind']>('entrance')
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const span = Math.max(motionSpan(motion), 1000)
  const clip = motion.clips.find((item) => item.id === selectedClip) ?? null

  const commit = (next: ElementMotion | undefined) => { onChange(next); setMotionPreviewTime(null) }
  const scrub = (next: number) => { setPlaying(false); setTime(next); setMotionPreviewTime(next) }

  // Playback is a plain rAF loop over the sampled timeline, the same sampler the runtime uses.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const started = performance.now() - time
    const tick = () => {
      const elapsed = performance.now() - started
      if (elapsed >= span) { setTime(span); setMotionPreviewTime(span); setPlaying(false); return }
      setTime(elapsed); setMotionPreviewTime(elapsed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, span])

  const patchEffect = (patch: Partial<ElementMotion['effects']>) => commit({ ...motion, effects: { ...motion.effects, ...patch } })
  const patchClip = (patch: Partial<MotionClip>) => {
    if (!clip) return
    commit({ ...motion, clips: motion.clips.map((item) => item.id === clip.id ? { ...item, ...patch } : item) })
  }

  const addClip = (presetId: string) => {
    const preset = MOTION_PRESETS.find((item) => item.id === presetId && item.kind === kind)
    if (!preset) return
    const start = preset.kind === 'loop' ? 0 : Math.round(motionSpan(motion))
    const next = clipFromPreset(preset.id, { duration: preset.defaultDuration, intensity: 0.65 }, { delay: start })
    if (!next) return
    commit({ ...motion, clips: [...motion.clips, next] })
    setSelectedClip(next.id)
  }

  return (
    <div className="motion-studio" data-testid="motion-studio">
      <div className="motion-preset-bar">
        {(Object.keys(KIND_LABELS) as MotionPreset['kind'][]).map((item) => (
          <button key={item} type="button" data-motion-kind={item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{KIND_LABELS[item]}</button>
        ))}
      </div>
      <div className="motion-preset-grid">
        {MOTION_PRESETS.filter((preset) => preset.kind === kind).map((preset) => (
          <button key={preset.id} type="button" data-motion-preset={preset.id} onClick={() => addClip(preset.id)} title={`${preset.label} · ${preset.defaultDuration}ms`}>{preset.label}</button>
        ))}
      </div>

      <div className="motion-clips">
        {!motion.clips.length && <p className="motion-empty">No motion yet. Pick a preset above; it lands at the end of the timeline.</p>}
        {motion.clips.map((item) => (
          <div key={item.id} className={`motion-clip ${item.id === selectedClip ? 'active' : ''}`}>
            <button type="button" className="motion-clip-name" onClick={() => setSelectedClip(item.id)}>
              <strong>{MOTION_PRESETS.find((preset) => preset.id === item.preset)?.label ?? item.preset}</strong>
              <small>{item.trigger} · {Math.round(item.delay)}–{Math.round(item.delay + item.duration)}ms</small>
            </button>
            <button type="button" className="icon-button" aria-label="Remove motion" onClick={() => commit({ ...motion, clips: motion.clips.filter((entry) => entry.id !== item.id) })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {clip && (
        <fieldset className="motion-group">
          <legend>Selected motion</legend>
          <div className="two-columns">
            <label>Start<input type="number" min={0} max={30000} step={50} value={Math.round(clip.delay)} onChange={(event) => patchClip({ delay: Number(event.target.value) })} /></label>
            <label>Duration<input type="number" min={80} max={30000} step={50} value={Math.round(clip.duration)} onChange={(event) => patchClip({ duration: Number(event.target.value) })} /></label>
          </div>
          <label>Repeats<input type="number" min={0} max={50} value={clip.repeat} onChange={(event) => patchClip({ repeat: Number(event.target.value) })} /></label>
          <label className="alert-toggle"><input type="checkbox" checked={clip.alternate} onChange={(event) => patchClip({ alternate: event.target.checked })} /><span>Alternate direction on repeat</span></label>

          <div className="motion-keyframes">
            <div className="motion-keyframes-head"><span>Keyframes</span><small>playhead {Math.round(time)}ms</small></div>
            {MOTION_PROPERTIES.map((property) => {
              const keyframes = clip.tracks.find((track) => track.property === property)?.keyframes ?? []
              return (
                <div key={property} className="motion-track-row">
                  <span>{MOTION_PROPERTY_LABELS[property]}</span>
                  <div className="motion-track">
                    {keyframes.map((keyframe) => (
                      <b key={`${property}-${keyframe.t}`} style={{ left: `${Math.min(100, (keyframe.t / Math.max(clip.duration, 1)) * 100)}%` }} title={`${Math.round(keyframe.t)}ms · ${keyframe.value}`} />
                    ))}
                  </div>
                  <button type="button" className="icon-button" aria-label={`Add ${property} keyframe`}
                    onClick={() => patchClip({ tracks: upsertKeyframe(clip.tracks, property, Math.min(time, clip.duration), property === 'opacity' || property === 'scaleX' || property === 'scaleY' ? 1 : 0) })}>
                    <Plus size={12} />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="motion-keyframe-chips">
            {clip.tracks.flatMap((track) => track.keyframes.map((keyframe) => (
              <span key={`${track.property}-${keyframe.t}`} className="motion-chip">
                {MOTION_PROPERTY_LABELS[track.property]} {Math.round(keyframe.t)}ms
                <button type="button" aria-label="Remove keyframe" onClick={() => patchClip({ tracks: removeKeyframe(clip.tracks, track.property, keyframe.t) })}>×</button>
              </span>
            )))}
          </div>
        </fieldset>
      )}


      <fieldset className="motion-group">
        <legend>Effects</legend>
        <label className="motion-toggle"><input type="checkbox" checked={motion.effects.shadow.enabled} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, enabled: event.target.checked } })} /><span>Drop shadow</span></label>
        {motion.effects.shadow.enabled && (
          <div className="motion-effect-grid">
            <label>Colour<input type="color" value={motion.effects.shadow.color} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, color: event.target.value } })} /></label>
            <label>Opacity<input type="range" min={0} max={100} value={Math.round(motion.effects.shadow.opacity * 100)} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, opacity: Number(event.target.value) / 100 } })} /></label>
            <label>Blur<input type="number" min={0} max={120} value={motion.effects.shadow.blur} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, blur: Number(event.target.value) } })} /></label>
            <label>Offset X<input type="number" min={-80} max={80} value={motion.effects.shadow.x} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, x: Number(event.target.value) } })} /></label>
            <label>Offset Y<input type="number" min={-80} max={80} value={motion.effects.shadow.y} onChange={(event) => patchEffect({ shadow: { ...motion.effects.shadow, y: Number(event.target.value) } })} /></label>
          </div>
        )}

        <label className="motion-toggle"><input type="checkbox" checked={motion.effects.glow.enabled} onChange={(event) => patchEffect({ glow: { ...motion.effects.glow, enabled: event.target.checked } })} /><span>Glow</span></label>
        {motion.effects.glow.enabled && (
          <div className="motion-effect-grid">
            <label>Colour<input type="color" value={motion.effects.glow.color} onChange={(event) => patchEffect({ glow: { ...motion.effects.glow, color: event.target.value } })} /></label>
            <label>Intensity<input type="range" min={0} max={100} value={Math.round(motion.effects.glow.intensity * 100)} onChange={(event) => patchEffect({ glow: { ...motion.effects.glow, intensity: Number(event.target.value) / 100 } })} /></label>
            <label>Blur<input type="number" min={0} max={120} value={motion.effects.glow.blur} onChange={(event) => patchEffect({ glow: { ...motion.effects.glow, blur: Number(event.target.value) } })} /></label>
            <label>Spread<input type="number" min={0} max={60} value={motion.effects.glow.spread} onChange={(event) => patchEffect({ glow: { ...motion.effects.glow, spread: Number(event.target.value) } })} /></label>
          </div>
        )}

        <label className="motion-field">Mask
          <select value={motion.effects.mask.mode} onChange={(event) => patchEffect({ mask: { ...motion.effects.mask, mode: event.target.value as typeof motion.effects.mask.mode } })}>
            <option value="none">No mask</option><option value="fade-bottom">Fade to bottom</option><option value="fade-top">Fade to top</option>
            <option value="radial">Radial</option><option value="ellipse">Ellipse</option>
          </select>
        </label>
        {motion.effects.mask.mode !== 'none' && (
          <div className="motion-effect-grid">
            <label>Softness<input type="range" min={0} max={90} value={motion.effects.mask.softness} onChange={(event) => patchEffect({ mask: { ...motion.effects.mask, softness: Number(event.target.value) } })} /></label>
            <label>Reach<input type="range" min={20} max={100} value={motion.effects.mask.scale} onChange={(event) => patchEffect({ mask: { ...motion.effects.mask, scale: Number(event.target.value) } })} /></label>
          </div>
        )}

        <label className="motion-toggle"><input type="checkbox" checked={motion.effects.neon.enabled} onChange={(event) => patchEffect({ neon: { ...motion.effects.neon, enabled: event.target.checked } })} /><span>Neon edge glow</span></label>
        {motion.effects.neon.enabled && (
          <div className="motion-effect-grid">
            <label>Intensity<input type="range" min={0} max={100} value={Math.round(motion.effects.neon.intensity * 100)} onChange={(event) => patchEffect({ neon: { ...motion.effects.neon, intensity: Number(event.target.value) / 100 } })} /></label>
            <label>Colour<input type="color" value={motion.effects.neon.color} onChange={(event) => patchEffect({ neon: { ...motion.effects.neon, color: event.target.value } })} /></label>
          </div>
        )}

        <label className="motion-toggle"><input type="checkbox" checked={motion.effects.blur.enabled} onChange={(event) => patchEffect({ blur: { ...motion.effects.blur, enabled: event.target.checked } })} /><span>Static blur</span></label>
        {motion.effects.blur.enabled && (
          <label className="motion-field">Amount
            <input type="range" min={0} max={20} step={0.5} value={motion.effects.blur.amount} onChange={(event) => patchEffect({ blur: { ...motion.effects.blur, amount: Number(event.target.value) } })} />
          </label>
        )}

        <label className="motion-field">Shape clip
          <select value={motion.effects.clip.shape} onChange={(event) => patchEffect({ clip: { ...motion.effects.clip, shape: event.target.value as typeof motion.effects.clip.shape } })}>
            <option value="none">No clip</option><option value="inset">Rounded inset</option><option value="circle">Circle</option><option value="hex">Hexagon</option>
          </select>
        </label>

        <label className="motion-toggle"><input type="checkbox" checked={motion.effects.gradient.enabled} onChange={(event) => patchEffect({ gradient: { ...motion.effects.gradient, enabled: event.target.checked } })} /><span>Gradient sheen</span></label>
        {motion.effects.gradient.enabled && (
          <div className="motion-effect-grid">
            <label>Angle<input type="number" min={0} max={360} value={motion.effects.gradient.angle} onChange={(event) => patchEffect({ gradient: { ...motion.effects.gradient, angle: Number(event.target.value) } })} /></label>
            <label>Strength<input type="range" min={0} max={60} value={Math.round(motion.effects.gradient.from * 100)} onChange={(event) => patchEffect({ gradient: { ...motion.effects.gradient, from: Number(event.target.value) / 100 } })} /></label>
          </div>
        )}
      </fieldset>
      <fieldset className="motion-group">
        <legend>Timeline</legend>
        <div className="motion-transport">
          <button type="button" className="icon-button" aria-label={playing ? 'Pause animation' : 'Play animation'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button type="button" className="icon-button" aria-label="Restart animation" onClick={() => { setTime(0); setMotionPreviewTime(0) }}><RotateCcw size={14} /></button>
          <button type="button" className="icon-button" aria-label="Zoom out timeline" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}><ZoomOut size={14} /></button>
          <button type="button" className="icon-button" aria-label="Zoom in timeline" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><ZoomIn size={14} /></button>
          <small>{Math.round(time)} / {Math.round(span)}ms</small>
        </div>
        <div className="motion-ruler" style={{ width: `${Math.round(zoom * 100)}%` }}>
          {Array.from({ length: Math.max(2, Math.ceil(span / 500)) }, (_, index) => (
            <i key={index} style={{ left: `${(index / Math.max(1, Math.ceil(span / 500) - 1)) * 100}%` }}><span>{index * 500}</span></i>
          ))}
          <b className="motion-playhead" style={{ left: `${Math.min(100, (time / span) * 100)}%` }} />
        </div>
        <input className="motion-scrub" type="range" aria-label="Timeline playhead" min={0} max={Math.round(span)} step={10} value={Math.round(time)} onChange={(event) => scrub(Number(event.target.value))} />
      </fieldset>
    </div>
  )
}
