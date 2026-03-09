---
phase: 02-agent-discovery-and-health
plan: 02
subsystem: ui
tags: [zustand, sse, agent-cards, health-dot, toast, responsive-grid, real-time]

# Dependency graph
requires:
  - phase: 02-agent-discovery-and-health
    plan: 01
    provides: AgentHealthSnapshot types, /api/agents/discover endpoint, health monitor with eventBus SSE
  - phase: 01-foundation
    provides: Zustand store, useSmartPoll, useServerEvents, NavRail, ContentRouter, cn utility
provides:
  - Agent card grid UI with activity-first layout
  - Zustand discoveredAgents state with CRUD actions and health-sorted ordering
  - SSE dispatch for agent.created/status_changed/deleted health events
  - AgentHealthDot component with color-coded status and hover tooltip
  - AgentSummaryBar with colored dot counts
  - AgentSkeletonGrid loading state
  - Toast notification system (context-based, auto-dismiss)
  - AgentsPanel with smart polling, toast notifications, and manual refresh
  - Nav-rail red notification dot for critical agent status
affects: [02-03 (agent detail slide-out), 03 (agent lifecycle)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toast context provider with useToast() hook for app-wide notifications"
    - "discoveredAgents Zustand state sorted by health (red first) on every mutation"
    - "SSE event discrimination: health property distinguishes discovered agents from DB agents"
    - "useSmartPoll + useRef comparison for detecting agent discovery/removal/red transitions"
    - "CSS animate-pulse-border keyframe for red-status card pulse (3 cycles)"

key-files:
  created:
    - src/components/agents/agents-panel.tsx
    - src/components/agents/agent-card.tsx
    - src/components/agents/agent-card-grid.tsx
    - src/components/agents/agent-health-dot.tsx
    - src/components/agents/agent-summary-bar.tsx
    - src/components/agents/agent-skeleton.tsx
    - src/components/ui/toast.tsx
    - src/components/ui/toast-provider.tsx
  modified:
    - src/store/index.ts
    - src/lib/use-server-events.ts
    - src/components/layout/nav-rail.tsx
    - src/app/[[...panel]]/page.tsx
    - src/app/globals.css

key-decisions:
  - "ToastProvider wraps at page.tsx level (client component) rather than layout.tsx (server component)"
  - "SSE events discriminated by health property presence to distinguish discovered vs DB agents"
  - "Card pulse animation runs 3 cycles (not infinite) to avoid constant visual noise"
  - "Agent card uses AgentAvatar fallback when no custom icon in config"

patterns-established:
  - "Toast pattern: ToastProvider at app root, useToast() in any component"
  - "Discovered agent state pattern: Zustand with auto-sort on every mutation"
  - "Nav badge pattern: showBadge prop on NavButton for item-specific indicators"

requirements-completed: [AREG-03, AREG-04, HLTH-05, HLTH-06]

# Metrics
duration: 10min
completed: 2026-03-09
---

# Phase 2 Plan 02: Agent Card Grid UI Summary

**Agent card grid with activity-first layout, health dots, summary bar, skeleton loading, toast notifications, and SSE-driven real-time updates wired into the Agents panel**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-09T18:47:26Z
- **Completed:** 2026-03-09T18:57:23Z
- **Tasks:** 3/3
- **Files created:** 8
- **Files modified:** 5

## Accomplishments

- Zustand store extended with discoveredAgents state, auto-sorted by health (red first, yellow, green)
- SSE dispatch handles agent health events (created, status_changed, deleted) for real-time UI updates
- Agent card grid renders with activity-first hierarchy: icon + name + health dot, activity text, last active, channels
- Toast notifications fire for agent discovery, removal, and red status transitions
- Nav-rail agents item works without gateway requirement, shows red dot when any agent is critical
- Summary bar shows "N agents: X healthy Y error" with colored dots
- Skeleton loading grid and empty state with path hint

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Zustand store and SSE dispatch** - `869945a` (feat)
2. **Task 2: Build agent card components** - `30abfea` (feat)
3. **Task 3: Wire AgentsPanel, ContentRouter, nav-rail, toast provider** - `7b1d17c` (feat)

## Files Created/Modified

- `src/components/agents/agents-panel.tsx` - Main panel: polling, toast notifications, grid orchestration
- `src/components/agents/agent-card.tsx` - Individual agent card with activity-first layout
- `src/components/agents/agent-card-grid.tsx` - Responsive grid container (1-4 columns)
- `src/components/agents/agent-health-dot.tsx` - Color-coded status dot with hover tooltip
- `src/components/agents/agent-summary-bar.tsx` - Summary counts with colored dots
- `src/components/agents/agent-skeleton.tsx` - Shimmer loading skeleton cards
- `src/components/ui/toast.tsx` - Minimal toast notification component
- `src/components/ui/toast-provider.tsx` - Toast context provider with useToast hook
- `src/store/index.ts` - Extended with discoveredAgents state and CRUD actions
- `src/lib/use-server-events.ts` - Added SSE dispatch for agent health events
- `src/components/layout/nav-rail.tsx` - Removed gateway requirement, added red badge dot
- `src/app/[[...panel]]/page.tsx` - AgentsPanel in ContentRouter, ToastProvider wrapper
- `src/app/globals.css` - Added animate-pulse-border keyframe for red status cards

## Decisions Made

- **ToastProvider placement:** Wrapped at page.tsx level (client component) rather than layout.tsx (server component), since layout.tsx has no 'use client' directive and ToastProvider needs React context.
- **SSE event discrimination:** Discovered agent events distinguished from DB agent events by presence of `health` property in event data, avoiding separate event type namespace.
- **Card pulse animation:** Runs 3 cycles (`animation: pulse-border 2s ease-in-out 3`) rather than infinite, to draw attention without creating constant visual noise.
- **AgentAvatar fallback:** Custom icon from config shown as emoji when available, otherwise falls back to existing AgentAvatar initials component.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All agent card components ready for Plan 02-03 (agent detail slide-out panel)
- `selectedDiscoveredAgentId` in store ready for slide-out to consume
- Toast system available app-wide for future features
- Agent card `onClick` triggers selection -- Plan 03 will open slide-out when selected

## Self-Check: PASSED

- All 8 created files verified present on disk
- All 3 task commits verified in git history
- 175 existing tests still pass
- TypeScript compiles cleanly
- Next.js build succeeds

---
*Phase: 02-agent-discovery-and-health*
*Completed: 2026-03-09*
