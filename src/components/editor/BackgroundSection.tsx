import type { CSSProperties } from 'react'
import type { BackgroundKind, OverlayBackground } from '../../types'
import type { ParamSpec } from '../../motion/types'
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, normalizeBackground, presetFor } from '../../lib/backgrounds'
import { BASE_LOOK, VARIANT_BY_ID, presetsFor } from '../../motion/catalog'
import { posterCss } from '../../motion/config'

interface BackgroundSectionProps {
  background: OverlayBackground | undefined
  onChange: (background: OverlayBackground) => void
}

const LOOK_SLIDERS: { key: 'opacity' | 'speed' | 'intensity' | 'blur' | 'density' | 'scale'; label: string; min: number; max: number; step: number; format: (value: number) => string }[] = [
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'speed', label: 'Speed', min: 0.2, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'blur', label: 'Blur', min: 0, max: 80, step: 1, format: (v) => `${Math.round(v)}px` },
  { key: 'density', label: 'Density', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'scale', label: 'Scale', min: 0.6, max: 1.6, step: 0.02, format: (v) => `${v.toFixed(2)}×` },
]

const COLOURS: { key: 'primary' | 'secondary' | 'accent'; label: string }[] = [
  { key: 'primary', label: 'Ground' },
  { key: 'secondary', label: 'Mid tone' },
  { key: 'accent', label: 'Light' },
]

const GROUPS = ['Variant', 'Motion', 'Interaction', 'Look', 'Performance'] as const

const formatValue = (spec: ParamSpec, value: number) => {
  if (spec.unit === 'px') return `${Math.round(value)}px`
  if (spec.step && spec.step < 1) return value.toFixed(spec.step < 0.01 ? 3 : 2)
  return String(Math.round(value * 100) / 100)
}

/**
 * Background inspector.
 *
 * The gallery is generated from the variant catalog and the sliders are generated from each variant's schema, so a
 * new variant becomes editable the moment it is declared — there is no second hand-written control panel to keep in
 * sync. Only the params a variant actually declares are shown, so no slider is ever inert.
 */
export function BackgroundSection({ background, onChange }: BackgroundSectionProps) {
  const bg = normalizeBackground(background)
  const preset = presetFor(bg.kind) ?? BACKGROUND_PRESETS[0]
  const definition = VARIANT_BY_ID[preset.kind]
  const presets = presetsFor(preset.kind)
  const update = (patch: Partial<OverlayBackground>) => onChange(normalizeBackground({ ...bg, ...patch }))

  const applyVariant = (kind: BackgroundKind) => {
    const next = presetFor(kind)
    if (!next) return
    const config = next.defaults
    onChange(normalizeBackground({
      ...bg,
      ...config,
      kind,
      enabled: true,
      params: { ...config.params },
      preset: config.preset,
    }))
  }

  const applyPreset = (id: string) => {
    const chosen = presets.find((item) => item.id === id)
    if (!chosen) return
    const look = chosen.look ?? {}
    onChange(normalizeBackground({
      ...bg,
      primary: chosen.colors[0],
      secondary: chosen.colors[1],
      accent: chosen.colors[2],
      speed: look.speed ?? bg.speed,
      intensity: look.intensity ?? bg.intensity,
      opacity: look.opacity ?? bg.opacity,
      density: look.density ?? bg.density,
      scale: look.scale ?? bg.scale,
      blur: look.blur ?? bg.blur,
      preset: chosen.id,
      params: { ...bg.params, ...chosen.params },
    }))
  }

  const setParam = (key: string, value: number | string | boolean) => {
    update({ params: { ...bg.params, [key]: value }, preset: 'custom' })
  }

  const groups = GROUPS.map((group) => ({ group, params: definition?.params.filter((spec) => spec.group === group) ?? [] }))
    .filter((entry) => entry.params.length > 0)

  return (
    <div className="background-section">
      <div className="bg-row">
        <label className="toggle-row">
          <input type="checkbox" checked={bg.enabled} aria-label="Enable animated background" onChange={(event) => update({
            enabled: event.target.checked,
            // Flipping this on with no variant chosen used to render nothing, which reads as a broken switch.
            kind: event.target.checked && bg.kind === 'none' ? preset.kind : bg.kind,
          })} />
          <span>Animated background</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={bg.paused} onChange={(event) => update({ paused: event.target.checked })} aria-label="Pause background animation" />
          <span>Pause</span>
        </label>
      </div>

      <div className="bg-gallery" role="radiogroup" aria-label="Background variant">
        {BACKGROUND_PRESETS.map((option) => {
          const active = option.kind === preset.kind
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={active}
              className={`bg-thumb ${active ? 'is-active' : ''}`}
              onClick={() => applyVariant(option.kind)}
              title={option.blurb}
            >
              {/* A static poster swatch, not a live scene: mounting ten renderers inside the rail is exactly the
                  freeze this panel used to have. The swatch is generated by the same palette code as the real poster. */}
              <span
                className="bg-thumb-stage"
                aria-hidden="true"
                style={{ backgroundImage: posterCss({
                  colors: [option.defaults.primary, option.defaults.secondary, option.defaults.accent],
                  speed: 1, intensity: option.defaults.intensity, opacity: 1, blur: 0,
                  density: option.defaults.density, scale: 1, seed: 1, pointer: 0, grain: 0, vignette: 0,
                  params: option.defaults.params ?? {},
                }, option.kind) }}
              />
              <strong>{option.label}</strong>
              <small>{option.blurb}</small>
            </button>
          )
        })}
      </div>

      {definition && (
        <div className="bg-meta">
          <strong>{definition.tech}</strong>
          <small>{definition.description}</small>
        </div>
      )}

      <div className="bg-controls">
        <div className="bg-group">
          <h4>Preset</h4>
          <label className="bg-select">
            <span>Look</span>
            <select
              aria-label="Background preset"
              value={presets.some((item) => item.id === bg.preset) ? bg.preset : 'custom'}
              onChange={(event) => applyPreset(event.target.value)}
            >
              {presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              {!presets.some((item) => item.id === bg.preset) && <option value="custom">Custom</option>}
            </select>
          </label>
          <label className="bg-select">
            <span>Seed</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' } as CSSProperties}>
              <b style={{ color: '#e6e6e6', fontVariantNumeric: 'tabular-nums' }}>{bg.seed}</b>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: '4px 6px', fontSize: 9 }}
                aria-label="Randomise seed"
                onClick={() => update({ seed: Math.floor(Math.random() * 100000) + 1 })}
              >
                Shuffle
              </button>
            </span>
          </label>
        </div>

        <div className="bg-group">
          <h4>Palette</h4>
          {COLOURS.map((colour) => (
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
        </div>

        {groups.map(({ group, params }) => (
          <div key={group} className="bg-group">
            <h4>{group}</h4>
            {params.map((spec) => {
              if (spec.type === 'enum') {
                return (
                  <label key={spec.key} className="bg-select">
                    <span>{spec.label}</span>
                    <select
                      aria-label={spec.label}
                      value={String(bg.params?.[spec.key] ?? spec.default)}
                      onChange={(event) => setParam(spec.key, event.target.value)}
                    >
                      {(spec.values ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                )
              }
              if (spec.type === 'boolean') {
                return (
                  <label key={spec.key} className="bg-toggle">
                    <span>{spec.label}</span>
                    <input
                      type="checkbox"
                      aria-label={spec.label}
                      checked={bg.params?.[spec.key] === true}
                      onChange={(event) => setParam(spec.key, event.target.checked)}
                    />
                  </label>
                )
              }
              const value = typeof bg.params?.[spec.key] === 'number' ? (bg.params[spec.key] as number) : Number(spec.default)
              return (
                <label key={spec.key} className="bg-slider">
                  <span>
                    {spec.label} <b>{formatValue(spec, value)}</b>
                  </span>
                  <input
                    type="range"
                    aria-label={spec.label}
                    min={spec.min ?? 0}
                    max={spec.max ?? 1}
                    step={spec.step ?? 0.01}
                    value={value}
                    onChange={(event) => setParam(spec.key, Number(event.target.value))}
                  />
                </label>
              )
            })}
          </div>
        ))}

        <div className="bg-group">
          <h4>Motion &amp; finish</h4>
          {LOOK_SLIDERS.map((slider) => (
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
      </div>

      <div className="bg-actions">
        <button type="button" className="secondary-button" onClick={() => onChange(normalizeBackground({
          ...DEFAULT_BACKGROUND,
          enabled: true,
          kind: preset.kind,
          ...preset.defaults,
          ...BASE_LOOK,
          params: { ...preset.defaults.params },
        }))}>
          Reset to default
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange(normalizeBackground({ ...DEFAULT_BACKGROUND, enabled: false }))}
        >
          Remove background
        </button>
      </div>
    </div>
  )
}
