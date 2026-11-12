import { FONT_FAMILIES } from '../lib/typography'

/**
 * CP39 — one font vocabulary in the UI too.
 *
 * Chat, the decoration "Content font" field and the alert studio used to offer three different lists, one of them
 * raw CSS stacks. Every picker now stores a family id from the same registry the typography studio reads, so a
 * value written in one place is valid everywhere and `fontStack()` resolves it the same way on both surfaces.
 */
export function FontSelect({ value, onChange, emptyLabel }: { value: string; onChange: (fontId: string) => void; emptyLabel?: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Font family">
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {FONT_FAMILIES.map((font) => (
        <option key={font.id} value={font.id}>{font.label}{font.arabic ? '' : ' · Latin'}</option>
      ))}
    </select>
  )
}
