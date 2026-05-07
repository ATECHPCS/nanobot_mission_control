// src/components/panels/office/activity-glyph.tsx
import type { ActivityKind } from '@/lib/agent-activity'

interface ActivityGlyphProps {
  kind: ActivityKind
  size?: number
}

const GLYPH: Record<ActivityKind, string> = {
  typing:      '⌨️',
  reading:     '📖',
  searching:   '🔍',
  bash:        '>_',
  'on-call':   '☎️',
  'in-meeting':'👥',
  thinking:    '💭',
  blocked:     '⏳',
  idle:        '☕',
  error:       '💢',
}

export function ActivityGlyph({ kind, size = 14 }: ActivityGlyphProps) {
  const isText = kind === 'bash'
  return (
    <div
      className="absolute -translate-x-1/2 pointer-events-none select-none font-mono"
      style={{
        left: '50%',
        top: `-${size + 6}px`,
        fontSize: `${size}px`,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {isText
        ? <span className="text-emerald-400 bg-black/60 px-1 rounded text-[10px]">{GLYPH[kind]}</span>
        : <span>{GLYPH[kind]}</span>}
    </div>
  )
}
