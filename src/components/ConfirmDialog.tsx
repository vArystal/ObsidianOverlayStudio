import { useEffect, useId, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible confirmation surface. Replaces window.confirm so destructive actions
 * look like part of the studio and can be cancelled with Escape or the backdrop.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', destructive = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const headingId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    confirmRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" className={`secondary-button ${destructive ? 'danger-button' : 'primary-button'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
