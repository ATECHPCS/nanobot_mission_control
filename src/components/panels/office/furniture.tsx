// src/components/panels/office/furniture.tsx
import type React from 'react'
import type { ZonePalette } from '@/lib/office-layout'

export type { ZonePalette }

export const OUTLINE_COLOR = 'rgba(0,0,0,0.4)'

export type FurnitureKind =
  | 'desk' | 'whiteboard' | 'coffee-machine' | 'plant' | 'server-rack'
  | 'bookshelf' | 'reading-chair' | 'floor-lamp'
  | 'couch' | 'fridge' | 'snack-table'
  | 'conference-table' | 'sticky-note-wall' | 'poster'
  | 'phone-booth'
  | 'bench' | 'magazine-table'
  | 'lab-bench' | 'lab-terminal'
  | 'monitor-stack'
  | 'filing-cabinet' | 'cubicle-divider'
  | 'plant-tall' | 'plant-hanging'
  | 'wall-clock' | 'rug' | 'paper'

export interface FurnitureProps {
  palette: ZonePalette
  size?: number
  /** Used by `rug` only — explicit width as % of room. Ignored by other kinds. */
  w?: number
  /** Used by `rug` only — explicit height as % of room. Ignored by other kinds. */
  h?: number
}

// Placeholder component: a simple box. Tasks 3-11 replace these with real SVGs.
function Placeholder({ palette, size = 36 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 36 25" fill="none">
      <rect x="2" y="2" width="32" height="21" rx="2"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
    </svg>
  )
}

function Desk({ palette, size = 36 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 40 26" fill="none">
      {/* tabletop */}
      <rect x="2" y="14" width="36" height="6" rx="1"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* legs */}
      <rect x="4" y="20" width="3" height="5" fill={palette.detail} />
      <rect x="33" y="20" width="3" height="5" fill={palette.detail} />
      {/* monitor */}
      <rect x="10" y="2" width="14" height="9" rx="1"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="11" y="3" width="12" height="7" fill={palette.accent} opacity="0.85" />
      <rect x="15" y="11" width="4" height="3" fill={palette.detail} />
      {/* keyboard */}
      <rect x="26" y="15" width="10" height="3" rx="0.5"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
    </svg>
  )
}

function Whiteboard({ palette, size = 40 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 50 35" fill="none">
      {/* board */}
      <rect x="3" y="2" width="44" height="26" rx="2"
            fill="#f5f5f5" stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* marker scribbles */}
      <line x1="8" y1="9" x2="22" y2="9" stroke={palette.accent} strokeWidth="1.2" />
      <line x1="8" y1="14" x2="30" y2="14" stroke={palette.detail} strokeWidth="1" />
      <line x1="8" y1="19" x2="18" y2="19" stroke={palette.accent} strokeWidth="1.2" />
      <circle cx="38" cy="13" r="2" fill={palette.accent} opacity="0.7" />
      {/* tray + stand */}
      <rect x="3" y="28" width="44" height="2" fill={palette.detail} />
      <rect x="23" y="30" width="4" height="4" fill={palette.detail} />
    </svg>
  )
}

function CoffeeMachine({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 22 28" fill="none">
      {/* body */}
      <rect x="2" y="6" width="18" height="20" rx="2"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* display */}
      <rect x="5" y="9" width="12" height="6" rx="1" fill={palette.detail} />
      <circle cx="11" cy="12" r="1.6" fill={palette.accent} opacity="0.85" />
      {/* drip tray */}
      <rect x="6" y="20" width="10" height="4" rx="1" fill={palette.detail} />
      {/* steam */}
      <path d="M9 4 Q10 2 11 4 Q12 2 13 4" stroke="#d8dee9" strokeWidth="0.8" opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

function Plant({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 22 28" fill="none">
      {/* pot */}
      <path d="M5 18 L17 18 L15 26 L7 26 Z"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* leaves */}
      <ellipse cx="11" cy="11" rx="7" ry="9" fill="#4ade80" stroke={OUTLINE_COLOR} strokeWidth="1" />
      <ellipse cx="9" cy="9" rx="3" ry="4" fill="#86efac" opacity="0.9" />
      <ellipse cx="13" cy="13" rx="3" ry="4" fill="#22c55e" opacity="0.85" />
    </svg>
  )
}

function ServerRack({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 24 36" fill="none">
      {/* chassis */}
      <rect x="2" y="2" width="20" height="32" rx="2"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* server units */}
      {[6, 13, 20, 27].map((y, i) => (
        <g key={y}>
          <rect x="4" y={y} width="16" height="5" rx="0.5" fill={palette.detail} />
          <circle cx="17" cy={y + 2.5} r="1" fill={palette.accent}>
            <animate attributeName="opacity" values="1;0.3;1" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  )
}

export const FURNITURE_COMPONENTS: Record<FurnitureKind, React.FC<FurnitureProps>> = {
  'desk': Desk,
  'whiteboard': Whiteboard,
  'coffee-machine': CoffeeMachine,
  'plant': Plant,
  'server-rack': ServerRack,
  'bookshelf': Placeholder,
  'reading-chair': Placeholder,
  'floor-lamp': Placeholder,
  'couch': Placeholder,
  'fridge': Placeholder,
  'snack-table': Placeholder,
  'conference-table': Placeholder,
  'sticky-note-wall': Placeholder,
  'poster': Placeholder,
  'phone-booth': Placeholder,
  'bench': Placeholder,
  'magazine-table': Placeholder,
  'lab-bench': Placeholder,
  'lab-terminal': Placeholder,
  'monitor-stack': Placeholder,
  'filing-cabinet': Placeholder,
  'cubicle-divider': Placeholder,
  'plant-tall': Placeholder,
  'plant-hanging': Placeholder,
  'wall-clock': Placeholder,
  'rug': Placeholder,
  'paper': Placeholder,
}
