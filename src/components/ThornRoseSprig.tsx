/**
 * One illustrated rose on a thorned stem, drawn as vector paths so it stays sharp on a 1080p or 4K canvas.
 * Three of these sit at irregular offsets on a Thorn & Rose frame; because each is placed by hand rather
 * than tiled, the frame never reads as repeating clip art.
 */
export function ThornRoseSprig({ className = '' }: { className?: string }) {
  return (
    <span className={`thorn-rose-sprig ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="presentation">
        {/* stem curling away from the bloom, with two thorns */}
        <path d="M24 27 C 24 34, 30 38, 30 44" fill="none" stroke="var(--thorn-stem, #2f7a5f)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M26.4 33 l4 -1.8 l-3.6 3 z" fill="var(--thorn-stem, #2f7a5f)" opacity=".9" />
        <path d="M27.6 38.6 l4.2 -.6 l-4.2 2.4 z" fill="var(--thorn-stem, #2f7a5f)" opacity=".75" />
        {/* sepals under the bloom */}
        <path d="M18 26 q 6 -4 12 0 q -6 4 -12 0 z" fill="var(--thorn-leaf, #4c8f70)" opacity=".95" />
        <path d="M16.5 27.5 q -3.5 2.5 -6 1.5 q 2.5 -3.5 6 -1.5 z" fill="var(--thorn-leaf, #4c8f70)" opacity=".8" />
        {/* outer petals */}
        <path d="M24 25.5 C 16 25.5, 12 21, 13.6 15.4 C 15 10.6, 19.6 7.5, 24 7.5 C 28.4 7.5, 33 10.6, 34.4 15.4 C 36 21, 32 25.5, 24 25.5 Z" fill="var(--thorn-rose, #b3425a)" />
        <path d="M24 25.5 C 16 25.5, 12 21, 13.6 15.4 C 15 10.6, 19.6 7.5, 24 7.5 C 28.4 7.5, 33 10.6, 34.4 15.4 C 36 21, 32 25.5, 24 25.5 Z" fill="none" stroke="var(--thorn-rose-deep, #7d2334)" strokeWidth=".8" opacity=".85" />
        {/* petal folds: two overlapping shells give the bloom its depth */}
        <path d="M24 24.4 C 20.6 22, 18.4 18.4, 18.8 14.4 C 20.4 11.4, 22 9.6, 24 9.2 C 26 9.6, 27.6 11.4, 29.2 14.4 C 29.6 18.4, 27.4 22, 24 24.4 Z" fill="#c96074" opacity=".92" />
        <path d="M24 22.4 C 21.8 20.4, 20.8 18, 21.2 15.2 C 22.2 13.4, 23.2 12.4, 24 12.2 C 24.8 12.4, 25.8 13.4, 26.8 15.2 C 27.2 18, 26.2 20.4, 24 22.4 Z" fill="var(--thorn-rose-deep, #7d2334)" opacity=".9" />
        {/* ivory highlight plus the gold spiral at the heart */}
        <path d="M20.4 13.2 C 21.6 11.6, 22.8 10.8, 24 10.6" fill="none" stroke="#f4efe4" strokeWidth=".7" opacity=".55" strokeLinecap="round" />
        <path d="M24 19.6 C 22.4 18.4, 22 16.8, 22.4 15.2 C 23 14, 23.6 13.4, 24 13.2" fill="none" stroke="var(--thorn-gold, #c9a24a)" strokeWidth=".8" opacity=".85" strokeLinecap="round" />
        <circle cx="24" cy="17.2" r="1" fill="var(--thorn-gold, #c9a24a)" opacity=".9" />
      </svg>
    </span>
  )
}
