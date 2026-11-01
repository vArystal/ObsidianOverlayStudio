import { Flower2, Leaf, Wind } from 'lucide-react'
import {
  THORN_FOLIAGE_DENSITY,
  THORN_MOTION_SCALE,
  THORN_ROSE_PALETTES,
  normalizeThornTuning,
} from '../../lib/themes'
import type { ThornFoliage, ThornMotion, ThornRose, ThornTuning } from '../../types'

/**
 * The look of the botanical theme is data, so it belongs in the inspector rather than in a stylesheet.
 * Three independent choices: the rose ramp, how much foliage grows, and how fast it moves. Each row is a
 * radio group, which is what makes arrow-key switching work for keyboard users.
 */
export function ThornTuningCard({ value, onChange }: { value?: ThornTuning; onChange: (next: ThornTuning) => void }) {
  const tuning = normalizeThornTuning(value)
  const set = (patch: Partial<ThornTuning>) => onChange({ ...tuning, ...patch })

  const rows: { icon: typeof Flower2; label: string; hint: string; options: { id: string; label: string }[]; current: string; apply: (id: string) => void }[] = [
    {
      icon: Flower2,
      label: 'Rose colour',
      hint: 'Recolours every bloom; the greens and golds stay put.',
      options: (Object.keys(THORN_ROSE_PALETTES) as ThornRose[]).map((id) => ({ id, label: THORN_ROSE_PALETTES[id].label })),
      current: tuning.rose,
      apply: (id) => set({ rose: id as ThornRose }),
    },
    {
      icon: Leaf,
      label: 'Foliage',
      hint: `Leaves and thorns at ${Math.round(THORN_FOLIAGE_DENSITY[tuning.foliage] * 100)}% of the shipped budget.`,
      options: (Object.keys(THORN_FOLIAGE_DENSITY) as ThornFoliage[]).map((id) => ({ id, label: id })),
      current: tuning.foliage,
      apply: (id) => set({ foliage: id as ThornFoliage }),
    },
    {
      icon: Wind,
      label: 'Motion',
      hint: tuning.motion === 'still' ? 'Idle sway parked; alert animation still plays.' : `Idle sway runs at ${Math.round((1 / THORN_MOTION_SCALE[tuning.motion]) * 100)}% speed.`,
      options: (Object.keys(THORN_MOTION_SCALE) as ThornMotion[]).map((id) => ({ id, label: id })),
      current: tuning.motion,
      apply: (id) => set({ motion: id as ThornMotion }),
    },
  ]

  return (
    <div className="thorn-tuning">
      {rows.map((row) => (
        <div className="thorn-tuning-row" key={row.label}>
          <div className="thorn-tuning-head"><row.icon /><strong>{row.label}</strong></div>
          <div className="segmented" role="radiogroup" aria-label={row.label}>
            {row.options.map((option) => (
              <button
                key={option.id}
                role="radio"
                aria-checked={row.current === option.id}
                className={row.current === option.id ? 'active' : ''}
                onClick={() => row.apply(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p>{row.hint}</p>
        </div>
      ))}
    </div>
  )
}
