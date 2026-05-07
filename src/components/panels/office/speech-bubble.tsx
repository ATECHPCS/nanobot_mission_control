// src/components/panels/office/speech-bubble.tsx
'use client'

import { useEffect } from 'react'

interface SpeechBubbleProps {
  text: string
  /** ms before fading out */
  durationMs?: number
  onDismiss: () => void
}

export function SpeechBubble({ text, durationMs = 6000, onDismiss }: SpeechBubbleProps) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(id)
  }, [durationMs, onDismiss])

  return (
    <div
      className="absolute -translate-x-1/2 pointer-events-none whitespace-nowrap"
      style={{
        left: '50%',
        bottom: '120%',
        animation: 'bubble-fade 6s ease-in-out forwards',
      }}
    >
      <div className="font-mono text-[10px] sm:text-[11px] bg-card/95 text-foreground border border-border rounded-md px-2 py-1 shadow-lg">
        {text}
      </div>
      <style jsx>{`
        @keyframes bubble-fade {
          0%   { opacity: 0; transform: translate(-50%, 6px); }
          5%   { opacity: 1; transform: translate(-50%, 0); }
          90%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -4px); }
        }
      `}</style>
    </div>
  )
}
