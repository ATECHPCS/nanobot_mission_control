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

export const FURNITURE_COMPONENTS: Record<FurnitureKind, React.FC<FurnitureProps>> = {
  'desk': Placeholder,
  'whiteboard': Placeholder,
  'coffee-machine': Placeholder,
  'plant': Placeholder,
  'server-rack': Placeholder,
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
