---
phase: 04-session-viewer-and-token-tracking
plan: 03
subsystem: api, ui
tags: [recharts, sqlite, token-aggregation, line-chart, bar-chart, time-range-filter]

# Dependency graph
requires:
  - phase: 04-session-viewer-and-token-tracking
    provides: nanobot_sessions SQLite table with session metadata cache (Plan 01)
  - phase: 02-agent-discovery
    provides: discoverAgents() for agent enumeration
provides:
  - Unified token aggregation API (GET /api/token-stats?range=week)
  - aggregateTokenStats() pure-query function merging claude_sessions, token_usage, and nanobot_sessions tables
  - NanobotTokenPanel with summary stats, LineChart trend, BarChart per-agent, per-model breakdown
  - UnifiedTokenStats TypeScript interface for API response shape
  - Time range filtering (today/week/month/year) across all data
  - 14 unit tests covering aggregation logic, date filtering, and empty-table handling
affects: [06-overview-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-token-aggregation, dual-source-timeline-merge, slug-to-display-name-in-ui-layer]

key-files:
  created:
    - src/lib/token-aggregation.ts
    - src/app/api/token-stats/route.ts
    - src/lib/__tests__/token-aggregation.test.ts
    - src/components/panels/nanobot-token-panel.tsx
  modified:
    - src/app/[[...panel]]/page.tsx
    - src/components/layout/nav-rail.tsx

key-decisions:
  - "Token aggregation uses raw project_slug as agent identifier; display name cleaning happens in UI layer"
  - "Nanobot agents appear in byAgent with message counts (NOT token counts) per research finding that JSONL lacks token fields"
  - "Dual Y-axis on LineChart for input vs output tokens at different scales"
  - "Per-model breakdown uses stacked horizontal bars with actual numbers alongside visual bars"
  - "cleanProjectSlug removed from aggregation layer to keep it testable with raw data"

patterns-established:
  - "Token data merging: claude_sessions (ISO dates) + token_usage (unix epochs) unified via separate cutoff helpers"
  - "cleanAgentName in UI layer transforms slug paths to human-readable names without coupling data layer"
  - "Empty state detection: check all three summary fields (totalInputTokens, totalOutputTokens, totalMessages) before showing empty UI"

requirements-completed: [TOKN-01, TOKN-02, TOKN-03, TOKN-04]

# Metrics
duration: 26min
completed: 2026-03-10
---

# Phase 4 Plan 03: Unified Token Panel Summary

**Recharts-based token dashboard with aggregated data from claude_sessions, token_usage, and nanobot_sessions tables, plus time range filtering and per-agent/per-model breakdowns**

## Performance

- **Duration:** 26 min
- **Started:** 2026-03-10T17:02:33Z
- **Completed:** 2026-03-10T17:28:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- Unified token aggregation API that merges data from three SQLite tables (claude_sessions, token_usage, nanobot_sessions)
- Full Recharts dashboard with summary stats cards, LineChart trend, per-agent BarChart, and per-model stacked bars
- Time range selector (Today/Week/Month/Year) filters all data from a single API call
- Nanobot agents contribute message counts (not token counts) per research findings about JSONL format limitations
- 14 unit tests verify aggregation logic, date filtering, range cutoffs, and empty-table handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Token aggregation API and unit tests** - `1b3f4be` (feat) + `02d6a5e` (fix: nanobot agents in byAgent, raw slug identity)
2. **Task 2: Nanobot Token Panel UI with Recharts and ContentRouter wiring** - `7c91394` (feat) + `aa5d7c8` (fix: session viewer and token panel bugs)
3. **Task 3: Visual verification** - Checkpoint approved by user

## Files Created/Modified
- `src/lib/token-aggregation.ts` - Pure-query aggregation module with UnifiedTokenStats interface, range helpers, 6 SQL queries
- `src/app/api/token-stats/route.ts` - GET handler with RBAC, range validation, syncClaudeSessions refresh
- `src/lib/__tests__/token-aggregation.test.ts` - 14 unit tests with in-memory SQLite setup
- `src/components/panels/nanobot-token-panel.tsx` - Full dashboard with stats cards, LineChart, BarChart, per-model bars
- `src/app/[[...panel]]/page.tsx` - ContentRouter case for 'nanobot-tokens'
- `src/components/layout/nav-rail.tsx` - Tokens nav item updated to route to nanobot-tokens

## Decisions Made
- Token aggregation uses raw project_slug as agent identifier; cleanAgentName display logic lives in the UI layer to keep the data layer testable with raw values
- Nanobot agents appear in byAgent with source:'nanobot' showing message counts, since JSONL session files lack per-message token fields
- Dual Y-axis on the LineChart separates input and output token scales for readability
- Per-model breakdown uses stacked horizontal bars with numeric labels, not a pie chart (more readable for comparing multiple models)
- cleanProjectSlug was removed from the aggregation function after discovering it broke test expectations; slug-to-display transformation happens at render time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed nanobot agents missing from byAgent array**
- **Found during:** Task 1 (test verification)
- **Issue:** aggregateTokenStats only added claude-code agents to byAgent, skipping nanobot agents entirely. Tests expected nanobot agents with source:'nanobot' and message counts.
- **Fix:** Added loop to push nanobot agents into byAgent with zero tokens and their message counts
- **Files modified:** src/lib/token-aggregation.ts
- **Verification:** All 14 unit tests pass
- **Committed in:** 02d6a5e

**2. [Rule 1 - Bug] Fixed cleanProjectSlug transforming agent names in data layer**
- **Found during:** Task 1 (test verification)
- **Issue:** cleanProjectSlug in aggregateTokenStats converted 'mc-project' to 'Mc Project', breaking test assertions and making the API return display names instead of identifiers
- **Fix:** Removed cleanProjectSlug from aggregation layer; moved equivalent cleanAgentName to UI component
- **Files modified:** src/lib/token-aggregation.ts, src/components/panels/nanobot-token-panel.tsx
- **Verification:** Tests pass with raw slugs; UI displays cleaned names
- **Committed in:** 02d6a5e

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. The aggregation logic now matches the test expectations and plan specification exactly.

## Issues Encountered
- Pre-existing commits from a previous partial execution covered most of Tasks 1 and 2. The remaining work was fixing 3 failing tests by correcting the aggregation logic to match the plan specification.
- Two external bug fixes (chat viewer horizontal overflow, IDENTITY.md asterisk parsing) were committed separately by the user and are unrelated to this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 4 is now fully complete (all 3 plans: session data layer, session panel UI, token panel)
- Token aggregation API provides a foundation for Phase 6 overview dashboard (composite agent status with token data)
- The nav-rail now routes Tokens to the unified panel; legacy /tokens route still accessible for backward compatibility

## Self-Check: PASSED

- All 4 key files exist on disk
- All 4 commit hashes found in git log
- All 14 unit tests pass

---
*Phase: 04-session-viewer-and-token-tracking*
*Completed: 2026-03-10*
