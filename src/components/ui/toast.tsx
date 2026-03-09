'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: number
  message: string
  type: ToastType
  duration?: number
}

const typeStyles: Record<ToastType, string> = {
  info: 'border-primary/50 bg-primary/10 text-primary',
  success: 'border-success/50 bg-success/10 text-success',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 200)
    }, toast.duration ?? 4000)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border text-sm shadow-lg backdrop-blur-sm transition-all duration-200',
        typeStyles[toast.type],
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
      )}
    >
      {toast.message}
    </div>
  )
}
