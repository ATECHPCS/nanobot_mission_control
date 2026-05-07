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

function Bookshelf({ palette, size = 32 }: FurnitureProps) {
  const shelves = [
    { y: 4, books: ['accent', 'detail', 'accent', 'primary', 'detail'] },
    { y: 14, books: ['detail', 'accent', 'detail', 'primary', 'accent'] },
    { y: 24, books: ['primary', 'detail', 'accent', 'detail', 'accent'] },
    { y: 34, books: ['accent', 'primary', 'detail', 'accent', 'detail'] },
  ] as const
  const colorFor = (k: 'accent' | 'detail' | 'primary') =>
    k === 'accent' ? palette.accent : k === 'detail' ? palette.detail : palette.primary

  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 36 50" fill="none">
      <rect x="2" y="2" width="32" height="46" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {shelves.map((s, si) => (
        <g key={si}>
          <line x1="2" y1={s.y + 9} x2="34" y2={s.y + 9} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
          {s.books.map((b, bi) => (
            <rect key={bi}
                  x={4 + bi * 5.5} y={s.y}
                  width="5" height="9" rx="0.3"
                  fill={colorFor(b)} stroke={OUTLINE_COLOR} strokeWidth="0.5" />
          ))}
        </g>
      ))}
    </svg>
  )
}

function ReadingChair({ palette, size = 30 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 36 32" fill="none">
      <path d="M5 12 Q5 4 18 4 Q31 4 31 12 L31 22 L5 22 Z"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="6" y="20" width="24" height="6" rx="2"
            fill={palette.accent} opacity="0.85" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="2" y="14" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="30" y="14" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="6" y="28" width="2" height="3" fill={palette.detail} />
      <rect x="28" y="28" width="2" height="3" fill={palette.detail} />
    </svg>
  )
}

function FloorLamp({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 2.1} viewBox="0 0 24 50" fill="none">
      <circle cx="12" cy="12" r="9" fill={palette.accent} opacity="0.25" />
      <path d="M5 12 L8 2 L16 2 L19 12 Z"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="11" y="12" width="2" height="32" fill={palette.detail} />
      <rect x="6" y="43" width="12" height="4" rx="1"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
    </svg>
  )
}

function Couch({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.47} viewBox="0 0 60 28" fill="none">
      <rect x="4" y="4" width="52" height="14" rx="3"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="6"  y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <rect x="22" y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <rect x="38" y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <rect x="2"  y="8" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="54" y="8" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="6"  y="22" width="3" height="3" fill={palette.detail} />
      <rect x="51" y="22" width="3" height="3" fill={palette.detail} />
    </svg>
  )
}

function Fridge({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.83} viewBox="0 0 24 44" fill="none">
      <rect x="2" y="2" width="20" height="40" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <line x1="2" y1="14" x2="22" y2="14" stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="14" y="8" width="6" height="2" rx="0.5" fill={palette.detail} />
      <rect x="14" y="20" width="6" height="2" rx="0.5" fill={palette.detail} />
      <circle cx="5" cy="6" r="0.9" fill={palette.accent} />
    </svg>
  )
}

function SnackTable({ palette, size = 28 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.69} viewBox="0 0 32 22" fill="none">
      <ellipse cx="16" cy="10" rx="14" ry="4"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="14" y="13" width="4" height="7" fill={palette.detail} />
      <rect x="10" y="19" width="12" height="2" rx="0.5" fill={palette.detail} />
      <rect x="9" y="5" width="4" height="4" rx="0.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.5" />
      <ellipse cx="11" cy="5" rx="2" ry="0.7" fill="#3b2a1a" />
      <circle cx="20" cy="7" r="1.5" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      <circle cx="23" cy="9" r="1.2" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
    </svg>
  )
}

function ConferenceTable({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.53} viewBox="0 0 60 32" fill="none">
      {[12, 22, 32, 42, 50].map(x => (
        <rect key={`top-${x}`} x={x - 3} y="2" width="6" height="5" rx="1" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      ))}
      {[12, 22, 32, 42, 50].map(x => (
        <rect key={`bot-${x}`} x={x - 3} y="25" width="6" height="5" rx="1" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      ))}
      <ellipse cx="30" cy="16" rx="26" ry="9"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="20" y="13" width="4" height="3" fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      <rect x="38" y="14" width="4" height="3" fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
    </svg>
  )
}

function StickyNoteWall({ palette, size = 32 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.89} viewBox="0 0 36 32" fill="none">
      <rect x="1" y="1" width="34" height="30" rx="1"
            fill="#e7e5e4" opacity="0.4" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="3"  y="4"  width="10" height="10" rx="0.5" fill="#fde047" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-3 8 9)" />
      <rect x="15" y="3"  width="10" height="10" rx="0.5" fill="#f9a8d4" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(2 20 8)" />
      <rect x="25" y="6"  width="10" height="10" rx="0.5" fill="#bae6fd" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-2 30 11)" />
      <rect x="9"  y="17" width="10" height="10" rx="0.5" fill="#bbf7d0" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(4 14 22)" />
      <rect x="22" y="18" width="10" height="10" rx="0.5" fill="#fed7aa" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-1 27 23)" />
      <rect x="1" y="1" width="34" height="2" fill={palette.accent} opacity="0.4" />
    </svg>
  )
}

function Poster({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.33} viewBox="0 0 24 32" fill="none">
      <rect x="1.5" y="1.5" width="21" height="29" rx="0.5"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="3" y="3" width="18" height="26" rx="0.3" fill="#fff" />
      <circle cx="9" cy="11" r="4" fill={palette.accent} opacity="0.85" />
      <rect x="11" y="14" width="8" height="8" fill={palette.primary} opacity="0.85" />
      <path d="M5 26 L11 18 L17 26 Z" fill={palette.detail} opacity="0.7" />
    </svg>
  )
}

function PhoneBooth({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 2.08} viewBox="0 0 24 50" fill="none">
      <rect x="2" y="2" width="20" height="46" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      <rect x="4" y="6" width="16" height="22" rx="0.5"
            fill={palette.detail} opacity="0.55" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <line x1="12" y1="6" x2="12" y2="46" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <circle cx="14" cy="32" r="0.8" fill={palette.detail} />
      <rect x="6" y="11" width="6" height="2" rx="0.6" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      <rect x="6" y="2.3" width="12" height="2" fill={palette.accent} opacity="0.8" />
    </svg>
  )
}

function Bench({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.4} viewBox="0 0 60 24" fill="none">
      <rect x="3" y="2" width="54" height="6" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="2" y="9" width="56" height="6" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="5"  y="15" width="3" height="7" fill={palette.detail} />
      <rect x="22" y="15" width="3" height="7" fill={palette.detail} />
      <rect x="35" y="15" width="3" height="7" fill={palette.detail} />
      <rect x="52" y="15" width="3" height="7" fill={palette.detail} />
    </svg>
  )
}

function MagazineTable({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.79} viewBox="0 0 28 22" fill="none">
      <ellipse cx="14" cy="9" rx="12" ry="3.5"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="9" y="4" width="10" height="6" rx="0.3"
            fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
      <rect x="10" y="5" width="8" height="1" fill={palette.accent} opacity="0.7" />
      <rect x="10" y="7" width="6" height="1" fill={palette.detail} opacity="0.6" />
      <rect x="12" y="12" width="4" height="6" fill={palette.detail} />
      <rect x="9" y="18" width="10" height="2" rx="0.5" fill={palette.detail} />
    </svg>
  )
}

export const FURNITURE_COMPONENTS: Record<FurnitureKind, React.FC<FurnitureProps>> = {
  'desk': Desk,
  'whiteboard': Whiteboard,
  'coffee-machine': CoffeeMachine,
  'plant': Plant,
  'server-rack': ServerRack,
  'bookshelf': Bookshelf,
  'reading-chair': ReadingChair,
  'floor-lamp': FloorLamp,
  'couch': Couch,
  'fridge': Fridge,
  'snack-table': SnackTable,
  'conference-table': ConferenceTable,
  'sticky-note-wall': StickyNoteWall,
  'poster': Poster,
  'phone-booth': PhoneBooth,
  'bench': Bench,
  'magazine-table': MagazineTable,
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
