import { useEffect, useId, useRef, useState } from 'react'

export interface DialogField {
  name: string
  label: string
  value: string
  min?: number
  max?: number
  suffix?: string
}

interface InputDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  fields: DialogField[]
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}

/**
 * CP41: window.prompt is a browser-native box with 20px targets that ignores the studio's type scale and cannot be
 * validated inline. This is the studio's own inline dialog: labelled fields, per-field numeric bounds, an error that
 * explains the valid range, and 44px hit targets for touch.
 */
export function InputDialog({ open, title, description, confirmLabel, fields, onSubmit, onCancel }: InputDialogProps) {
  const headingId = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.value])))
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    firstRef.current?.focus()
    firstRef.current?.select()
    return () => window.removeEventListener('keydown', onKey, true)
    // Re-seeding on open is intentional: a reopening dialog must show the document's current value, not the last draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const invalid = fields
    .filter((field) => field.min !== undefined || field.max !== undefined)
    .map((field) => {
      const number = Number(values[field.name])
      if (!Number.isFinite(number)) return `${field.label} must be a number`
      if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}`
      if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}`
      return ''
    })
    .find(Boolean)

  const submit = () => { if (!invalid) onSubmit(values) }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <form
        className="dialog input-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onSubmit={(event) => { event.preventDefault(); submit() }}
      >
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
        {fields.map((field, index) => (
          <label key={field.name} className="input-dialog-field">
            <span>{field.label}</span>
            <input
              ref={index === 0 ? firstRef : undefined}
              value={values[field.name] ?? ''}
              inputMode={field.min !== undefined || field.max !== undefined ? 'numeric' : 'text'}
              aria-invalid={invalid ? true : undefined}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            />
            {field.suffix && <small>{field.suffix}</small>}
          </label>
        ))}
        {invalid && <p className="input-dialog-error" role="alert">{invalid}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={Boolean(invalid)}>{confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}
