import { THEMES, THEME_ORDER } from '../../lib/themes'

/**
 * The theme selector used to be a text-only dropdown, so a theme could not be judged before applying it.
 * Each card is a miniature of the real frame: palette from the theme tokens, and for Thorn & Rose the
 * botanical edge art that defines it.
 */
export function ThemeGallery({ value, onChange }: { value: string; onChange: (themeId: string) => void }) {
  return (
    <div className="theme-gallery" role="radiogroup" aria-label="Overlay theme">
      {THEME_ORDER.map((id) => THEMES[id]).map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={value === theme.id}
          aria-label={`${theme.name} theme`}
          className={`theme-thumb ${value === theme.id ? 'active' : ''} `}
          onClick={() => onChange(theme.id)}
        >
          <span className="theme-thumb-art" style={{ background: `linear-gradient(150deg, ${theme.surface}, ${theme.primary})`, borderColor: theme.accent }}>
            <span className="theme-thumb-line" style={{ background: theme.accent }} />
            <span className="theme-thumb-line short" style={{ background: theme.accentSoft }} />
            
          </span>
          <span className="theme-thumb-name">{theme.name}</span>
        </button>
      ))}
    </div>
  )
}
