import { useContext, useId, useMemo } from 'react'
import { buildFrameSpec, type RosePart, type ThornVariant } from '../../lib/thornGeometry'
import { THORN_FOLIAGE_DENSITY, THORN_MOTION_SCALE } from '../../lib/themes'
import { ThornTuningContext } from './tuningContext'

/**
 * The botanical frame.
 *
 * Everything is layered vector: two cane strokes (dark base plus a lit edge), tapered thorns with a tip
 * highlight, serrated leaves in three shades, and roses built from rings of cup-shaped petals with a dark
 * centre and a lighter rim. Gradients and one blur filter give it depth; nothing here is a bitmap, so a
 * 1920x1080 source and a 320px counter both stay sharp without shipping a second asset.
 */

interface ThornFrameProps {
  id: string
  width: number
  height: number
  variant: ThornVariant
  radius: number
  /** Changes on a counter/viewer update, which fires the petal burst. */
  signal?: string
  /** The alert plays a growth animation every time it opens. */
  alerting?: boolean
}

/** A cup-shaped petal in unit space, pointing up, base at the origin. */
const PETAL = 'M0 0C-0.42 -0.12 -0.58 -0.46 -0.5 -0.74C-0.44 -0.98 -0.16 -1.08 0.06 -0.98C0.34 -0.86 0.5 -0.54 0.4 -0.24C0.34 -0.06 0.18 0.02 0 0Z'

/** The vein layout of a rose leaf: one midrib and three pairs, drawn in leaf-local space. */
const LEAF_VEINS = ['M0 0L0 -0.9', 'M0 -0.2L0.16 -0.36', 'M0 -0.42L-0.16 -0.56', 'M0 -0.5L0.14 -0.66', 'M0 -0.68L-0.12 -0.8']

/** Serrated rose leaf: three lobes with a midrib and two veins. */
const LEAF = 'M0 0C0.22 -0.18 0.3 -0.42 0.24 -0.62L0.34 -0.58L0.3 -0.74L0.42 -0.72L0.36 -0.9L0.16 -0.98C0.06 -1.02 -0.06 -1.02 -0.16 -0.98L-0.36 -0.9L-0.42 -0.72L-0.3 -0.74L-0.34 -0.58L-0.24 -0.62C-0.3 -0.42 -0.22 -0.18 0 0Z'

/** A single rose leaf: serrated silhouette, a fold shadow, and vein work drawn in leaf space. */
function RoseLeaf({ uid, x, y, angle, size, shade }: { uid: string; x: number; y: number; angle: number; size: number; shade: 'dark' | 'mid' | 'lit' }) {
  const fill = `url(#${uid}-leaf-${shade})`
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path d={LEAF} fill={fill} stroke="#0a1310" strokeWidth={0.06} />
      {/* The fold: one half catching less light is what stops it looking like a flat cutout. */}
      <path d={LEAF} fill="#04100b" opacity=".22" transform="scale(-1 1)" />
      <g stroke="#0b1a13" strokeWidth={0.035} strokeLinecap="round" opacity=".55" fill="none">
        {LEAF_VEINS.map((d, index) => <path key={index} d={d} />)}
      </g>
      <path d="M0 0L0 -0.86" stroke="#6fae86" strokeWidth={0.028} strokeLinecap="round" opacity=".38" fill="none" />
    </g>
  )
}

function Rose({ part, uid }: { part: RosePart; uid: string }) {
  const size = part.size
  // Outer petals alternate between two ramps and carry an edge light; inner rings tighten and darken. The
  // jitter is index arithmetic, not RNG, so a re-render draws the identical flower.
  const rings: { count: number; scale: number; tilt: number; fills: string[]; rim: boolean }[] = [
    { count: 6, scale: 1, tilt: 0, fills: [`url(#${uid}-petal-outer)`, `url(#${uid}-petal-outer-alt)`], rim: true },
    { count: 5, scale: 0.78, tilt: 26, fills: [`url(#${uid}-petal-mid)`, `url(#${uid}-petal-outer)`], rim: false },
    { count: 4, scale: 0.55, tilt: 12, fills: [`url(#${uid}-petal-inner)`, `url(#${uid}-petal-mid)`], rim: false },
    { count: 3, scale: 0.33, tilt: 34, fills: [`url(#${uid}-petal-heart)`, `url(#${uid}-petal-inner)`], rim: false },
  ]
  return (
    <g className="thorn-rose" transform={`rotate(${part.angle})`}>
      <g className={`thorn-rose-body ${part.kind === 'small' ? '' : 'sway'}`}>
        {/* Two veined leaves under the bloom give the rose a place to sit instead of floating on the cane. */}
        <RoseLeaf uid={uid} x={-2} y={size * 0.16} angle={-152} size={size * 0.62} shade="dark" />
        <RoseLeaf uid={uid} x={3} y={size * 0.18} angle={-28} size={size * 0.56} shade="mid" />
        {rings.map((ring, ringIndex) => (
          <g key={ringIndex} className={`thorn-petal-ring ring-${ringIndex}`}>
            {Array.from({ length: ring.count }).map((_, petalIndex) => {
              const angle = (360 / ring.count) * petalIndex + ring.tilt + (part.kind === 'bud' ? 8 : 0)
              const length = size * ring.scale * (part.kind === 'bud' ? 0.82 : 1)
              return (
                <g key={petalIndex} transform={`rotate(${angle + (petalIndex % 2 ? 3 : -3)}) scale(${length * 0.52} ${length * (petalIndex % 3 === 0 ? 1.04 : 1)}) translate(0 ${-size * 0.02})`}>
                  <path d={PETAL} fill={ring.fills[petalIndex % ring.fills.length]} stroke="rgba(40,4,10,.6)" strokeWidth={size * 0.011} />
                  {ring.rim && <path d={PETAL} fill={`url(#${uid}-petal-rim)`} opacity=".7" />}
                </g>
              )
            })}
          </g>
        ))}
        {/* Velvet sheen, then a spiral heart: a real rose furls in on itself instead of ending in a dot. */}
        <ellipse cx={-size * 0.09} cy={-size * 0.18} rx={size * 0.24} ry={size * 0.14} fill={`url(#${uid}-sheen)`} opacity=".45" />
        <path
          d={`M0 ${-size * 0.02}C${size * 0.1} ${-size * 0.06} ${size * 0.11} ${size * 0.08} ${size * 0.01} ${size * 0.09}C${-size * 0.11} ${size * 0.1} ${-size * 0.13} ${-size * 0.08} ${-size * 0.01} ${-size * 0.14}C${size * 0.09} ${-size * 0.19} ${size * 0.16} ${-size * 0.06} ${size * 0.12} ${size * 0.04}`}
          fill="none"
          stroke={`url(#${uid}-heart-shadow)`}
          strokeWidth={size * 0.05}
          strokeLinecap="round"
          opacity=".92"
        />
        <circle r={size * 0.055} fill="#2a040b" opacity=".85" />
        <circle cx={-size * 0.015} cy={-size * 0.03} r={size * 0.02} fill={ `url(#${uid}-gold)` } opacity=".5" />
      </g>
    </g>
  )
}

export function ThornFrame({ id, width, height, variant, radius, signal, alerting }: ThornFrameProps) {
  const uid = useId().replace(/[:]/g, '')
  const tuning = useContext(ThornTuningContext)
  const density = THORN_FOLIAGE_DENSITY[tuning.foliage]
  const motionScale = THORN_MOTION_SCALE[tuning.motion]
  const spec = useMemo(
    () => buildFrameSpec({ id, width, height, variant, radius, density, motionScale }),
    [id, width, height, variant, radius, density, motionScale],
  )
  if (width < 24 || height < 24) return null

  return (
    <>
    <svg
      className={`thorn-frame thorn-${variant}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      data-alerting={alerting ? 'true' : undefined}
    >
      <defs>
        <linearGradient id={`${uid}-cane`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0d1a14" />
          <stop offset="55%" stopColor="var(--thorn-leaf-deep, #1f4a34)" />
          <stop offset="100%" stopColor="#0a1310" />
        </linearGradient>
        <linearGradient id={`${uid}-cane-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--thorn-leaf-lit, #5f9a6e)" stopOpacity=".85" />
          <stop offset="100%" stopColor="var(--thorn-leaf-mid, #2f6b49)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-thorn`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a2417" />
          <stop offset="70%" stopColor="#3b3320" />
          <stop offset="100%" stopColor="#7a6a3a" />
        </linearGradient>
        <linearGradient id={`${uid}-leaf-dark`} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0%" stopColor="#10251a" />
          <stop offset="100%" stopColor="var(--thorn-leaf-deep, #1f4a34)" />
        </linearGradient>
        <linearGradient id={`${uid}-leaf-mid`} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0%" stopColor="var(--thorn-leaf-deep, #1f4a34)" />
          <stop offset="100%" stopColor="var(--thorn-leaf-mid, #2f6b49)" />
        </linearGradient>
        <linearGradient id={`${uid}-leaf-lit`} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0%" stopColor="var(--thorn-leaf-mid, #2f6b49)" />
          <stop offset="100%" stopColor="var(--thorn-leaf-lit, #5f9a6e)" />
        </linearGradient>
        <radialGradient id={`${uid}-petal-outer`} cx="50%" cy="78%" r="78%">
          <stop offset="0%" stopColor="var(--thorn-rose-shadow, #3d0610)" />
          <stop offset="62%" stopColor="var(--thorn-rose-deep, #8e1226)" />
          <stop offset="100%" stopColor="var(--thorn-rose-mid, #b3162f)" />
        </radialGradient>
        <radialGradient id={`${uid}-petal-mid`} cx="50%" cy="72%" r="70%">
          <stop offset="0%" stopColor="#4b0813" />
          <stop offset="58%" stopColor="#a3142a" />
          <stop offset="100%" stopColor="#c21f38" />
        </radialGradient>
        <radialGradient id={`${uid}-petal-inner`} cx="50%" cy="66%" r="66%">
          <stop offset="0%" stopColor="#5c0d18" />
          <stop offset="55%" stopColor="var(--thorn-rose-mid, #b3162f)" />
          <stop offset="100%" stopColor="var(--thorn-rose-lit, #d9304a)" />
        </radialGradient>
        <radialGradient id={`${uid}-petal-heart`} cx="50%" cy="60%" r="62%">
          <stop offset="0%" stopColor="#2a040b" />
          <stop offset="100%" stopColor="#7a101f" />
        </radialGradient>
        {/* Edge light and a warmer outer variant: alternating these around a ring gives a rose its bloom. */}
        <radialGradient id={`${uid}-petal-outer-alt`} cx="46%" cy="82%" r="80%">
          <stop offset="0%" stopColor="var(--thorn-rose-shadow, #3d0610)" />
          <stop offset="58%" stopColor="var(--thorn-rose-mid, #b3162f)" />
          <stop offset="100%" stopColor="var(--thorn-rose-lit, #d9304a)" />
        </radialGradient>
        <linearGradient id={`${uid}-petal-rim`} x1="0" y1="1" x2="0.2" y2="0">
          <stop offset="0%" stopColor="var(--thorn-rose-lit, #d9304a)" stopOpacity="0" />
          <stop offset="72%" stopColor="#f0a6b4" stopOpacity=".55" />
          <stop offset="100%" stopColor="#ffe2e8" stopOpacity=".8" />
        </linearGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="46%" r="72%">
          <stop offset="52%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#04100b" stopOpacity=".55" />
        </radialGradient>
        <radialGradient id={`${uid}-sheen`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f4d0d9" stopOpacity=".55" />
          <stop offset="100%" stopColor="#f4d0d9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-heart-shadow`} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#21030a" />
          <stop offset="100%" stopColor="#4d0712" />
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5c4520" />
          <stop offset="45%" stopColor="var(--thorn-gold, #b8924a)" />
          <stop offset="70%" stopColor="var(--thorn-gold-lit, #e6c77a)" />
          <stop offset="100%" stopColor="#8c6a2c" />
        </linearGradient>
        <linearGradient id={`${uid}-shimmer`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--thorn-gold-lit, #e6c77a)" stopOpacity="0" />
          <stop offset="45%" stopColor="#f6efdc" stopOpacity=".85" />
          <stop offset="100%" stopColor="var(--thorn-gold-lit, #e6c77a)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="thorn-canopy" key={signal ?? 'rest'}>
        {/* Leaves that sit behind the canes read as depth rather than decoration stuck on top. */}
        <g className="thorn-foliage back">
        {spec.leaves.filter((leaf) => leaf.behind).map((leaf, index) => (
          <path
            key={`lb${index}`}
            className="thorn-leaf"
            d={LEAF}
            transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`}
            fill={`url(#${uid}-${leaf.shade === 0 ? 'leaf-dark' : leaf.shade === 1 ? 'leaf-mid' : 'leaf-lit'})`}
            stroke="#0a1310"
            strokeWidth=".08"
          />
        ))}
        </g>

        {spec.canes.map((cane, index) => (
          <g key={`c${index}`} className="thorn-cane">
            {/* Under-stroke: the shadow that lifts the cane off the panel, without a blur filter. */}
            <path d={cane.d} fill="none" stroke="#050a07" strokeOpacity=".55" strokeWidth={cane.width + 2.6} strokeLinecap="round" transform="translate(0 1.2)" />
            <path d={cane.d} fill="none" stroke={`url(#${uid}-cane)`} strokeWidth={cane.width} strokeLinecap="round" style={{ ['--cane-len' as string]: cane.length ?? 900 }} />
            <path d={cane.d} fill="none" stroke={`url(#${uid}-cane-lit)`} strokeWidth={Math.max(1, cane.width * 0.34)} strokeLinecap="round" opacity={cane.highlight ? 0.7 : 0.45} transform="translate(-0.6 -0.6)" />
          </g>
        ))}

        {spec.thorns.map((thorn, index) => (
          <g key={`t${index}`} className="thorn-spike" transform={`translate(${thorn.x} ${thorn.y}) rotate(${thorn.angle})`}>
            <path d={`M0 0C${thorn.length * 0.4} ${-3.1 * thorn.dir} ${thorn.length * 0.75} ${-2.2 * thorn.dir} ${thorn.length} 0C${thorn.length * 0.7} ${1.4 * thorn.dir} ${thorn.length * 0.3} ${1.5 * thorn.dir} 0 0Z`} fill={`url(#${uid}-thorn)`} />
            <path d={`M${thorn.length * 0.18} ${-0.5 * thorn.dir}L${thorn.length * 0.72} ${-0.9 * thorn.dir}`} stroke="#c9b478" strokeWidth=".7" opacity=".5" strokeLinecap="round" />
          </g>
        ))}

        <g className="thorn-foliage front">
        {spec.leaves.filter((leaf) => !leaf.behind).map((leaf, index) => (
          <g key={`lf${index}`} className="thorn-leaf">
            <path d={LEAF} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`} fill={`url(#${uid}-${leaf.shade === 0 ? 'leaf-dark' : leaf.shade === 1 ? 'leaf-mid' : 'leaf-lit'})`} stroke="#0a1310" strokeWidth=".08" />
            {/* Midrib plus two veins: what makes a leaf read as a leaf at overlay scale. */}
            <path d="M0 0L0 -0.95" transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`} stroke="#8fbf9d" strokeWidth=".06" opacity=".5" />
            <path d="M0 -0.42L0.22 -0.6M0 -0.58L-0.2 -0.74" transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`} stroke="#8fbf9d" strokeWidth=".045" opacity=".38" />
          </g>
        ))}
        </g>


      </g>

      {/* Recessed panel edge: a gold filigree line with a soft inner glow behind it. */}
      <rect
        className="thorn-glow"
        x={spec.filigree.x} y={spec.filigree.y} width={spec.filigree.width} height={spec.filigree.height}
        rx={spec.filigree.radius} fill="none" stroke="#b8924a" strokeWidth="5" opacity=".16"
      />
      <rect
        className="thorn-gold-line"
        x={spec.filigree.x} y={spec.filigree.y} width={spec.filigree.width} height={spec.filigree.height}
        rx={spec.filigree.radius} fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="1.15" opacity=".85"
      />
      {[{ x: spec.filigree.x, y: spec.filigree.y, r: 0 }, { x: spec.filigree.x + spec.filigree.width, y: spec.filigree.y, r: 90 }, { x: spec.filigree.x + spec.filigree.width, y: spec.filigree.y + spec.filigree.height, r: 180 }, { x: spec.filigree.x, y: spec.filigree.y + spec.filigree.height, r: 270 }].map((corner, index) => (
        <g key={`fc${index}`} className="thorn-filigree" transform={`translate(${corner.x} ${corner.y}) rotate(${corner.r})`}>
          <path d="M0 6C0 0 0 0 6 0" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="1.2" />
          <circle cx="1.6" cy="1.6" r="1.5" fill="#e6c77a" />
          <path d="M6 0.2c3 0 4 1.4 3.4 3" fill="none" stroke="#b8924a" strokeWidth=".7" opacity=".8" />
        </g>
      ))}
      {/* One sweep of light across the gold, slow enough to notice only if you look for it. */}
      <rect className="thorn-shimmer" x={spec.filigree.x} y={spec.filigree.y} width={spec.filigree.width * 0.4} height={2.5} fill={`url(#${uid}-shimmer)`} rx="1.5" />

      {/* A single petal drifts down the frame and fades, then waits a long time before the next. */}
      <path
        className="thorn-drift"
        d="M0 0C-5 -2 -7 -8 -3 -12C0 -15 4 -12 3 -7C2.6 -4 2 0 0 0Z"
        fill="#b3162f" opacity="0"
        style={{ ['--drift-x' as string]: `${spec.drift.x}px`, ['--drift-dur' as string]: `${spec.drift.duration}s`, ['--drift-delay' as string]: `${spec.drift.delay}s` }}
      />

      {/* Depth only: the artwork frames itself, and any rule drawn inside it reads as a box on the art. */}
      <rect x="0" y="0" width={width} height={height} rx={radius} fill={`url(#${uid}-vignette)`} pointerEvents="none" />
    </svg>

    {/* Blooms live in their own composited layers so the sway never repaints the canes. */}
    {spec.roses.map((rose, index) => (
      <span
        key={`rb${index}`}
        className={`thorn-bloom-layer ${rose.kind}`}
        style={{
          left: rose.x, top: rose.y,
          width: rose.size * 2.5, height: rose.size * 2.5,
          ['--sway' as string]: `${rose.sway.duration}s`,
          ['--delay' as string]: `-${rose.sway.delay}s`,
        }}
      >
        <svg viewBox={`${-rose.size * 1.25} ${-rose.size * 1.25} ${rose.size * 2.5} ${rose.size * 2.5}`} width="100%" height="100%" aria-hidden focusable="false">
          <Rose part={rose} uid={uid} />
        </svg>
      </span>
    ))}

    {signal !== undefined && (
      <span className="thorn-burst-layer" key={`burst-${signal}`} style={{ left: spec.width / 2, top: spec.height / 2 }}>
        <svg viewBox="-30 -30 60 60" width="60" height="60" aria-hidden focusable="false">
          {Array.from({ length: 7 }).map((_, index) => (
            <path key={index} d={PETAL} fill="#b3162f" opacity=".9" transform={`rotate(${index * 51.4}) translate(0 -8) scale(11 18)`} />
          ))}
        </svg>
      </span>
    )}
    </>
  )
}
