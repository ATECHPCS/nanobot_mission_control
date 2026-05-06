# Office Tab — Activity Zones & Animated Awareness

**Status:** Draft
**Date:** 2026-05-06
**Scope:** `src/components/panels/office-panel.tsx`, supporting `src/lib/*` modules, and a new `/office/tv` kiosk route

## Goal

Make the Office panel show, at a glance, what every agent is doing — by adding activity zones, motion between them, and short deadpan-humor speech bubbles tied to inferred activity state.

Today the panel groups agents by team into five rooms and animates a bounce when busy and a gentle drift when idle. That communicates "alive vs not." It does not communicate "this agent is reading a file" vs "running tests" vs "stuck on review." This redesign closes that gap using data already collected by the app — no agent-runtime changes, no new dependencies, no DB migrations.

## Priorities

1. **At-a-glance awareness** (primary) — viewer can read room→agent positions and immediately know what kind of work is happening.
2. Story/flow — agent-to-agent calls and meetings are visible.
3. Real-time fidelity — animations update within ~5s of the underlying signal.
4. Personality/atmosphere — deadpan speech bubbles add character without becoming noise.

## Layout

Hybrid: edge home rooms keep a "where does this agent live" mental model; a center corridor hosts activity zones agents migrate to while doing work; idle agents drift back home or to the break room.

```
┌────────────────────────────────────────────────────────────────┐
│  THE OFFICE                                                    │
│ ┌────────────┐  ┌────────────────────────┐  ┌──────────────┐  │
│ │ MAIN       │  │  ░░ COMMON CORRIDOR ░░ │  │   GSD WING   │  │
│ │ OFFICE     │  │                        │  │              │  │
│ │ (Andy,     │  │  ┌──────┐  ┌────────┐  │  │  gsd-planner │  │
│ │  Stefany,  │  │  │ LIB  │  │  LAB   │  │  │  gsd-exec    │  │
│ │  Cody)     │  │  │  📖  │  │  >_   │  │  │  ...         │  │
│ │            │  │  └──────┘  └────────┘  │  │              │  │
│ ├────────────┤  │  ┌──────┐  ┌────────┐  │  ├──────────────┤  │
│ │ SESSION    │  │  │PHONE │  │  WAR   │  │  │ BREAK ROOM   │  │
│ │ POOL       │  │  │BOOTHS│  │  ROOM  │  │  │   ☕  ··      │  │
│ │ (claude/   │  │  │  ☎  │  │   👥  │  │  │ (idle agents)│  │
│ │  codex)    │  │  └──────┘  └────────┘  │  │              │  │
│ └────────────┘  │   WAITING BENCH ⏳     │  └──────────────┘  │
│                 └────────────────────────┘                     │
└────────────────────────────────────────────────────────────────┘
```

### Rooms

**Home rooms** (left/right edges, persistent assignment per agent):

| Id | Label | Holds |
|---|---|---|
| `home-main` | Main Office | Named nanobot agents (Andy, Stefany, Cody) |
| `home-gsd` | GSD Wing | `gsd-*` agents |
| `home-session` | Session Pool | Claude Code / Codex local sessions |

**Activity zones** (agents migrate here based on current activity). Five sit in the center corridor; `break-room` is geographically on the right edge for proximity to the GSD home but functions as an idle activity zone, not a home base.

| Id | Label | Trigger | Position |
|---|---|---|---|
| `library` | Library | Reading / searching tools | corridor |
| `workshop` | Workshop | Editing / writing tools | corridor |
| `lab` | Lab | Bash / command execution | corridor |
| `phone-booth` | Phone Booths | Recent agent-to-agent comms | corridor |
| `war-room` | War Room | Multi-agent meeting | corridor |
| `waiting-bench` | Waiting Bench | Blocked / awaiting review | corridor (bottom) |
| `break-room` | Break Room | Idle for 5+ minutes | right edge |

The existing pan/zoom map, minimap, sidebar roster, GSD-hide toggle, and click-to-detail modal are preserved.

## Activity vocabulary

`ActivityKind` enumerates 10 states:

```ts
type ActivityKind =
  | 'typing'      // Workshop
  | 'reading'     // Library
  | 'searching'   // Library (web/grep)
  | 'bash'        // Lab
  | 'on-call'     // Phone Booths
  | 'in-meeting'  // War Room
  | 'thinking'    // home desk + thought bubble
  | 'blocked'     // Waiting Bench
  | 'idle'        // Break Room
  | 'error'       // home desk + red flash
```

`ActivityState` carries the kind plus a short subject string used by speech bubbles:

```ts
interface ActivityState {
  kind: ActivityKind
  subject?: string   // filename, command, peer name, blocking task title
  since: number      // unix ms when this state began
}
```

## Data plumbing

### Inference

Two-pass inference. Pass 1 is per-agent and pure (`inferActivityState(agent, signals): ActivityState`), suitable for unit tests. Pass 2 is a cross-agent override applied by the API route after Pass 1 completes for all agents.

**Pass 1 — per-agent precedence** (first match wins):

1. `agent.status === 'error'` → `error`
2. comms event in `agent_comms` (last 60s, agent is `from_agent` or `to_agent`) → `on-call`, subject = peer name
3. `mcp_call_log` row in last 60s for this agent → map `tool_name` → kind:
   - `Edit` / `Write` / `MultiEdit` / `NotebookEdit` → `typing`, subject = file path
   - `Read` / `Grep` / `Glob` → `reading`, subject = file path
   - `WebFetch` / `WebSearch` → `searching`, subject = URL or query
   - `Bash` → `bash`, subject = command stem (first 40 chars)
4. assigned task in `review` or `quality_review` → `blocked`, subject = task title
5. `agent.status === 'busy'` and no recent tool/comms → `thinking`
6. `agent.status === 'idle'` for >5min OR no signals → `idle`
7. Default → `idle` with no subject

**Pass 2 — cross-agent meeting promotion:**

After Pass 1, if `N` or more agents currently have kind in `{thinking, typing, reading, on-call}`, promote *those agents* to `in-meeting` (subject = comma-joined peer names, truncated). `N` defaults to 3 and is tunable via env var `MC_OFFICE_MEETING_THRESHOLD`. This is intentionally rough — it captures "everyone's busy at once" without needing an explicit conference signal. Agents in `error` / `blocked` / `idle` are never promoted.

### Sources

| Table / file | Used for |
|---|---|
| `mcp_call_log` (existing) | Tool-name signal — primary driver for typing/reading/bash/searching |
| `agent_comms` (existing) | on-call detection |
| `tasks` (existing, filtered by `assigned_to`) | blocked detection |
| `agents.status`, `agents.last_seen` | error / idle / coarse fallback |
| Claude session JSONL `tool_use` entries (existing scanner in `claude-sessions.ts`) | Fallback for local sessions that don't write to `mcp_call_log` (extend existing parser to also return latest tool name + timestamp) |

### API endpoint

`GET /api/agents/activity` (viewer role)

Response:

```ts
{
  agents: Array<{
    id: number
    name: string
    activity: ActivityState
  }>
  generated_at: number  // unix ms
}
```

- Server-side cache: 2 seconds (single global cache, since payload is workspace-wide).
- Single combined query joining the four tables above; Claude session fallback only runs in `dashboardMode === 'local'`.
- Rate-limit per existing API conventions.

### Client polling

Office panel calls the endpoint every 5s (already has a 10s `fetchAgents` interval — we add a parallel `fetchActivities` at 5s).

If the endpoint errors, the panel keeps the last-known activities (or empty) and falls back to today's status-only classification — no breaking change.

SSE upgrade is intentionally deferred. The hook for it (a new `agent.activity_changed` event type in `event-bus.ts`) is mentioned here so we know where to add it later.

## Motion

### Movement between rooms

Each room has a fixed "door" point on the corridor edge. The corridor has two lanes (one horizontal, one vertical). When an agent's target zone changes, `pathBetween(from, to): Point[]` returns 2-4 waypoints:

`current seat → home door → corridor lane → zone door → zone seat`

The `WalkingCrewmate` component plays the path as chained CSS transitions on `left/top`, ~1.2s ease-in-out per leg. Total trip ~3-4s. During the trip the crewmate plays a small horizontal walk-wobble (2px alternating).

Within a room, short seat changes keep the existing 2s linear transition.

### In-place per activity

| Kind | Motion | Glyph |
|---|---|---|
| typing | body 3px horizontal jitter @ 0.25s | ⌨️ |
| reading | head bob (±3° rotate) | 📖 |
| bash | floating terminal `>_` with blinking cursor | `>_` |
| searching | rotating magnifier | 🔍 |
| thinking | thought bubble with `…` pulse | 💭 |
| on-call | dashed line drawn to peer agent + bubble outline | ☎️ |
| in-meeting | meeting agents face inward (CSS scaleX flip on half) | — |
| blocked | slow yellow halo | ⏳ |
| idle | existing drift, occasional sip | ☕ |
| error | red flash, smoke puff | 💢 |

Motion is implemented via existing CSS animations on the SVG `Crewmate` plus a small set of per-kind keyframe classes in `office-panel.tsx`. No new dependencies.

## Speech bubbles

### Trigger rules

- Show bubble immediately when an agent's `ActivityState.kind` changes (always — first impression).
- After that, while the agent stays in the same kind, schedule another bubble at a jittered interval of 35–55s.
- Cap simultaneous visible bubbles per panel at 3 (oldest fades first).
- Each bubble auto-dismisses after 6s. Click-to-pin is out of scope for v1.

### Format

- Small rounded rect with tail pointing at agent.
- Mono font, 1-2 lines, ~50 char max.
- Fade in 200ms, fade out 400ms.
- Positioned above agent's head, kept inside the map viewport (clamped to edges).

### Content library

`src/lib/office-deadpan.ts` exports a `Record<ActivityKind, string[]>`. Lines may include `{subject}` placeholder substituted from `ActivityState.subject` (the substituted string is truncated to 40 chars; if subject is missing, lines containing `{subject}` are excluded from selection).

Initial copy:

```ts
export const DEADPAN_LINES: Record<ActivityKind, string[]> = {
  typing:    ['Editing {subject}.', 'Writing things.', 'It compiles. That\'s something.', 'Adding a TODO.', 'Probably a bug.'],
  reading:   ['Reading {subject}.', 'This file again.', 'Skimming. Convincingly.', 'Pretending {subject} makes sense.'],
  searching: ['Looking for {subject}.', 'Grep harder.', 'It must be somewhere.'],
  bash:      ['$ {subject}', 'Hoping for green.', 'There is no rollback plan.', 'Will it work this time?'],
  'on-call': ['Talking to {subject}.', '{subject} has a question.', 'Mostly listening.'],
  'in-meeting': ['Meeting.', 'Aligning on alignment.', 'We could just code this.'],
  thinking:  ['Thinking.', 'There are several wrong answers.', '...', 'Considering options.'],
  blocked:   ['Awaiting review.', 'Sent a polite ping.', 'Stuck.'],
  idle:      ['Coffee.', 'Not currently helpful.', 'Existential break.'],
  error:     ['Apologies.', 'As foretold.', 'I have failed.'],
}
```

Selection is uniform random with the constraint that the same line can't fire twice consecutively for the same agent.

## Files

### New

- `src/lib/agent-activity.ts` — `ActivityKind`, `ActivityState`, `inferActivityState()`. Pure inference logic; takes signals as arguments to keep it unit-testable.
- `src/app/api/agents/activity/route.ts` — viewer-gated GET endpoint. Pulls signals from DB + Claude session scanner, calls `inferActivityState` per agent, applies the cross-agent in-meeting override, returns the response.
- `src/lib/office-deadpan.ts` — `DEADPAN_LINES` constant + `pickDeadpanLine(kind, subject, lastLine?)` helper.
- `src/lib/office-paths.ts` — `pathBetween(fromRoom, toRoom): Point[]` returning 2-4 waypoints; uses the door-point table defined alongside room geometry.

### Modified

- `src/lib/office-layout.ts` —
  - Replace existing `RoomId` enum with the 10-room set above.
  - Update `ROOM_DEFS` geometry to match the new layout.
  - Add `ROOM_DOORS: Record<RoomId, Point>` and corridor lane definitions.
  - Replace `classifyAgent(agent)` with `classifyAgentByActivity(agent, state)`. Existing helpers (`isGsdAgent`, `isLocalSession`, `isNamedNanobotAgent`) keep their current job — they decide an agent's *home* room. The activity state decides where the agent is *currently*.
  - `assignSeats` is reused.
- `src/components/panels/office-panel.tsx` —
  - Add a `fetchActivities` polling loop (5s) writing to the new store slice.
  - Replace the current static seat assignment with two passes: (a) home seat per agent, (b) target seat = activity zone seat if `ActivityState` resolves to one, else home seat.
  - Add `WalkingCrewmate` component wrapping the existing crewmate render, driving multi-leg CSS transitions.
  - Add `SpeechBubble` component with auto-dismiss timer.
  - Add per-kind glyph rendering on the crewmate (small badge SVG above the head).
  - Add `?demo=1` mode that bypasses the API and cycles each agent through every `ActivityKind` for visual smoke-testing.
  - File is already 1074 lines; this change adds enough scope that we extract the per-kind glyph SVGs and the `WalkingCrewmate`/`SpeechBubble` components into sibling files (`src/components/panels/office/`) to keep the panel under ~1300 lines.
- `src/store/index.ts` — add `officeActivities: Record<string, ActivityState>` slice + setter `setOfficeActivities`.

### Touched but not redesigned

- `src/lib/event-bus.ts` — comment-only marker for the future `agent.activity_changed` event type. No emit yet.

## Testing

- **Unit (Vitest):**
  - `inferActivityState` — one test per precedence rule (rules 1–8), plus edge cases: stale tool call (>60s ignored), no signals, multiple recent tools (latest wins), in-meeting cross-agent override.
  - `pathBetween` — for each `(home, zone)` pair, returns waypoints whose first/last points match the seats and middle points lie on the corridor.
  - `pickDeadpanLine` — never returns the same line twice in a row; subject substitution; lines with `{subject}` skipped when subject is missing.
- **Visual smoke:** `?demo=1` query param injects fake activities cycling all 10 kinds. Manual screenshot comparison + included in QA pass.
- **E2E (Playwright):** extend existing office test to (a) load `/office`, (b) wait for activities to populate, (c) assert no console errors, (d) assert at least the home rooms render. Activity-zone assertions are kept loose because the panel is timing-sensitive; the demo mode covers state coverage.

## Error handling & fallbacks

- API endpoint returns last-good cached payload on DB error; if cache empty, returns `{ agents: [], generated_at: now }`.
- Client treats endpoint failure as "no activity data" — agents stay at home seats with their existing status-based animations (today's behavior).
- Unknown `ActivityKind` (e.g. shape drift after a future addition) falls through to home seat.
- Missing room or invalid waypoints → straight-line transition fallback (today's 2s ease).

## Phases

The implementation breaks into four phases, executed in order. Phases 1–3 deliver the redesigned in-app office panel; Phase 4 adds the kiosk surface.

| # | Phase | Deliverable |
|---|---|---|
| 1 | Data plumbing | `agent-activity.ts`, `/api/agents/activity` route, store slice, unit tests for `inferActivityState` |
| 2 | Layout & paths | New `RoomId` enum and geometry in `office-layout.ts`, `office-paths.ts`, `WalkingCrewmate` component, refactor of the panel into `src/components/panels/office/*` files |
| 3 | Animations & bubbles | Per-kind glyphs and motion, `SpeechBubble` component, `office-deadpan.ts`, `?demo=1` mode, Playwright extension |
| 4 | TV Dashboard | `/office/tv` kiosk route, token gate, kiosk-mode panel rendering |

Each phase merges independently. After Phase 1 the panel still classifies by status (no visible change). After Phase 2 agents move between zones with default styling. After Phase 3 the full design is shipped. Phase 4 is purely additive.

## Phase 4 — TV Dashboard (`/office/tv`)

A read-only kiosk route showing the new office panel full-bleed for wall displays. Pattern adapted from the `odoo-tv-dashboard` skill (token-gated, always-on, auto-refreshing) — the skill itself targets Odoo modules, but its design is reused here for a Next.js page route.

### Route

`GET /office/tv?token=<kiosk-token>` — Next.js App Router page that bypasses normal session auth.

### Token scheme

- Token sourced from env var `MC_OFFICE_TV_TOKEN`. If unset, the route returns 404 (kiosk feature disabled).
- Compared with `crypto.timingSafeEqual` in `src/proxy.ts` before allowing the route to render and before allowing `/api/agents/activity` to respond.
- Token also accepted on `/api/agents/activity` via the same `?token=` query param so the kiosk can poll without a session cookie.
- Logged once per session start to the audit trail (no token value logged).

### Page structure

- Full-bleed: no `NavRail`, no `HeaderBar`, no `LiveFeed`, no sidebar — just the office canvas.
- Center: the office map at fit-to-viewport zoom, pan disabled.
- Top-right HUD overlay: small status row showing `N working / N idle`, last-update time, connection dot.
- Bottom-right: small Mission Control wordmark + clock.
- Background: solid `#06080d` (slightly darker than the panel background) for OLED-friendly large displays.
- Crewmate scale and default zoom slightly larger than the panel for visibility from across a room.

### Behavior

- Polls `/api/agents/activity` every 5s using the same client logic as the in-app panel.
- Disables the in-app "smart polling pauses when tab hidden" behavior — kiosks are always-on.
- Periodic full page reload every 6h as a belt-and-suspenders memory-leak guard.
- All click and keyboard interactions are no-ops (no detail modal, no nav).
- Speech bubbles render with the same deadpan content library.

### Implementation seams

- New: `src/app/office/tv/page.tsx` — kiosk route entry. Renders `<OfficePanel kiosk />`.
- New: `src/lib/kiosk-auth.ts` — token validation helpers using `crypto.timingSafeEqual`.
- Modified: `src/proxy.ts` — allow `/office/tv` and `/api/agents/activity` with valid `?token=` to bypass session auth.
- Modified: `src/components/panels/office-panel.tsx` — accept a `kiosk?: boolean` prop that hides chrome (sidebar, header, zoom controls), disables interactions, applies kiosk styling, and disables the visibility-pause behavior.

### Testing

- Unit: `kiosk-auth.ts` token comparison (correct, mismatched, missing, env unset).
- E2E (Playwright): load `/office/tv` without token → 404; with bad token → 404; with good token → page renders, polls activity endpoint, no console errors.
- Manual: verify on a 1080p and 4K display at viewing distance.

### Out of scope for Phase 4

- Rotating tokens via UI (env var rotation only for v1).
- Multiple kiosk profiles or per-zone kiosks.
- Multi-tab grid (e.g., office + tasks side by side).
- Anonymous/public access without a token.

## Out of scope (for this spec)

- SSE push for `agent.activity_changed` (deferred — polling first).
- Click-to-pin speech bubbles.
- User-customizable deadpan lines.
- Agent-runtime changes (no new heartbeat fields, no new agent SDK calls).
- New DB migrations (uses existing tables).
- A second design pass on the per-kind glyph SVGs — initial pass uses emoji or simple shapes; visual polish is a follow-up.

## Rollout

Phases 1–4 each ship as their own PR. No feature flag — the panel falls back gracefully if the new endpoint is missing, and the TV route returns 404 if the token env var is unset. Demo mode (`?demo=1`) ships with Phase 3 for designer review.
