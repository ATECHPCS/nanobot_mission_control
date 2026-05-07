# Office Furniture Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 minimalist gray furniture SVGs with a 27-piece chunky-cartoon vocabulary, add per-zone color palettes and CSS floor treatments, and lay out each room with 4-8 pieces so it reads as the right kind of space at a glance.

**Architecture:** A new self-contained `src/components/panels/office/furniture.tsx` exports 27 typed function components plus a `FURNITURE_COMPONENTS` registry. `src/lib/office-layout.ts` gains `palette` and `floorPattern` fields on `RoomDefinition` and absorbs the `ROOM_FURNITURE` data table from the panel. `src/components/panels/office-panel.tsx` deletes its inline furniture and renders pieces from the registry, threading the room's palette through and applying the floor pattern as a CSS background-image.

**Tech Stack:** TypeScript, React 19, SVG, Tailwind, Vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-07-office-furniture-redesign-design.md`

## Note on SVG art

Furniture pieces are visual art. The plan provides:
- **Full SVG code** for the 5 anchor pieces (the redrawn existing furniture) and 1-2 reference examples per new visual cluster — implementers should match this style.
- **Structural specs** for the other new pieces: identity, viewBox/aspect-ratio, ordered list of shapes, and which palette role each shape uses. Implementers draw the SVG following the reference style.

A "structural spec" is not a placeholder — it gives the implementer the same information a real-world design brief would: dimensions, key shapes, and color roles. Style consistency comes from the anchors and from the global rules below.

### Global SVG style rules

- Outline color: `OUTLINE_COLOR = 'rgba(0,0,0,0.4)'`
- Outline `strokeWidth`: 1-1.2 for main shapes, 0.5-0.8 for details
- All `fill` values are either palette role colors (`palette.primary`, `palette.accent`, `palette.detail`) or hard-coded neutrals (`'#fff'`, `'#000'`, transparent) — never a hard-coded brand color.
- All pieces are flat (no gradients, no shadows beyond what the existing pieces already have).
- Animations only on the existing pieces that already animate (coffee steam, server LEDs).
- Components scale from a `size` prop. Default `size = 36`. Each piece has a fixed aspect ratio determined by its viewBox; height is computed as `size * (viewBox.h / viewBox.w)`.

---

## File map

### New files
- `src/components/panels/office/furniture.tsx` — all 27 furniture SVG components, `FurnitureKind` union, `ZonePalette` interface re-export, `FurnitureProps`, `FURNITURE_COMPONENTS` registry, `OUTLINE_COLOR` constant.
- `src/components/panels/office/__tests__/furniture-registry.test.ts` — tests that every `FurnitureKind` is present in `FURNITURE_COMPONENTS` (catches "added to union, forgot to add to registry").

### Modified files
- `src/lib/office-layout.ts` — add `ZonePalette` interface and the `palette`/`floorPattern` fields on `RoomDefinition`. Populate `ROOM_DEFS` with palette + floor data. Move `ROOM_FURNITURE` here from the panel; reshape entries to `{ kind: FurnitureKind, x, y, w?, h? }`.
- `src/components/panels/office-panel.tsx` — delete the 5 inline furniture components, the `ROOM_FURNITURE` constant, and the local `FurnitureComponents` map. Import from the new modules. Update `OfficeRoom` to thread palette + floorPattern.

### Touched but not redesigned
- `src/components/panels/office/walking-crewmate.tsx`, `speech-bubble.tsx`, `activity-glyph.tsx` — unchanged. (Mentioned only because they live in the same directory as the new `furniture.tsx`.)

---

# Tasks

## Task 1: Add ZonePalette interface and palette/floorPattern fields

**Files:** Modify `src/lib/office-layout.ts`

- [ ] **Step 1: Add the ZonePalette interface near the top of the file**

Add after the existing `import` statements and before `RoomId`:

```ts
export interface ZonePalette {
  primary: string
  accent: string
  detail: string
  outline?: string  // defaults to 'rgba(0,0,0,0.4)' in furniture
}
```

- [ ] **Step 2: Extend `RoomDefinition` interface**

Find `RoomDefinition` and add two fields:

```ts
export interface RoomDefinition {
  id: RoomId
  label: string
  color: string
  wallColor: string
  x: number
  y: number
  w: number
  h: number
  palette: ZonePalette
  floorPattern: string | null  // CSS background-image value
}
```

- [ ] **Step 3: Populate ROOM_DEFS**

Replace the existing `ROOM_DEFS` array entries with the same room layout, but add `palette` and `floorPattern` per the spec. Use this exact set:

```ts
export const ROOM_DEFS: RoomDefinition[] = [
  {
    id: 'home-main', label: 'Main Office',
    color: 'border-cyan-500/40 bg-cyan-500/8', wallColor: '#0c1a2e',
    x:  2, y:  4, w: 22, h: 44,
    palette: { primary: '#d4b896', accent: '#22d3ee', detail: '#7c5e3a' },
    floorPattern: 'radial-gradient(circle at 4px 4px, rgba(255,255,255,0.04) 1px, transparent 1.2px) 0 0/8px 8px',
  },
  {
    id: 'home-session', label: 'Session Pool',
    color: 'border-violet-500/40 bg-violet-500/8', wallColor: '#140c24',
    x:  2, y: 52, w: 22, h: 44,
    palette: { primary: '#334155', accent: '#a78bfa', detail: '#f0abfc' },
    floorPattern: 'linear-gradient(rgba(255,255,255,0.02), rgba(0,0,0,0.05))',
  },
  {
    id: 'home-gsd', label: 'GSD Wing',
    color: 'border-emerald-500/40 bg-emerald-500/8', wallColor: '#0c1a14',
    x: 76, y:  4, w: 22, h: 44,
    palette: { primary: '#86efac', accent: '#10b981', detail: '#065f46' },
    floorPattern: 'radial-gradient(circle at 4px 4px, rgba(134,239,172,0.05) 1px, transparent 1.2px) 0 0/8px 8px',
  },
  {
    id: 'break-room', label: 'Break Room',
    color: 'border-slate-500/30 bg-slate-500/6', wallColor: '#12141a',
    x: 76, y: 52, w: 22, h: 44,
    palette: { primary: '#a16940', accent: '#fbbf24', detail: '#78350f' },
    floorPattern: 'repeating-linear-gradient(90deg, rgba(122,72,42,0.10) 0 30px, rgba(70,40,20,0.10) 30px 32px)',
  },
  {
    id: 'library', label: 'Library',
    color: 'border-amber-500/40 bg-amber-500/8', wallColor: '#1a1408',
    x: 28, y:  6, w: 20, h: 22,
    palette: { primary: '#92400e', accent: '#f59e0b', detail: '#fde68a' },
    floorPattern: 'repeating-linear-gradient(90deg, rgba(146,64,14,0.14) 0 36px, rgba(100,40,8,0.14) 36px 38px)',
  },
  {
    id: 'lab', label: 'Lab',
    color: 'border-rose-500/40 bg-rose-500/8', wallColor: '#1a0c14',
    x: 52, y:  6, w: 20, h: 22,
    palette: { primary: '#cbd5e1', accent: '#fb7185', detail: '#22d3ee' },
    floorPattern: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/24px 24px',
  },
  {
    id: 'phone-booth', label: 'Phone Booths',
    color: 'border-sky-500/40 bg-sky-500/8', wallColor: '#0c1620',
    x: 28, y: 32, w: 20, h: 18,
    palette: { primary: '#1e3a8a', accent: '#38bdf8', detail: '#facc15' },
    floorPattern: 'radial-gradient(circle at 4px 4px, rgba(56,189,248,0.04) 1px, transparent 1.2px) 0 0/8px 8px',
  },
  {
    id: 'war-room', label: 'War Room',
    color: 'border-orange-500/40 bg-orange-500/8', wallColor: '#1a1208',
    x: 52, y: 32, w: 20, h: 18,
    palette: { primary: '#d97706', accent: '#fb923c', detail: '#fde68a' },
    floorPattern: 'repeating-linear-gradient(90deg, rgba(120,60,15,0.14) 0 40px, rgba(80,40,10,0.14) 40px 43px)',
  },
  {
    id: 'workshop', label: 'Workshop',
    color: 'border-teal-500/40 bg-teal-500/8', wallColor: '#0c1a18',
    x: 28, y: 54, w: 44, h: 24,
    palette: { primary: '#94a3b8', accent: '#14b8a6', detail: '#5eead4' },
    floorPattern: 'linear-gradient(rgba(255,255,255,0.015), rgba(0,0,0,0.04))',
  },
  {
    id: 'waiting-bench', label: 'Waiting Bench',
    color: 'border-yellow-500/40 bg-yellow-500/6', wallColor: '#1a1808',
    x: 28, y: 82, w: 44, h: 12,
    palette: { primary: '#ca8a04', accent: '#facc15', detail: '#fef3c7' },
    floorPattern: 'linear-gradient(rgba(250,204,21,0.06) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(250,204,21,0.06) 1px, transparent 1px) 0 0/28px 28px',
  },
]
```

- [ ] **Step 4: Verify**

Run from the repo: `pnpm typecheck`
Expected: PASS (existing callers don't access the new fields; the panel will be updated in Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/lib/office-layout.ts
git commit -m "feat(office): per-zone palette and floor pattern fields"
```

## Task 2: Furniture module skeleton + registry test

**Files:**
- Create: `src/components/panels/office/furniture.tsx`
- Create: `src/components/panels/office/__tests__/furniture-registry.test.ts`

- [ ] **Step 1: Write the registry coverage test (failing)**

```ts
// src/components/panels/office/__tests__/furniture-registry.test.ts
import { describe, it, expect } from 'vitest'
import { FURNITURE_COMPONENTS, type FurnitureKind } from '../furniture'

const ALL_KINDS: FurnitureKind[] = [
  'desk', 'whiteboard', 'coffee-machine', 'plant', 'server-rack',
  'bookshelf', 'reading-chair', 'floor-lamp',
  'couch', 'fridge', 'snack-table',
  'conference-table', 'sticky-note-wall', 'poster',
  'phone-booth',
  'bench', 'magazine-table',
  'lab-bench', 'lab-terminal',
  'monitor-stack',
  'filing-cabinet', 'cubicle-divider',
  'plant-tall', 'plant-hanging',
  'wall-clock', 'rug', 'paper',
]

describe('FURNITURE_COMPONENTS registry', () => {
  it('has 27 distinct kinds', () => {
    expect(ALL_KINDS).toHaveLength(27)
    expect(new Set(ALL_KINDS).size).toBe(27)
  })

  it('has a component for every FurnitureKind', () => {
    for (const kind of ALL_KINDS) {
      expect(FURNITURE_COMPONENTS[kind]).toBeDefined()
      expect(typeof FURNITURE_COMPONENTS[kind]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/panels/office/__tests__/furniture-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the furniture module skeleton with placeholder components**

```tsx
// src/components/panels/office/furniture.tsx
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

// Placeholder component: a simple box. Tasks 4-8 replace these with real SVGs.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/panels/office/__tests__/furniture-registry.test.ts`
Expected: 2 tests passing.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx src/components/panels/office/__tests__/furniture-registry.test.ts
git commit -m "feat(office): furniture module skeleton and registry test"
```

## Task 3: Redraw the 5 anchor pieces (Desk, Whiteboard, CoffeeMachine, Plant, ServerRack)

**Files:** Modify `src/components/panels/office/furniture.tsx`

These 5 pieces are the **style anchors** for the new aesthetic. Each must use only palette roles + neutrals + `OUTLINE_COLOR`. Replace the 5 corresponding `Placeholder` registry entries with these implementations. Place the function declarations above the registry.

- [ ] **Step 1: Add `Desk` component**

```tsx
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
```

- [ ] **Step 2: Add `Whiteboard` component**

```tsx
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
```

- [ ] **Step 3: Add `CoffeeMachine` component**

```tsx
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
```

- [ ] **Step 4: Add `Plant` component (small potted)**

```tsx
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
```

- [ ] **Step 5: Add `ServerRack` component**

```tsx
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
```

- [ ] **Step 6: Wire the 5 anchors into the registry**

Replace these 5 entries in `FURNITURE_COMPONENTS`:

```tsx
'desk': Desk,
'whiteboard': Whiteboard,
'coffee-machine': CoffeeMachine,
'plant': Plant,
'server-rack': ServerRack,
```

The other 22 stay on `Placeholder` for now.

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm vitest run src/components/panels/office/__tests__/furniture-registry.test.ts && pnpm lint`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): redraw 5 anchor furniture pieces with palette"
```

## Task 4: Library set — Bookshelf, ReadingChair, FloorLamp

**Files:** Modify `src/components/panels/office/furniture.tsx`

Add three components, each with the structural specs below. Match the style of the anchor pieces from Task 3 (chunky outlines, flat palette fills, viewBox sized so `size = 36` looks right at the room scale).

- [ ] **Step 1: Add `Bookshelf` component**

Identity: tall narrow shelf with 4 horizontal shelves of multi-colored book spines.
viewBox: `0 0 36 50` (aspect ratio ~0.72)

Reference implementation:

```tsx
function Bookshelf({ palette, size = 32 }: FurnitureProps) {
  // 4 shelves at y = 12, 22, 32, 42 (top of each shelf)
  // Each shelf has 5-6 book spines (rectangles) in mixed accent/detail/primary colors
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
      {/* frame */}
      <rect x="2" y="2" width="32" height="46" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {shelves.map((s, si) => (
        <g key={si}>
          {/* shelf line */}
          <line x1="2" y1={s.y + 9} x2="34" y2={s.y + 9} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
          {/* book spines */}
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
```

- [ ] **Step 2: Add `ReadingChair` component**

Identity: comfy armchair with a cushion bump, rounded back.
viewBox: `0 0 36 32` (aspect ratio ~1.13)

Implementation:

```tsx
function ReadingChair({ palette, size = 30 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 36 32" fill="none">
      {/* backrest */}
      <path d="M5 12 Q5 4 18 4 Q31 4 31 12 L31 22 L5 22 Z"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* cushion */}
      <rect x="6" y="20" width="24" height="6" rx="2"
            fill={palette.accent} opacity="0.85" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* armrests */}
      <rect x="2" y="14" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="30" y="14" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* legs */}
      <rect x="6" y="28" width="2" height="3" fill={palette.detail} />
      <rect x="28" y="28" width="2" height="3" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 3: Add `FloorLamp` component**

Identity: tall thin pole with tilted lamp shade emitting accent glow.
viewBox: `0 0 24 50` (tall — aspect ratio ~0.48)

Structural spec:
- A small base rectangle at the bottom (`x=8 y=44 width=8 height=4`, `fill=palette.detail`, outlined)
- A thin vertical pole (`x=11 y=10 width=2 height=34`, `fill=palette.detail`)
- A tilted lampshade trapezoid near the top — looks like an isoceles trapezoid: top width ~8, bottom width ~14, centered around x=12, y=2 to y=12. Use a `<path>` with `fill=palette.primary`, outlined.
- A soft glow circle behind the shade: `<circle cx=12 cy=12 r=8 fill=palette.accent opacity=0.3>` (renders before the shade for the glow halo)

```tsx
function FloorLamp({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 2.1} viewBox="0 0 24 50" fill="none">
      {/* glow halo */}
      <circle cx="12" cy="12" r="9" fill={palette.accent} opacity="0.25" />
      {/* shade */}
      <path d="M5 12 L8 2 L16 2 L19 12 Z"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* pole */}
      <rect x="11" y="12" width="2" height="32" fill={palette.detail} />
      {/* base */}
      <rect x="6" y="43" width="12" height="4" rx="1"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

Replace these 3 entries:

```tsx
'bookshelf': Bookshelf,
'reading-chair': ReadingChair,
'floor-lamp': FloorLamp,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run src/components/panels/office/__tests__/furniture-registry.test.ts && pnpm lint`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): library furniture set (bookshelf, reading chair, floor lamp)"
```

## Task 5: Break Room set — Couch, Fridge, SnackTable

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `Couch` component**

Identity: wide 3-seat sofa — long horizontal back, three cushion dimples, two armrests.
viewBox: `0 0 60 28` (aspect ratio ~2.14, wide)

```tsx
function Couch({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.47} viewBox="0 0 60 28" fill="none">
      {/* backrest */}
      <rect x="4" y="4" width="52" height="14" rx="3"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* cushions */}
      <rect x="6"  y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <rect x="22" y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      <rect x="38" y="14" width="14" height="8" rx="2" fill={palette.accent} opacity="0.8" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      {/* armrests */}
      <rect x="2"  y="8" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="54" y="8" width="4" height="14" rx="1.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* feet */}
      <rect x="6"  y="22" width="3" height="3" fill={palette.detail} />
      <rect x="51" y="22" width="3" height="3" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 2: Add `Fridge` component**

Identity: tall narrow appliance with one horizontal seam (separating freezer from fridge), two handles, small status dot.
viewBox: `0 0 24 44` (aspect ratio ~0.55)

Structural spec:
- Outer rect: `x=2 y=2 width=20 height=40 rx=1.5` `fill=palette.primary` outlined
- Horizontal seam at `y=14`: `<line x1=2 y1=14 x2=22 y2=14 stroke=OUTLINE_COLOR strokeWidth=1>` (divides freezer/fridge)
- Top handle: `<rect x=14 y=8 width=6 height=2 rx=0.5 fill=palette.detail>`
- Bottom handle: `<rect x=14 y=20 width=6 height=2 rx=0.5 fill=palette.detail>`
- Status dot: `<circle cx=5 cy=6 r=0.8 fill=palette.accent>` (small light)

```tsx
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
```

- [ ] **Step 3: Add `SnackTable` component**

Identity: small round low table with a coffee cup and cookies on top.
viewBox: `0 0 32 22` (aspect ratio ~1.45)

```tsx
function SnackTable({ palette, size = 28 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.69} viewBox="0 0 32 22" fill="none">
      {/* tabletop ellipse */}
      <ellipse cx="16" cy="10" rx="14" ry="4"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* leg */}
      <rect x="14" y="13" width="4" height="7" fill={palette.detail} />
      <rect x="10" y="19" width="12" height="2" rx="0.5" fill={palette.detail} />
      {/* coffee cup */}
      <rect x="9" y="5" width="4" height="4" rx="0.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.5" />
      <ellipse cx="11" cy="5" rx="2" ry="0.7" fill="#3b2a1a" />
      {/* cookies */}
      <circle cx="20" cy="7" r="1.5" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      <circle cx="23" cy="9" r="1.2" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

```tsx
'couch': Couch,
'fridge': Fridge,
'snack-table': SnackTable,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass; no test count regression.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): break room furniture set (couch, fridge, snack table)"
```

## Task 6: War Room + GSD shared — ConferenceTable, StickyNoteWall, Poster

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `ConferenceTable` component**

Identity: long oval table with 6 chair stubs around it (3 on each side).
viewBox: `0 0 60 32` (aspect ratio ~1.88)

```tsx
function ConferenceTable({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.53} viewBox="0 0 60 32" fill="none">
      {/* chair stubs (back, left, right) — render before table so table covers part of them */}
      {[12, 22, 32, 42, 50].map(x => (
        <rect key={`top-${x}`} x={x - 3} y="2" width="6" height="5" rx="1" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      ))}
      {[12, 22, 32, 42, 50].map(x => (
        <rect key={`bot-${x}`} x={x - 3} y="25" width="6" height="5" rx="1" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      ))}
      {/* tabletop */}
      <ellipse cx="30" cy="16" rx="26" ry="9"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* small papers on table */}
      <rect x="20" y="13" width="4" height="3" fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      <rect x="38" y="14" width="4" height="3" fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.4" />
    </svg>
  )
}
```

- [ ] **Step 2: Add `StickyNoteWall` component**

Identity: wall section with 4 colored sticky notes (yellow, pink, blue, green).
viewBox: `0 0 36 32` (aspect ratio ~1.13)

Hard-coded sticky-note colors (not from palette — sticky notes have their own brand colors):

```tsx
function StickyNoteWall({ palette, size = 32 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.89} viewBox="0 0 36 32" fill="none">
      {/* wall panel */}
      <rect x="1" y="1" width="34" height="30" rx="1"
            fill="#e7e5e4" opacity="0.4" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* sticky notes */}
      <rect x="3"  y="4"  width="10" height="10" rx="0.5" fill="#fde047" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-3 8 9)" />
      <rect x="15" y="3"  width="10" height="10" rx="0.5" fill="#f9a8d4" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(2 20 8)" />
      <rect x="25" y="6"  width="10" height="10" rx="0.5" fill="#bae6fd" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-2 30 11)" />
      <rect x="9"  y="17" width="10" height="10" rx="0.5" fill="#bbf7d0" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(4 14 22)" />
      <rect x="22" y="18" width="10" height="10" rx="0.5" fill="#fed7aa" stroke={OUTLINE_COLOR} strokeWidth="0.5" transform="rotate(-1 27 23)" />
      {/* hint of palette accent on edges */}
      <rect x="1" y="1" width="34" height="2" fill={palette.accent} opacity="0.4" />
    </svg>
  )
}
```

- [ ] **Step 3: Add `Poster` component**

Identity: small framed poster with abstract geometric shapes inside.
viewBox: `0 0 24 32` (aspect ratio ~0.75)

```tsx
function Poster({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.33} viewBox="0 0 24 32" fill="none">
      {/* frame */}
      <rect x="1.5" y="1.5" width="21" height="29" rx="0.5"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* poster surface */}
      <rect x="3" y="3" width="18" height="26" rx="0.3" fill="#fff" />
      {/* abstract shapes */}
      <circle cx="9" cy="11" r="4" fill={palette.accent} opacity="0.85" />
      <rect x="11" y="14" width="8" height="8" fill={palette.primary} opacity="0.85" />
      <path d="M5 26 L11 18 L17 26 Z" fill={palette.detail} opacity="0.7" />
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

```tsx
'conference-table': ConferenceTable,
'sticky-note-wall': StickyNoteWall,
'poster': Poster,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): conference table, sticky-note wall, poster"
```

## Task 7: PhoneBooth, Bench, MagazineTable

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `PhoneBooth` component**

Identity: tall narrow box with glass top half, door, and a phone handset visible inside.
viewBox: `0 0 24 50` (aspect ratio ~0.48)

```tsx
function PhoneBooth({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 2.08} viewBox="0 0 24 50" fill="none">
      {/* booth body */}
      <rect x="2" y="2" width="20" height="46" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* glass upper portion */}
      <rect x="4" y="6" width="16" height="22" rx="0.5"
            fill={palette.detail} opacity="0.55" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      {/* door seam */}
      <line x1="12" y1="6" x2="12" y2="46" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
      {/* door handle */}
      <circle cx="14" cy="32" r="0.8" fill={palette.detail} />
      {/* phone handset (small) */}
      <rect x="6" y="11" width="6" height="2" rx="0.6" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.4" />
      {/* roof light */}
      <rect x="6" y="2.3" width="12" height="2" fill={palette.accent} opacity="0.8" />
    </svg>
  )
}
```

- [ ] **Step 2: Add `Bench` component**

Identity: long low bench with backrest and 4 legs. Wider than typical pieces.
viewBox: `0 0 60 24` (aspect ratio ~2.5)

```tsx
function Bench({ palette, size = 50 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.4} viewBox="0 0 60 24" fill="none">
      {/* backrest */}
      <rect x="3" y="2" width="54" height="6" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* seat */}
      <rect x="2" y="9" width="56" height="6" rx="1.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* legs */}
      <rect x="5"  y="15" width="3" height="7" fill={palette.detail} />
      <rect x="22" y="15" width="3" height="7" fill={palette.detail} />
      <rect x="35" y="15" width="3" height="7" fill={palette.detail} />
      <rect x="52" y="15" width="3" height="7" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 3: Add `MagazineTable` component**

Identity: small round low table with a magazine on top.
viewBox: `0 0 28 22` (aspect ratio ~1.27)

```tsx
function MagazineTable({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.79} viewBox="0 0 28 22" fill="none">
      {/* tabletop ellipse */}
      <ellipse cx="14" cy="9" rx="12" ry="3.5"
               fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* magazine on top */}
      <rect x="9" y="4" width="10" height="6" rx="0.3"
            fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.5" />
      <rect x="10" y="5" width="8" height="1" fill={palette.accent} opacity="0.7" />
      <rect x="10" y="7" width="6" height="1" fill={palette.detail} opacity="0.6" />
      {/* central pedestal */}
      <rect x="12" y="12" width="4" height="6" fill={palette.detail} />
      <rect x="9" y="18" width="10" height="2" rx="0.5" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

```tsx
'phone-booth': PhoneBooth,
'bench': Bench,
'magazine-table': MagazineTable,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): phone booth, bench, magazine table"
```

## Task 8: Lab + Workshop pieces — LabBench, LabTerminal, MonitorStack

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `LabBench` component**

Identity: wider table with 3 beakers/flasks of different shapes plus a microscope.
viewBox: `0 0 50 30` (aspect ratio ~1.67)

```tsx
function LabBench({ palette, size = 44 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 50 30" fill="none">
      {/* tabletop */}
      <rect x="2" y="16" width="46" height="6" rx="1"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="4"  y="22" width="3" height="6" fill={palette.detail} />
      <rect x="43" y="22" width="3" height="6" fill={palette.detail} />
      {/* beaker (round bottom flask) */}
      <path d="M7 8 L7 11 L4 16 L13 16 L10 11 L10 8 Z"
            fill={palette.detail} opacity="0.65" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* tall cylinder beaker */}
      <rect x="16" y="6" width="6" height="10" rx="0.5"
            fill={palette.accent} opacity="0.55" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* erlenmeyer flask */}
      <path d="M28 7 L28 10 L25 16 L34 16 L31 10 L31 7 Z"
            fill={palette.detail} opacity="0.6" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* microscope */}
      <rect x="38" y="12" width="8" height="4" fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <rect x="40" y="6" width="4" height="6" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <circle cx="42" cy="6" r="2" fill={palette.accent} stroke={OUTLINE_COLOR} strokeWidth="0.6" />
    </svg>
  )
}
```

- [ ] **Step 2: Add `LabTerminal` component**

Identity: a CRT-style monitor on a small base with a green-glow screen.
viewBox: `0 0 30 32` (aspect ratio ~0.94)

```tsx
function LabTerminal({ palette, size = 26 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.07} viewBox="0 0 30 32" fill="none">
      {/* monitor body */}
      <rect x="2" y="2" width="26" height="20" rx="2"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* screen (CRT-rounded) */}
      <rect x="5" y="5" width="20" height="14" rx="1.5"
            fill="#0d2818" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* phosphor glow lines */}
      <line x1="6"  y1="9"  x2="14" y2="9"  stroke="#22c55e" strokeWidth="0.6" opacity="0.85" />
      <line x1="6"  y1="12" x2="20" y2="12" stroke="#22c55e" strokeWidth="0.6" opacity="0.7" />
      <line x1="6"  y1="15" x2="11" y2="15" stroke="#22c55e" strokeWidth="0.6" opacity="0.85" />
      {/* stand + base */}
      <rect x="13" y="22" width="4" height="4" fill={palette.detail} />
      <rect x="9"  y="26" width="12" height="3" rx="0.5" fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
    </svg>
  )
}
```

- [ ] **Step 3: Add `MonitorStack` component**

Identity: two stacked monitors on a small desk surface — one above the other.
viewBox: `0 0 30 26` (aspect ratio ~1.15)

Note: this piece is meant to stack visually onto a `desk` placed below it in the layout. So it's a transparent-base piece — render only the monitors and a thin support post.

```tsx
function MonitorStack({ palette, size = 26 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.87} viewBox="0 0 30 26" fill="none">
      {/* top monitor */}
      <rect x="3" y="1" width="24" height="10" rx="1"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="4" y="2" width="22" height="8" fill={palette.accent} opacity="0.85" />
      {/* bottom monitor */}
      <rect x="3" y="13" width="24" height="10" rx="1"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      <rect x="4" y="14" width="22" height="8" fill={palette.accent} opacity="0.85" />
      {/* support stub */}
      <rect x="14" y="22" width="2" height="3" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

```tsx
'lab-bench': LabBench,
'lab-terminal': LabTerminal,
'monitor-stack': MonitorStack,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): lab bench, lab terminal, monitor stack"
```

## Task 9: Main Office pieces — FilingCabinet, CubicleDivider

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `FilingCabinet` component**

Identity: 3-drawer vertical cabinet, each drawer has a small handle.
viewBox: `0 0 22 36` (aspect ratio ~0.61)

```tsx
function FilingCabinet({ palette, size = 22 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.64} viewBox="0 0 22 36" fill="none">
      {/* body */}
      <rect x="2" y="2" width="18" height="32" rx="1"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* drawer seams */}
      <line x1="2" y1="13" x2="20" y2="13" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <line x1="2" y1="23" x2="20" y2="23" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* handles */}
      <rect x="9" y="7"  width="4" height="1.5" rx="0.4" fill={palette.detail} />
      <rect x="9" y="17" width="4" height="1.5" rx="0.4" fill={palette.detail} />
      <rect x="9" y="27" width="4" height="1.5" rx="0.4" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 2: Add `CubicleDivider` component**

Identity: a low partition wall — short, wide rectangle with a small mounting post on each end.
viewBox: `0 0 40 12` (aspect ratio ~3.33, very wide and short)

```tsx
function CubicleDivider({ palette, size = 36 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 0.3} viewBox="0 0 40 12" fill="none">
      {/* wall panel */}
      <rect x="3" y="2" width="34" height="6" rx="0.5"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* fabric texture (3 vertical lines) */}
      <line x1="14" y1="2" x2="14" y2="8" stroke={OUTLINE_COLOR} strokeWidth="0.4" opacity="0.5" />
      <line x1="20" y1="2" x2="20" y2="8" stroke={OUTLINE_COLOR} strokeWidth="0.4" opacity="0.5" />
      <line x1="26" y1="2" x2="26" y2="8" stroke={OUTLINE_COLOR} strokeWidth="0.4" opacity="0.5" />
      {/* mounting posts */}
      <rect x="2"  y="3" width="2" height="7" fill={palette.detail} />
      <rect x="36" y="3" width="2" height="7" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 3: Wire into registry**

```tsx
'filing-cabinet': FilingCabinet,
'cubicle-divider': CubicleDivider,
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): filing cabinet and cubicle divider"
```

## Task 10: Plant variants — PlantTall, PlantHanging

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `PlantTall` (fiddle-leaf style)**

Identity: tall stem with 5-6 broad oval leaves, in a small pot at the base.
viewBox: `0 0 28 50` (aspect ratio ~0.56)

```tsx
function PlantTall({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.79} viewBox="0 0 28 50" fill="none">
      {/* pot */}
      <path d="M7 40 L21 40 L19 48 L9 48 Z"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* stem */}
      <line x1="14" y1="40" x2="14" y2="8" stroke="#365314" strokeWidth="1.5" />
      {/* leaves — alternating sides */}
      <ellipse cx="9"  cy="36" rx="4" ry="3" fill="#4ade80" stroke={OUTLINE_COLOR} strokeWidth="0.6" transform="rotate(-25 9 36)" />
      <ellipse cx="19" cy="30" rx="4" ry="3" fill="#22c55e" stroke={OUTLINE_COLOR} strokeWidth="0.6" transform="rotate(25 19 30)" />
      <ellipse cx="8"  cy="22" rx="4.5" ry="3.5" fill="#4ade80" stroke={OUTLINE_COLOR} strokeWidth="0.6" transform="rotate(-30 8 22)" />
      <ellipse cx="20" cy="16" rx="4.5" ry="3.5" fill="#22c55e" stroke={OUTLINE_COLOR} strokeWidth="0.6" transform="rotate(30 20 16)" />
      <ellipse cx="14" cy="8"  rx="5"   ry="4"   fill="#86efac" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
    </svg>
  )
}
```

- [ ] **Step 2: Add `PlantHanging`**

Identity: a hanging planter (bowl shape) with trailing vines coming down. Hangs from a short rope above.
viewBox: `0 0 28 36` (aspect ratio ~0.78)

```tsx
function PlantHanging({ palette, size = 24 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.29} viewBox="0 0 28 36" fill="none">
      {/* rope */}
      <line x1="14" y1="2" x2="6"  y2="10" stroke={palette.detail} strokeWidth="0.6" />
      <line x1="14" y1="2" x2="22" y2="10" stroke={palette.detail} strokeWidth="0.6" />
      {/* planter bowl */}
      <path d="M5 10 L23 10 L20 18 L8 18 Z"
            fill={palette.detail} stroke={OUTLINE_COLOR} strokeWidth="1" />
      {/* main leafy mass */}
      <ellipse cx="14" cy="11" rx="9" ry="4" fill="#4ade80" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* trailing vines */}
      <path d="M9 14 Q7 22 9 30" stroke="#22c55e" strokeWidth="1.2" fill="none" />
      <path d="M14 16 Q14 24 12 32" stroke="#16a34a" strokeWidth="1.2" fill="none" />
      <path d="M19 14 Q21 22 19 30" stroke="#22c55e" strokeWidth="1.2" fill="none" />
      {/* leaf accents on vines */}
      <ellipse cx="9"  cy="22" rx="1.5" ry="1" fill="#86efac" />
      <ellipse cx="13" cy="26" rx="1.5" ry="1" fill="#86efac" />
      <ellipse cx="20" cy="22" rx="1.5" ry="1" fill="#86efac" />
    </svg>
  )
}
```

- [ ] **Step 3: Wire into registry**

```tsx
'plant-tall': PlantTall,
'plant-hanging': PlantHanging,
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): tall and hanging plants"
```

## Task 11: Decor pieces — WallClock, Rug, Paper

**Files:** Modify `src/components/panels/office/furniture.tsx`

- [ ] **Step 1: Add `WallClock`**

Identity: round clock with hour/minute hands, simple tick marks.
viewBox: `0 0 24 24` (aspect ratio 1)

```tsx
function WallClock({ palette, size = 18 }: FurnitureProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* face */}
      <circle cx="12" cy="12" r="10" fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="1.4" />
      {/* tick marks */}
      <line x1="12" y1="3"  x2="12" y2="5"  stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <line x1="12" y1="19" x2="12" y2="21" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <line x1="3"  y1="12" x2="5"  y2="12" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      <line x1="19" y1="12" x2="21" y2="12" stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      {/* hour hand */}
      <line x1="12" y1="12" x2="12" y2="6"  stroke={palette.primary} strokeWidth="1.2" strokeLinecap="round" />
      {/* minute hand */}
      <line x1="12" y1="12" x2="17" y2="12" stroke={palette.accent}  strokeWidth="1"   strokeLinecap="round" />
      <circle cx="12" cy="12" r="0.8" fill={palette.detail} />
    </svg>
  )
}
```

- [ ] **Step 2: Add `Rug`**

Identity: a flat rectangular floor accent. Unlike other pieces, this has variable width/height set by the room layout.

Implementation: rendered as a simple outlined rectangle with a subtle decorative border. The rendering wrapper (Task 12) treats `kind === 'rug'` specially — uses the entry's `w` and `h` instead of `size`.

```tsx
function Rug({ palette, size = 80, w, h }: FurnitureProps) {
  // For the rug, w/h are room-relative %s; the parent applies them as the wrapper's
  // width/height. Inside the SVG we just draw a viewBox-relative rectangle.
  // We still accept `size` as a fallback for places that render the rug standalone.
  const _w = w ?? size
  const _h = h ?? size * 0.5
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${Math.round(_w * 4)} ${Math.round(_h * 4)}`} preserveAspectRatio="none" fill="none">
      <rect x="2" y="2" width={Math.round(_w * 4) - 4} height={Math.round(_h * 4) - 4} rx="3"
            fill={palette.primary} opacity="0.4" stroke={OUTLINE_COLOR} strokeWidth="1.5" />
      {/* decorative inner border */}
      <rect x="6" y="6" width={Math.round(_w * 4) - 12} height={Math.round(_h * 4) - 12} rx="2"
            fill="none" stroke={palette.accent} strokeWidth="0.8" opacity="0.55" />
    </svg>
  )
}
```

- [ ] **Step 3: Add `Paper`**

Identity: a tiny piece of paper on the floor — slightly tilted, with a couple of horizontal lines suggesting text.
viewBox: `0 0 12 16` (aspect ratio 0.75)

```tsx
function Paper({ palette, size = 10 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.33} viewBox="0 0 12 16" fill="none">
      <g transform="rotate(-8 6 8)">
        <rect x="1" y="1" width="10" height="14" rx="0.4"
              fill="#fff" stroke={OUTLINE_COLOR} strokeWidth="0.6" />
        <line x1="2.5" y1="5" x2="9.5" y2="5"  stroke={palette.detail} strokeWidth="0.4" />
        <line x1="2.5" y1="8" x2="9.5" y2="8"  stroke={palette.detail} strokeWidth="0.4" />
        <line x1="2.5" y1="11" x2="7.5" y2="11" stroke={palette.detail} strokeWidth="0.4" />
      </g>
    </svg>
  )
}
```

- [ ] **Step 4: Wire into registry**

```tsx
'wall-clock': WallClock,
'rug': Rug,
'paper': Paper,
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm vitest run --reporter=dot 2>&1 | tail -3 && pnpm lint`
Expected: All pass; registry test passes (all 27 kinds covered).

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/office/furniture.tsx
git commit -m "feat(office): wall clock, rug, paper decor"
```

## Task 12: Move ROOM_FURNITURE to office-layout.ts with new shape and dense layouts

**Files:**
- Modify: `src/lib/office-layout.ts`
- Modify: `src/components/panels/office-panel.tsx` (delete the old constant only — the panel render will be updated in Task 13)

- [ ] **Step 1: Add the new shape and constant to `office-layout.ts`**

Append at the end of `office-layout.ts`, before the existing re-export footer (`export { isGsdAgent, isLocalSession, isNamedNanobotAgent, NANOBOT_AGENT_NAMES, NANOBOT_AGENT_DEFS }`):

```ts
import type { FurnitureKind } from '@/components/panels/office/furniture'

export interface FurnitureEntry {
  kind: FurnitureKind
  /** % of room width */
  x: number
  /** % of room height */
  y: number
  /** Optional: explicit width/height (used by `rug`). % of room. */
  w?: number
  h?: number
}

export const ROOM_FURNITURE: Record<RoomId, FurnitureEntry[]> = {
  'home-main': [
    { kind: 'plant',           x:  8, y: 12 },
    { kind: 'wall-clock',      x: 50, y:  8 },
    { kind: 'plant',           x: 92, y: 12 },
    { kind: 'cubicle-divider', x: 25, y: 38 },
    { kind: 'cubicle-divider', x: 50, y: 38 },
    { kind: 'cubicle-divider', x: 75, y: 38 },
    { kind: 'desk',            x: 25, y: 55 },
    { kind: 'desk',            x: 50, y: 55 },
    { kind: 'desk',            x: 75, y: 55 },
    { kind: 'filing-cabinet',  x: 88, y: 78 },
    { kind: 'plant',           x: 12, y: 82 },
  ],
  'home-session': [
    { kind: 'rug',             x: 50, y: 60, w: 70, h: 30 },
    { kind: 'server-rack',     x: 18, y: 18 },
    { kind: 'server-rack',     x: 50, y: 18 },
    { kind: 'server-rack',     x: 82, y: 18 },
    { kind: 'desk',            x: 30, y: 60 },
    { kind: 'monitor-stack',   x: 30, y: 50 },
    { kind: 'desk',            x: 70, y: 60 },
    { kind: 'monitor-stack',   x: 70, y: 50 },
    { kind: 'plant-hanging',   x: 12, y: 12 },
  ],
  'home-gsd': [
    { kind: 'sticky-note-wall', x: 50, y: 12 },
    { kind: 'whiteboard',       x: 88, y: 30 },
    { kind: 'desk',             x: 25, y: 50 },
    { kind: 'desk',             x: 50, y: 50 },
    { kind: 'desk',             x: 75, y: 50 },
    { kind: 'plant-tall',       x:  8, y: 75 },
    { kind: 'paper',            x: 50, y: 80 },
  ],
  'break-room': [
    { kind: 'couch',           x: 30, y: 55 },
    { kind: 'snack-table',     x: 50, y: 55 },
    { kind: 'reading-chair',   x: 70, y: 55 },
    { kind: 'coffee-machine',  x: 25, y: 25 },
    { kind: 'fridge',          x: 75, y: 25 },
    { kind: 'floor-lamp',      x: 88, y: 78 },
    { kind: 'plant-hanging',   x: 50, y: 12 },
  ],
  'library': [
    { kind: 'bookshelf',     x: 20, y: 25 },
    { kind: 'bookshelf',     x: 50, y: 25 },
    { kind: 'bookshelf',     x: 80, y: 25 },
    { kind: 'reading-chair', x: 30, y: 70 },
    { kind: 'floor-lamp',    x: 50, y: 70 },
    { kind: 'plant-tall',    x: 80, y: 70 },
  ],
  'lab': [
    { kind: 'lab-bench',     x: 50, y: 50 },
    { kind: 'lab-terminal',  x: 18, y: 30 },
    { kind: 'server-rack',   x: 88, y: 30 },
    { kind: 'plant',         x:  8, y: 80 },
    { kind: 'poster',        x: 92, y: 80 },
    { kind: 'paper',         x: 30, y: 78 },
  ],
  'phone-booth': [
    { kind: 'phone-booth',   x: 18, y: 50 },
    { kind: 'phone-booth',   x: 38, y: 50 },
    { kind: 'phone-booth',   x: 62, y: 50 },
    { kind: 'phone-booth',   x: 82, y: 50 },
    { kind: 'plant',         x: 92, y: 18 },
  ],
  'war-room': [
    { kind: 'whiteboard',         x: 18, y: 22 },
    { kind: 'sticky-note-wall',   x: 82, y: 22 },
    { kind: 'conference-table',   x: 50, y: 60 },
    { kind: 'plant-tall',         x: 92, y: 78 },
    { kind: 'paper',              x: 50, y: 85 },
  ],
  'workshop': [
    { kind: 'rug',             x: 50, y: 60, w: 60, h: 30 },
    { kind: 'desk',            x: 18, y: 50 },
    { kind: 'monitor-stack',   x: 18, y: 40 },
    { kind: 'desk',            x: 38, y: 50 },
    { kind: 'monitor-stack',   x: 38, y: 40 },
    { kind: 'desk',            x: 60, y: 50 },
    { kind: 'monitor-stack',   x: 60, y: 40 },
    { kind: 'desk',            x: 82, y: 50 },
    { kind: 'monitor-stack',   x: 82, y: 40 },
    { kind: 'whiteboard',      x: 50, y: 12 },
    { kind: 'poster',          x: 92, y: 22 },
    { kind: 'plant',           x:  8, y: 82 },
  ],
  'waiting-bench': [
    { kind: 'bench',           x: 50, y: 50 },
    { kind: 'magazine-table',  x: 18, y: 50 },
    { kind: 'plant-tall',      x:  8, y: 50 },
    { kind: 'plant-tall',      x: 92, y: 50 },
    { kind: 'wall-clock',      x: 50, y: 18 },
  ],
}
```

- [ ] **Step 2: Delete the old `ROOM_FURNITURE` and `FurnitureComponents` from the panel**

In `src/components/panels/office-panel.tsx`, find and delete:
- The `const ROOM_FURNITURE: Record<RoomId, ...>` declaration (~55 lines)
- The `const FurnitureComponents = { desk: Desk, ... }` declaration (~7 lines)

Leave the inline component declarations (`Desk`, `Whiteboard`, etc.) for now — they get deleted in Task 13.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: WILL FAIL — the panel still references `ROOM_FURNITURE` and `FurnitureComponents`. That's fine; Task 13 fixes the references in the same go. Move to Task 13 immediately and don't commit yet — these changes only make sense as part of Task 13's larger panel refactor.

- [ ] **Step 4: Don't commit. Continue to Task 13.**

## Task 13: Update OfficePanel to use the registry, palette, and floor patterns

**Files:** Modify `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Delete the 5 inline furniture components**

Remove from the panel file:
- `function Desk(...)` (~10 lines)
- `function Whiteboard(...)` (~12 lines)
- `function CoffeeMachine(...)` (~14 lines)
- `function Plant(...)` (~9 lines)
- `function ServerRack(...)` (~13 lines)

These are all replaced by the new versions in `furniture.tsx`.

- [ ] **Step 2: Add imports**

Near other imports at the top of the file:

```tsx
import {
  FURNITURE_COMPONENTS,
  type FurnitureKind,
  type FurnitureProps,
} from './office/furniture'
import { ROOM_FURNITURE } from '@/lib/office-layout'
```

(Remove any existing imports that referenced the panel-local `ROOM_FURNITURE` or `FurnitureComponents`.)

- [ ] **Step 3: Update the `OfficeRoom` component to render furniture from the registry**

Find `function OfficeRoom({ room, agents, zoom })` in the panel. Locate the existing block that maps over `furniture`. Replace it with:

```tsx
{(ROOM_FURNITURE[room.id] || []).map((entry, i) => {
  const Comp = FURNITURE_COMPONENTS[entry.kind]
  // For rugs, the wrapper sets explicit % width/height so the SVG fills it.
  if (entry.kind === 'rug') {
    return (
      <div
        key={`${entry.kind}-${i}`}
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left:   `${entry.x}%`,
          top:    `${entry.y}%`,
          width:  `${entry.w ?? 40}%`,
          height: `${entry.h ?? 20}%`,
          zIndex: 0,  // rugs render BEHIND other furniture and crewmates
        }}
      >
        <Comp palette={room.palette} w={entry.w} h={entry.h} size={36} />
      </div>
    )
  }
  return (
    <div
      key={`${entry.kind}-${i}`}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ left: `${entry.x}%`, top: `${entry.y}%`, zIndex: 1 }}
    >
      <Comp palette={room.palette} size={36} />
    </div>
  )
})}
```

(Replace the references to local `furniture` variable, `FurnitureComponents` map, and the `furnitureScale` constant — these were the old code path and are gone now.)

- [ ] **Step 4: Apply the floor pattern to each room div**

Still inside `OfficeRoom`, find the room background `<div>` (the one styled with `backgroundColor: room.wallColor`). Update its `style` to layer the floor pattern on top:

```tsx
style={{
  left: `${room.x}%`,
  top: `${room.y}%`,
  width: `${room.w}%`,
  height: `${room.h}%`,
  backgroundColor: room.wallColor,
  backgroundImage: room.floorPattern ?? undefined,
}}
```

(Keep all other existing properties on the room div untouched.)

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run --reporter=dot 2>&1 | tail -3`
Expected: typecheck passes; lint passes; full unit suite green (no test count change).

- [ ] **Step 6: Manual smoke**

Run `pnpm dev` and visit `http://localhost:3000/office?demo=1`. Confirm:
- All 10 rooms render with their distinct palettes (look at the dominant furniture color per room)
- Floor patterns are visible (subtle but present)
- No furniture overflows room walls
- Crewmates render on top of furniture (they should still be clickable)

If any room looks wrong, capture which one and what (overflow / wrong color / missing piece) and fix in this same task before committing.

- [ ] **Step 7: Commit Tasks 12 + 13 together**

```bash
git add src/lib/office-layout.ts src/components/panels/office-panel.tsx
git commit -m "feat(office): render furniture via registry, palette, floor patterns"
```

## Task 14: Final verification

- [ ] **Step 1: Full quality pass**

Run from the repo:
```
pnpm typecheck
pnpm lint
pnpm vitest run --reporter=dot 2>&1 | tail -3
```
Expected: all pass; ~668 unit tests (was 665 + 2 new from `furniture-registry.test.ts`).

- [ ] **Step 2: Visual smoke at all zoom levels**

Run `pnpm dev`. Visit:
- `/office` (real activity data; furniture renders behind agents)
- `/office?demo=1` (every activity kind active)

Pan and zoom (mouse wheel + drag) — confirm furniture scales with the viewport and no piece overflows its room at zoom levels 0.6 → 2.5.

- [ ] **Step 3: Compare to spec**

Open `docs/superpowers/specs/2026-05-07-office-furniture-redesign-design.md` side by side with the running app. Tick off:
- 27 furniture kinds in vocabulary
- Per-zone palette dominant colors visible
- Per-zone floor patterns visible
- Each zone has its specified pieces in the layout

If any gap surfaces, file follow-ups (don't fix here — capture them).

- [ ] **Step 4: Commit any small adjustments**

If you tweaked positions or dimensions in Step 2 to fix overflows:
```bash
git add src/lib/office-layout.ts src/components/panels/office/furniture.tsx
git commit -m "fix(office): tweak furniture positions and sizes after visual smoke"
```

If everything is clean, skip the commit.
