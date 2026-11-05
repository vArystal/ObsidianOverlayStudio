import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { RotateCcw, Search, Sparkle } from 'lucide-react'
import type { OverlayElement } from '../../types'
import {
  TYPOGRAPHY_PRESETS, applyPreset, checkFont, findFont, fontStack, isFontMissing, loadFont, readTypography,
  resetTypography, searchFonts,
} from '../../lib/typography'
import type { FontFamily } from '../../lib/typography'

interface Props {
  element: OverlayElement
  onProp: (key: string, value: string | number | boolean | null) => void
  onProps: (patch: Record<string, unknown>) => void
}

const WEIGHT_LABELS: Record<number, string> = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' }

function Slider({ label, value, min, max, step = 1, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="type-slider">
      <label htmlFor={id}>{label}<output>{Number.isInteger(value) ? value : value.toFixed(2)}{suffix}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="type-row">{children}</div>
}

/**
 * Typography Studio. Progressive disclosure is deliberate: family, weight and size are always visible because they
 * are what people actually change; leading, tracking, shadow, stroke and overflow live behind Advanced.
 */
export function TypographyStudio({ element, onProp, onProps }: Props) {
  const type = readTypography(element.props)
  const family = findFont(type.fontFamily) ?? findFont('inter')!
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [status, setStatus] = useState(() => checkFont(type.fontFamily, type.fontWeight).status)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchFonts(query), [query])

  // Only the selected face is fetched on mount. Hovering a family warms it so the preview is real, not a guess.
  useEffect(() => {
    let alive = true
    setStatus(checkFont(type.fontFamily, type.fontWeight).status)
    loadFont(type.fontFamily, type.fontWeight).then((ok) => { if (alive) setStatus(ok ? 'ready' : 'fallback') })
    return () => { alive = false }
  }, [type.fontFamily, type.fontWeight])

  const missing = isFontMissing(element.props.fontFamily)
  const pickFamily = (next: FontFamily) => {
    onProp('fontFamily', next.id)
    // A family that does not ship the current weight would be synthetically emboldened, so snap to a real one.
    if (!next.weights.includes(type.fontWeight)) onProp('fontWeight', next.weights.reduce((best, w) => Math.abs(w - type.fontWeight) < Math.abs(best - type.fontWeight) ? w : best, next.weights[0]))
    setListOpen(false)
    setQuery('')
  }

  return (
    <div className="typography-studio">
      <header className="type-header">
        <div>
          <h3>Typography Studio</h3>
          <p>{family.label} · {type.fontSize}px · {WEIGHT_LABELS[type.fontWeight] ?? type.fontWeight}</p>
        </div>
        <button type="button" className="type-reset" onClick={() => onProps(resetTypography())} title="Reset typography (keeps your text and layout)">
          <RotateCcw aria-hidden /> Reset
        </button>
      </header>

      {missing && <p className="type-warning" role="status">Saved font “{String(element.props.fontFamily)}” is not in the library. Rendering with the fallback stack; pick a family below to fix it.</p>}
      <p className={`type-status type-status-${status}`} aria-live="polite">
        {status === 'loading' ? 'Loading font file…' : status === 'fallback' ? 'Font file unavailable, using fallback' : 'Font ready'}
        {!family.arabic && ' · Persian glyphs fall back to Vazirmatn'}
      </p>

      <section className="type-presets" aria-label="Typography presets">
        {TYPOGRAPHY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="type-preset"
            title={preset.description}
            onClick={() => onProps(applyPreset(element.props, preset.id))}
          >
            <span className="type-preset-sample" style={{ fontFamily: fontStack(preset.props.fontFamily) }}>Aa</span>
            <span className="type-preset-name">{preset.name}</span>
          </button>
        ))}
      </section>

      <div className="type-field">
        <label htmlFor="font-search">Font family</label>
        <div className="type-search">
          <Search aria-hidden />
          <input
            id="font-search"
            ref={inputRef}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="font-listbox"
            aria-autocomplete="list"
            placeholder={family.label}
            value={query}
            onFocus={() => setListOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setListOpen(true) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setListOpen(false); setQuery('') }
              if (event.key === 'Enter' && results[0]) { event.preventDefault(); pickFamily(results[0]) }
              if (event.key === 'ArrowDown') { event.preventDefault(); setListOpen(true) }
            }}
          />
          {listOpen && (
            <button type="button" className="type-search-close" onClick={() => setListOpen(false)} aria-label="Close font list">×</button>
          )}
        </div>
        {(listOpen || query) && (
          <ul className="type-list" id="font-listbox" role="listbox" aria-label="Available fonts">
            {results.length === 0 && <li className="type-empty">No family matches “{query}”.</li>}
            {results.map((font, index) => (
              <li key={font.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={font.id === type.fontFamily}
                  className={`type-option ${font.id === type.fontFamily ? 'selected' : ''}`}
                  tabIndex={index === 0 ? 0 : -1}
                  onMouseEnter={() => { void loadFont(font.id) }}
                  onClick={() => pickFamily(font)}
                >
                  <span className="type-option-copy">
                    <strong>{font.label}</strong>
                    <small>{font.kind}{font.arabic ? ' · Persian' : ''} · {font.weights.join(' ')}</small>
                  </span>
                  <span className="type-option-sample" style={{ fontFamily: fontStack(font.id) }}>{font.sample}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="type-field">
        <span className="type-label" id="weight-label">Weight</span>
        <div className="type-weights" role="group" aria-labelledby="weight-label">
          {family.weights.map((weight) => (
            <button
              key={weight}
              type="button"
              className={weight === type.fontWeight ? 'active' : ''}
              aria-pressed={weight === type.fontWeight}
              onClick={() => onProp('fontWeight', weight)}
            >{WEIGHT_LABELS[weight] ?? weight}</button>
          ))}
        </div>
      </div>

      <Slider label="Size" value={type.fontSize} min={8} max={220} suffix="px" onChange={(value) => onProp('fontSize', value)} />

      <div className="type-field">
        <label htmlFor="type-colour">Text colour</label>
        <div className="type-colour">
          <input id="type-colour" type="color" value={type.color} onChange={(event) => onProp('color', event.target.value)} />
          <input
            aria-label="Text colour hex value"
            type="text"
            spellCheck={false}
            value={type.color}
            onChange={(event) => { if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(event.target.value.trim())) onProp('color', event.target.value.trim()) }}
          />
        </div>
      </div>

      <Row>
        <div className="type-field grow">
          <span className="type-label" id="align-label">Align</span>
          <div className="type-segment" role="group" aria-labelledby="align-label">
            {(['left', 'center', 'right', 'justify'] as const).map((align) => (
              <button key={align} type="button" aria-pressed={type.textAlign === align} className={type.textAlign === align ? 'active' : ''} onClick={() => onProp('textAlign', align)}>{align.slice(0, 1).toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="type-field grow">
          <span className="type-label" id="dir-label">Direction</span>
          <div className="type-segment" role="group" aria-labelledby="dir-label">
            {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
              <button key={dir} type="button" aria-pressed={type.direction === dir} className={type.direction === dir ? 'active' : ''} onClick={() => onProp('direction', dir)}>{dir.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </Row>

      <button type="button" className="type-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
        <Sparkle aria-hidden /> {advanced ? 'Hide advanced typography' : 'Advanced typography'}
      </button>

      {advanced && (
        <div className="type-advanced">
          <Slider label="Line height" value={type.lineHeight} min={0.7} max={3} step={0.05} onChange={(value) => onProp('lineHeight', value)} />
          <Slider label="Letter spacing" value={type.letterSpacing} min={-10} max={30} step={0.25} suffix="px" onChange={(value) => onProp('letterSpacing', value)} />
          <Slider label="Text opacity" value={type.textOpacity} min={0} max={1} step={0.05} onChange={(value) => onProp('textOpacity', value)} />

          <Row>
            <label className="type-field grow">Vertical
              <select value={type.verticalAlign} onChange={(event) => onProp('verticalAlign', event.target.value)}>
                <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="type-field grow">Wrapping
              <select value={type.wrap} onChange={(event) => onProp('wrap', event.target.value)}>
                <option value="wrap">Wrap</option><option value="nowrap">No wrap</option>
              </select>
            </label>
          </Row>
          <Row>
            <label className="type-field grow">Overflow
              <select value={type.overflow} onChange={(event) => onProp('overflow', event.target.value)}>
                <option value="clip">Clip</option><option value="ellipsis">Ellipsis</option><option value="visible">Visible</option>
              </select>
            </label>
            <label className="type-field grow">Max lines
              <input type="number" min={0} max={20} value={type.maxLines} onChange={(event) => onProp('maxLines', Number(event.target.value))} />
            </label>
          </Row>
          <Row>
            <label className="type-field grow">Transform
              <select value={type.textTransform} onChange={(event) => onProp('textTransform', event.target.value)}>
                <option value="none">None</option><option value="uppercase">UPPER</option><option value="lowercase">lower</option><option value="capitalize">Title</option>
              </select>
            </label>
            <label className="type-field grow">Decoration
              <select value={type.textDecoration} onChange={(event) => onProp('textDecoration', event.target.value)}>
                <option value="none">None</option><option value="underline">Underline</option><option value="line-through">Strike</option>
              </select>
            </label>
          </Row>

          <div className="type-effect">
            <label className="type-switch"><input type="checkbox" checked={type.shadowEnabled} onChange={(event) => onProp('shadowEnabled', event.target.checked)} /><span>Drop shadow</span></label>
            {type.shadowEnabled && (
              <Row>
                <label className="type-field grow">Colour<input type="color" value={type.shadowColor} onChange={(event) => onProp('shadowColor', event.target.value)} /></label>
                <label className="type-field grow">Blur<input type="number" min={0} max={100} value={type.shadowBlur} onChange={(event) => onProp('shadowBlur', Number(event.target.value))} /></label>
              </Row>
            )}
          </div>

          <div className="type-effect">
            <label className="type-switch"><input type="checkbox" checked={type.strokeEnabled} onChange={(event) => onProp('strokeEnabled', event.target.checked)} /><span>Outline / stroke</span></label>
            {type.strokeEnabled && (
              <Row>
                <label className="type-field grow">Colour<input type="color" value={type.strokeColor} onChange={(event) => onProp('strokeColor', event.target.value)} /></label>
                <label className="type-field grow">Width<input type="number" min={0} max={20} value={type.strokeWidth} onChange={(event) => onProp('strokeWidth', Number(event.target.value))} /></label>
              </Row>
            )}
          </div>

          <div className="type-effect">
            <label className="type-switch"><input type="checkbox" checked={type.glowEnabled} onChange={(event) => onProp('glowEnabled', event.target.checked)} /><span>Glow</span></label>
            {type.glowEnabled && (
              <Row>
                <label className="type-field grow">Colour<input type="color" value={type.glowColor} onChange={(event) => onProp('glowColor', event.target.value)} /></label>
                <label className="type-field grow">Blur<input type="number" min={0} max={80} value={type.glowBlur} onChange={(event) => onProp('glowBlur', Number(event.target.value))} /></label>
              </Row>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
