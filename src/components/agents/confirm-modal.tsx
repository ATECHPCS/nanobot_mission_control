'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] bg-card border border-border rounded-lg shadow-2xl max-w-sm w-[calc(100%-2rem)] p-4"
      >
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-4">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
