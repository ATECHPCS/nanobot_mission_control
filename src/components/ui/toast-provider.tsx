'use client'

import { createContext, useContext, useCallback, useState, useRef } from 'react'
import { Toast, type ToastMessage, type ToastType } from './toast'

interface ToastContext {
  show: (opts: { message: string; type: ToastType; duration?: number }) => void
}

const ToastCtx = createContext<ToastContext>({ show: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextIdRef = useRef(1)

  const show = useCallback(({ message, type, duration }: { message: string; type: ToastType; duration?: number }) => {
    const id = nextIdRef.current++
    setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {/* Toast container - fixed bottom right */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
