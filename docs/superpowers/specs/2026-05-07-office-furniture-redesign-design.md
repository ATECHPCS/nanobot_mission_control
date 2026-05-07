# Office Furniture & Layout Redesign

**Status:** Draft
**Date:** 2026-05-07
**Scope:** `src/components/panels/office-panel.tsx`, `src/lib/office-layout.ts`, new `src/components/panels/office/furniture.tsx`

## Goal

Make the office feel like a real lived-in space. Replace the 5 minimalist gray furniture SVGs with a 27-piece chunky-cartoon vocabulary (5 redrawn + 22 new), give every zone its own color palette and floor treatment, and lay out each room with 4-8 pieces so it reads as the right kind of space at a glance — Library has bookshelves, Lab has beakers, Phone Booths has actual booths, etc.

## Non-goals

- Photorealism. The aesthetic is Among Us — chunky shapes, flat fills, slight outlines.
- Animated furniture (the agents already animate; furniture stays static aside from existing details like server LEDs and coffee steam).
- 3D / isometric perspective. Top-down stays.

## Aesthetic direction

Among Us-themed: chunky cartoon shapes, flat colors, ~1px dark outline (`rgba(0,0,0,0.4)`). Each zone has a dominant color story, but the overall palette is muted and works on a dark background.

## §1 — Per-zone palettes

Each zone has a `palette` object on its `RoomDefinition`:

```ts
interface ZonePalette {
  primary: string    // dominant furniture fill
  accent: string     // highlight (matches existing border/wallColor accent)
  detail: string     // small accents (knobs, screen glow, etc.)
  outline: string    // standard outline color, defaults to 'rgba(0,0,0,0.4)'
}
```

| Zone | primary | accent | detail | Mood |
|---|---|---|---|---|
| home-main | `#d4b896` (warm beige) | `#22d3ee` (cyan) | `#7c5e3a` | working office |
| home-session | `#334155` (dark slate) | `#a78bfa` (violet) | `#f0abfc` | dev cave / RGB lit |
| home-gsd | `#86efac` (sage) | `#10b981` (emerald) | `#065f46` | productive planning |
| break-room | `#a16940` (warm wood) | `#fbbf24` (amber) | `#78350f` | cozy lounge |
| library | `#92400e` (rich oak) | `#f59e0b` (amber) | `#fde68a` | reading room |
| workshop | `#94a3b8` (cool gray) | `#14b8a6` (teal) | `#5eead4` | engineering bay |
| lab | `#cbd5e1` (pale chrome) | `#fb7185` (rose) | `#22d3ee` (chemistry blue) | experiment lab |
| phone-booth | `#1e3a8a` (navy) | `#38bdf8` (sky) | `#facc15` (light glow) | phone closet |
| war-room | `#d97706` (warm tan) | `#fb923c` (orange) | `#fde68a` | strategy room |
| waiting-bench | `#ca8a04` (mustard) | `#facc15` (yellow) | `#fef3c7` | reception |

Each furniture component accepts a `palette: ZonePalette` prop. The component decides which roles use which colors.

## §2 — Furniture vocabulary

27 pieces total (5 kept and redrawn, 22 new).

### Kept (redrawn with new palette + chunkier outlines)

1. `desk` — three-quarter-view desk silhouette with monitor + keyboard. Primary = wood. Detail = monitor glow.
2. `whiteboard` — rectangular board on wall with marker scribbles. Primary = white panel; accent = colored marker dots.
3. `coffee-machine` — small drip coffee maker with steam. Primary = housing; accent = light dot.
4. `plant` — small potted plant (leafy ball + brown pot). Primary = leaves green; accent = pot.
5. `server-rack` — vertical rack with 3-4 LEDs. Primary = chassis; detail = blinking LEDs.

### New

| Id | Used in | Notes |
|---|---|---|
| `bookshelf` | library | Tall rectangle with 4-5 shelves of multi-colored book spines |
| `reading-chair` | library, break-room | Comfy armchair with cushion bump |
| `floor-lamp` | library, break-room | Tall pole + tilted shade emitting soft accent glow |
| `couch` | break-room | Wide 3-seat sofa with cushions |
| `fridge` | break-room | Tall narrow rectangle with handle and small square |
| `snack-table` | break-room | Round low table with cookies/cup |
| `conference-table` | war-room | Long oval table with 6 chair stubs around it |
| `sticky-note-wall` | war-room, gsd-wing | Wall section covered in 3-4 colored sticky note rectangles |
| `poster` | workshop, lab | Small framed wall poster (abstract geometry) |
| `phone-booth` | phone-booth | Tall narrow box with door, glass top, phone handset |
| `bench` | waiting-bench | Wide low bench with backrest |
| `magazine-table` | waiting-bench | Round low table with magazine on top |
| `lab-bench` | lab | Wider table with 2-3 beakers/flasks + microscope |
| `lab-terminal` | lab | CRT-style monitor on a desk with greenish screen |
| `monitor-stack` | workshop, session-pool | Two stacked monitors on a small desk |
| `filing-cabinet` | home-main | 3-drawer cabinet with handles |
| `cubicle-divider` | home-main | Low partition wall (panel) |
| `plant-tall` | gsd-wing, library, anywhere | Fiddle leaf plant — tall stem with broad leaves |
| `plant-hanging` | break-room, session-pool, anywhere | Hanging planter with trailing vines |
| `wall-clock` | home-main, waiting-bench | Round clock face with hands |
| `rug` | workshop, session-pool, anywhere | Rectangular floor accent (rendered behind furniture) |
| `paper` | gsd-wing, workshop, anywhere | Tiny paper square on the floor or desk |

(`rug` and `paper` are zero-height decorative pieces — `rug` renders as a floor element drawn before furniture; `paper` is a tiny accent.)

### Sizing

Each piece is a function component:

```ts
interface FurnitureProps {
  palette: ZonePalette
  size?: number  // default 36 — base px size; the SVG scales to this
}
```

Components export their natural aspect ratio internally; the SVG `viewBox` and rendered `width`/`height` use `size` consistently with the existing pattern.

## §3 — Per-zone layouts (dense, lived-in)

Density scales with room size. Coordinates are %-of-room.

### home-main (Main Office) — 8 pieces

```
+----------------------+
|  🪴      🕒          |  <- plants on shelves, wall clock
|  ┃ ┃ ┃               |  <- 3 cubicle dividers
| 🖥 🖥 🖥               |  <- 3 desks
|         🗄            |  <- filing cabinet
| 🪴                    |  <- corner plant
+----------------------+
```

```ts
[
  { kind: 'plant', x: 8, y: 12 },
  { kind: 'wall-clock', x: 50, y: 8 },
  { kind: 'plant', x: 92, y: 12 },
  { kind: 'cubicle-divider', x: 25, y: 38 },
  { kind: 'cubicle-divider', x: 50, y: 38 },
  { kind: 'cubicle-divider', x: 75, y: 38 },
  { kind: 'desk', x: 25, y: 55 },
  { kind: 'desk', x: 50, y: 55 },
  { kind: 'desk', x: 75, y: 55 },
  { kind: 'filing-cabinet', x: 88, y: 78 },
  { kind: 'plant', x: 12, y: 82 },
]
```

### home-session (Session Pool) — 7 pieces

```ts
[
  { kind: 'rug', x: 50, y: 60, w: 70, h: 30 },  // rug spans wide — rendered first (behind)
  { kind: 'server-rack', x: 18, y: 18 },
  { kind: 'server-rack', x: 50, y: 18 },
  { kind: 'server-rack', x: 82, y: 18 },
  { kind: 'desk', x: 30, y: 60 },
  { kind: 'monitor-stack', x: 30, y: 50 },  // sits on the desk
  { kind: 'desk', x: 70, y: 60 },
  { kind: 'monitor-stack', x: 70, y: 50 },
  { kind: 'plant-hanging', x: 12, y: 12 },
]
```

### home-gsd (GSD Wing) — 7 pieces

```ts
[
  { kind: 'sticky-note-wall', x: 50, y: 12 },
  { kind: 'whiteboard', x: 88, y: 30 },
  { kind: 'desk', x: 25, y: 50 },
  { kind: 'desk', x: 50, y: 50 },
  { kind: 'desk', x: 75, y: 50 },
  { kind: 'plant-tall', x: 8, y: 75 },
  { kind: 'paper', x: 50, y: 80 },
]
```

### break-room — 7 pieces

```ts
[
  { kind: 'couch', x: 30, y: 55 },
  { kind: 'snack-table', x: 50, y: 55 },
  { kind: 'reading-chair', x: 70, y: 55 },
  { kind: 'coffee-machine', x: 25, y: 25 },
  { kind: 'fridge', x: 75, y: 25 },
  { kind: 'floor-lamp', x: 88, y: 78 },
  { kind: 'plant-hanging', x: 50, y: 12 },
]
```

### library — 6 pieces

```ts
[
  { kind: 'bookshelf', x: 20, y: 25 },
  { kind: 'bookshelf', x: 50, y: 25 },
  { kind: 'bookshelf', x: 80, y: 25 },
  { kind: 'reading-chair', x: 30, y: 70 },
  { kind: 'floor-lamp', x: 50, y: 70 },
  { kind: 'plant-tall', x: 80, y: 70 },
]
```

### workshop — 8 pieces

```ts
[
  { kind: 'rug', x: 50, y: 60, w: 60, h: 30 },
  { kind: 'desk', x: 18, y: 50 },
  { kind: 'monitor-stack', x: 18, y: 40 },
  { kind: 'desk', x: 38, y: 50 },
  { kind: 'monitor-stack', x: 38, y: 40 },
  { kind: 'desk', x: 60, y: 50 },
  { kind: 'monitor-stack', x: 60, y: 40 },
  { kind: 'desk', x: 82, y: 50 },
  { kind: 'monitor-stack', x: 82, y: 40 },
  { kind: 'whiteboard', x: 50, y: 12 },
  { kind: 'poster', x: 92, y: 22 },
  { kind: 'plant', x: 8, y: 82 },
]
```

### lab — 6 pieces

```ts
[
  { kind: 'lab-bench', x: 50, y: 50 },
  { kind: 'lab-terminal', x: 18, y: 30 },
  { kind: 'server-rack', x: 88, y: 30 },
  { kind: 'plant', x: 8, y: 80 },
  { kind: 'poster', x: 92, y: 80 },
  { kind: 'paper', x: 30, y: 78 },
]
```

### phone-booth — 5 pieces

```ts
[
  { kind: 'phone-booth', x: 18, y: 50 },
  { kind: 'phone-booth', x: 38, y: 50 },
  { kind: 'phone-booth', x: 62, y: 50 },
  { kind: 'phone-booth', x: 82, y: 50 },
  { kind: 'plant', x: 92, y: 18 },
]
```

### war-room — 5 pieces

```ts
[
  { kind: 'whiteboard', x: 18, y: 22 },
  { kind: 'sticky-note-wall', x: 82, y: 22 },
  { kind: 'conference-table', x: 50, y: 60 },
  { kind: 'plant-tall', x: 92, y: 78 },
  { kind: 'paper', x: 50, y: 85 },
]
```

### waiting-bench — 5 pieces

```ts
[
  { kind: 'bench', x: 50, y: 50 },
  { kind: 'magazine-table', x: 18, y: 50 },
  { kind: 'plant-tall', x: 8, y: 50 },
  { kind: 'plant-tall', x: 92, y: 50 },
  { kind: 'wall-clock', x: 50, y: 18 },
]
```

## §4 — Floor treatments

Each `RoomDefinition` gets a `floorPattern: string | null` (CSS `background-image` value). The room div applies it on top of the existing solid `wallColor`. All patterns are pure CSS gradients — no images, no extra deps.

| Zone | Pattern | CSS value |
|---|---|---|
| home-main | low-pile carpet | `radial-gradient(circle at 4px 4px, rgba(255,255,255,0.04) 1px, transparent 1.2px) 0 0/8px 8px` |
| home-session | dark concrete | `linear-gradient(rgba(255,255,255,0.02), rgba(0,0,0,0.05))` |
| home-gsd | green carpet | `radial-gradient(circle at 4px 4px, rgba(134,239,172,0.05) 1px, transparent 1.2px) 0 0/8px 8px` |
| break-room | wood planks | `repeating-linear-gradient(90deg, rgba(122,72,42,0.10) 0 30px, rgba(70,40,20,0.10) 30px 32px)` |
| library | rich oak planks | `repeating-linear-gradient(90deg, rgba(146,64,14,0.14) 0 36px, rgba(100,40,8,0.14) 36px 38px)` |
| workshop | bare concrete | `linear-gradient(rgba(255,255,255,0.015), rgba(0,0,0,0.04))` |
| lab | white tile grid | `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0/24px 24px` |
| phone-booth | thin carpet | `radial-gradient(circle at 4px 4px, rgba(56,189,248,0.04) 1px, transparent 1.2px) 0 0/8px 8px` |
| war-room | dark wood | `repeating-linear-gradient(90deg, rgba(120,60,15,0.14) 0 40px, rgba(80,40,10,0.14) 40px 43px)` |
| waiting-bench | beige tile | `linear-gradient(rgba(250,204,21,0.06) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(250,204,21,0.06) 1px, transparent 1px) 0 0/28px 28px` |

## §5 — Implementation

### New files

- `src/components/panels/office/furniture.tsx` — exports:
  - `FurnitureKind` union (22 string literals)
  - `ZonePalette` interface
  - `FurnitureProps` interface
  - 22 furniture function components, each accepting `{ palette, size }`
  - `FURNITURE_COMPONENTS: Record<FurnitureKind, React.FC<FurnitureProps>>` registry
  - Plus an exported `OUTLINE_COLOR = 'rgba(0,0,0,0.4)'` constant for consistency

  Estimated size: ~500-700 lines (each piece is ~20-35 lines of SVG markup).

### Modified files

- `src/lib/office-layout.ts`:
  - Add `ZonePalette` interface (exported)
  - Add `palette: ZonePalette` and `floorPattern: string | null` fields to `RoomDefinition`
  - Update `ROOM_DEFS` with palette + floorPattern per the tables above
  - Move `ROOM_FURNITURE` here (it's data, not UI). Rename the entry field `component` → `kind`, retype it from the existing string-literal union to `FurnitureKind`, and add optional `w` and `h` fields (used by `rug`). Final entry shape: `{ kind: FurnitureKind; x: number; y: number; w?: number; h?: number }`.
- `src/components/panels/office-panel.tsx`:
  - Remove the 5 inline furniture component declarations (`Desk`, `Whiteboard`, `CoffeeMachine`, `Plant`, `ServerRack`) — about 80 lines deleted.
  - Remove the inline `ROOM_FURNITURE` constant and the local `FurnitureComponents` map — about 70 lines deleted.
  - Import `FURNITURE_COMPONENTS` and `FurnitureKind` from `./office/furniture`, and `ROOM_FURNITURE` from `@/lib/office-layout`.
  - Update the `OfficeRoom` render: pass the room's `palette` to each furniture component; apply `floorPattern` via `style={{ backgroundImage: room.floorPattern ?? undefined }}` on the room div alongside the existing `backgroundColor`.
  - For pieces with `w` / `h` (rug), accept those optional fields and render with explicit width/height instead of the standard `size`.

### Furniture component skeleton

Reference shape every piece follows:

```tsx
interface FurnitureProps {
  palette: ZonePalette
  size?: number
}

export function Bookshelf({ palette, size = 36 }: FurnitureProps) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 36 50" fill="none">
      {/* outline frame */}
      <rect x="2" y="2" width="32" height="46" rx="2"
            fill={palette.primary} stroke={OUTLINE_COLOR} strokeWidth="1.2" />
      {/* shelves */}
      {[12, 22, 32, 42].map(y => (
        <line key={y} x1="2" y1={y} x2="34" y2={y} stroke={OUTLINE_COLOR} strokeWidth="0.8" />
      ))}
      {/* book spines on each shelf */}
      {/* ... */}
    </svg>
  )
}
```

Components stay flat — no nested fragments needed beyond the SVG.

## Out of scope

- Animated furniture (besides the existing tiny details on coffee/server)
- Wall textures (only floor patterns are added)
- Per-piece hover states or click interactions
- Furniture configurability via the dashboard UI
- New room types (we're working with the existing 10-room layout)

## Testing

- Visual smoke test via `?demo=1` (already exists) — confirm every zone renders with new palette + pieces and no overflow
- `pnpm typecheck` and `pnpm lint` pass
- No new unit tests needed (this is presentation; the data flow already has coverage)
- E2E tests stay green (selectors are agent-name based, not furniture-based)

## Rollout

Single PR replacing the inline furniture system end-to-end. No feature flag — visual change is the entire point. The existing room geometry, classifier, walking crewmates, glyphs, and bubbles are untouched. Floor patterns and palettes default to `null` / a neutral grey if a zone is missing them, so the change is forward-compatible if more zones are added later.
