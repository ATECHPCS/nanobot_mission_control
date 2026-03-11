---
phase: 06-overview-dashboard-and-remote-access
plan: 03
subsystem: ui
tags: [sqlite, agent-health, dashboard, message-count]

# Dependency graph
requires:
  - phase: 02-agent-discovery-engine
    provides: AgentHealthSnapshot type and checkAgentHealth orchestrator
  - phase: 04-session-viewer
    provides: nanobot_sessions SQLite table with message_count column
provides:
  - messageCount field on AgentHealthSnapshot populated from nanobot_sessions
  - Message count display on agent cards with K/M formatting
affects: [overview-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [SQLite SUM aggregation for agent metrics, formatNumber K/M suffix helper]

key-files:
  created: []
  modified:
    - src/types/agent-health.ts
    - src/lib/agent-health.ts
    - src/components/agents/agent-card.tsx

key-decisions:
  - "Lifetime message count (no date filter) -- simple SUM query across all sessions per agent"
  - "Zero-message agents show no label (clean empty state, not '0 messages')"

patterns-established:
  - "formatNumber helper: K/M suffix formatting for compact numeric display in agent cards"

requirements-completed: [DASH-02]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 6 Plan 03: Agent Card Message Count Summary

**Message count from nanobot_sessions SQLite table displayed on agent cards with K/M suffix formatting**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T18:02:21Z
- **Completed:** 2026-03-11T18:06:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added messageCount field to AgentHealthSnapshot type and populated it via SQLite SUM query on nanobot_sessions
- Agent cards now display "N messages" (with K/M suffixes) when an agent has session data
- Clean empty state: agents with zero sessions show no message label

## Task Commits

Each task was committed atomically:

1. **Task 1: Add messageCount to AgentHealthSnapshot and populate from SQLite** - `5f48ebe` (feat)
2. **Task 2: Display message count on agent cards** - `aff235d` (feat)

**Plan metadata:** `b58c798` (docs: complete plan)

## Files Created/Modified
- `src/types/agent-health.ts` - Added optional messageCount field to AgentHealthSnapshot interface
- `src/lib/agent-health.ts` - Added getAgentMessageCount() function with SQLite SUM query; wired into checkAgentHealth return
- `src/components/agents/agent-card.tsx` - Added formatNumber helper and message count display in Row 3

## Decisions Made
- Used lifetime message count (no date filter) for simplicity -- single indexed query, <10 agents
- Zero-message agents show no label rather than "0 messages" for clean empty state
- Message count merged into Row 3 with last active timestamp using flex layout

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DASH-02 gap (token/message usage on cards) is closed
- Plan 06-04 (cache token display) can proceed independently

## Self-Check: PASSED

All 3 modified files verified present. Both task commits (5f48ebe, aff235d) verified in git log.

---
*Phase: 06-overview-dashboard-and-remote-access*
*Completed: 2026-03-11*
