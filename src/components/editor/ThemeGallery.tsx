import { THEMES } from '../../lib/themes'

/**
 * The theme selector used to be a text-only dropdown, so a theme could not be judged before applying it.
 * Each card is a miniature of the real frame: palette from the theme tokens, and for Thorn & Rose the
 * botanical edge art that defines it.
 */
export function ThemeGallery({ value, onChange }: { value: string; onChange: (themeId: string) => void }) {
  return (
    <div className="theme-gallery" role="radiogroup" aria-label="Overlay theme">
      {Object.values(THEMES).map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={value === theme.id}
          aria-label={`${theme.name} theme`}
          className={`theme-thumb ${value === theme.id ? 'active' : ''} ${theme.id === 'thorn-rose' ? 'thorn' : ''}`}
          onClick={() => onChange(theme.id)}
        >
          <span className="theme-thumb-art" style={{ background: `linear-gradient(150deg, ${theme.surface}, ${theme.primary})`, borderColor: theme.accent }}>
            <span className="theme-thumb-line" style={{ background: theme.accent }} />
            <span className="theme-thumb-line short" style={{ background: theme.accentSoft }} />
            {theme.id === 'thorn-rose' && (
              <svg viewBox="0 0 40 40" aria-hidden="true" className="theme-thumb-vine">
                <path d="M2 30 C 9 22, 15 36, 22 26 S 33 16, 38 22" fill="none" stroke="#4c8f70" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M9 27 l2.6 -3.4 l.8 3.6 z" fill="#2f7a5f" />
                <circle cx="26.5" cy="21" r="4.2" fill="#b3425a" />
                <circle cx="26.5" cy="21" r="2.2" fill="#7d2334" />
                <circle cx="26.5" cy="21" r=".8" fill="#c9a24a" />
              </svg>
            )}
          </span>
          <span className="theme-thumb-name">{theme.name}</span>
        </button>
      ))}
    </div>
  )
}
