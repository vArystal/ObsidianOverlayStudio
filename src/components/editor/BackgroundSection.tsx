import type { CSSProperties } from 'react'
import type { BackgroundKind, OverlayBackground } from '../../types'
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, normalizeBackground, presetFor } from '../../lib/backgrounds'
import { BackgroundLayer } from '../BackgroundLayer'

interface BackgroundSectionProps {
  background: OverlayBackground | undefined
  onChange: (background: OverlayBackground) => void
}

const SLIDERS: { key: 'opacity' | 'speed' | 'intensity' | 'blur' | 'density' | 'scale'; label: string; min: number; max: number; step: number; format: (value: number) => string }[] = [
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'speed', label: 'Speed', min: 0.2, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'blur', label: 'Blur', min: 0, max: 80, step: 1, format: (v) => `${Math.round(v)}px` },
  { key: 'density', label: 'Density', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'scale', label: 'Scale', min: 0.6, max: 1.6, step: 0.02, format: (v) => `${v.toFixed(2)}×` },
]

const COLOURS: { key: 'primary' | 'secondary' | 'accent'; label: string }[] = [
  { key: 'primary', label: 'Primary colour' },
  { key: 'secondary', label: 'Secondary colour' },
  { key: 'accent', label: 'Accent colour' },
]

/**
 * The Background section. It lives in the inspector rather than the layer list because the backdrop is part of the
 * document, not an element: it has no coordinates, cannot be reordered and is not selectable on the canvas.
 * Only the controls the chosen effect actually reads are rendered, so no slider is ever inert.
 */
export function BackgroundSection({ background, onChange }: BackgroundSectionProps) {
  const bg = normalizeBackground(background)
  const preset = presetFor(bg.kind) ?? BACKGROUND_PRESETS[0]
  const has = (control: string) => preset.controls.includes(control as never)
  const update = (patch: Partial<OverlayBackground>) => onChange(normalizeBackground({ ...bg, ...patch }))

  return (
    <div className="background-section">
      <div className="bg-row">
        <label className="toggle-row">
          <input type="checkbox" checked={bg.enabled} onChange={(event) => update({ enabled: event.target.checked })} aria-label="Enable animated background" />
          <span>Animated background</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={bg.paused} onChange={(event) => update({ paused: event.target.checked })} aria-label="Pause background animation" />
          <span>Pause</span>
        </label>
      </div>

      <div className="bg-gallery" role="radiogroup" aria-label="Background effect">
        {BACKGROUND_PRESETS.map((option) => {
          const active = option.kind === bg.kind
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={active}
              className={`bg-thumb ${active ? 'is-active' : ''}`}
              onClick={() => onChange(normalizeBackground({ ...bg, kind: option.kind as BackgroundKind, ...option.defaults, enabled: true }))}
              title={option.blurb}
            >
              {/* The thumbnail is the real renderer at card size, so the choice is never a guess. */}
              <span className="bg-thumb-stage">
                <BackgroundLayer background={{ ...bg, ...option.defaults, kind: option.kind, enabled: true, paused: true, opacity: 0.95 }} />
              </span>
              <strong>{option.label}</strong>
              <small>{option.blurb}</small>
            </button>
          )
        })}
      </div>

      <div className="bg-controls">
        {COLOURS.filter((colour) => has(colour.key)).map((colour) => (
          <label key={colour.key} className="bg-colour">
            <span>{colour.label}</span>
            <input
              type="color"
              value={bg[colour.key]}
              aria-label={colour.label}
              onChange={(event) => update({ [colour.key]: event.target.value } as Partial<OverlayBackground>)}
            />
          </label>
        ))}
        {SLIDERS.filter((slider) => has(slider.key)).map((slider) => (
          <label key={slider.key} className="bg-slider">
            <span>
              {slider.label} <b>{slider.format(bg[slider.key])}</b>
            </span>
            <input
              type="range"
              aria-label={slider.label}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={bg[slider.key]}
              onChange={(event) => update({ [slider.key]: Number(event.target.value) } as Partial<OverlayBackground>)}
            />
          </label>
        ))}
      </div>

      <div className="bg-actions">
        <button type="button" className="secondary-button" onClick={() => onChange(normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: true, kind: bg.kind, ...preset.defaults }))}>
          Reset to default
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange(normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: false }))}
          style={{ '--bg-ghost': '1' } as CSSProperties}
        >
          Remove background
        </button>
      </div>
    </div>
  )
}
