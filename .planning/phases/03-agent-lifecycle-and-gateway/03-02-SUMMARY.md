---
phase: 03-agent-lifecycle-and-gateway
plan: 02
subsystem: ui
tags: [zustand, sse, lifecycle, rbac, react, tailwind, confirmation-modal]

requires:
  - phase: 03-agent-lifecycle-and-gateway (plan 01)
    provides: Lifecycle service, gateway proxy, API routes, SSE lifecycle events, lifecycle locks
provides:
  - Zustand lifecycle state (operations map, history, lock checks)
  - SSE lifecycle event handling in useServerEvents hook
  - AgentLifecycleTab component with context-aware start/stop/restart/force-kill buttons
  - ConfirmModal reusable component for destructive action confirmation
  - Agent card spinner overlay during lifecycle operations
  - RBAC-gated Lifecycle tab (hidden for viewer role)
  - Operation history with timestamps, usernames, and smart error hints
  - Process-based lifecycle verification (pgrep, launchctl support)
affects: [04-alert-rules-and-notifications, 05-historical-metrics]

tech-stack:
  added: []
  patterns: [zustand-map-clone-for-rerender, sse-lifecycle-dispatch, confirm-modal-pattern, force-kill-escalation-timer]

key-files:
  created:
    - src/components/agents/confirm-modal.tsx
    - src/components/agents/agent-lifecycle-tab.tsx
  modified:
    - src/store/index.ts
    - src/lib/use-server-events.ts
    - src/components/agents/agent-card.tsx
    - src/components/agents/agent-slide-out.tsx
    - src/lib/agent-health.ts
    - src/lib/agent-lifecycle.ts
    - src/lib/health-monitor.ts
    - src/app/api/agents/[id]/start/route.ts
    - src/app/api/agents/[id]/stop/route.ts

key-decisions:
  - "Process detection via pgrep instead of port-only lsof for reliable alive/dead checks"
  - "launchctl unload/load for launchd-managed agents instead of raw SIGTERM"
  - "Error log truncation on dismiss to prevent stale errors reappearing"

patterns-established:
  - "Zustand Map clone pattern: new Map(state.map) after mutation to trigger re-renders"
  - "Force-kill escalation: 10s timer on pending stop before showing Force Kill button"
  - "RBAC tab gating: entire tab hidden (not just disabled) for viewer role"

requirements-completed: [LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, GATE-01, GATE-03, GATE-04]

duration: 45min
completed: 2026-03-10
---

# Phase 3 Plan 02: Lifecycle UI Summary

**Lifecycle tab with context-aware start/stop/restart/force-kill controls, confirmation modal, card spinner overlay, operation history, and RBAC-gated visibility**

## Performance

- **Duration:** ~45 min (across checkpoint boundary)
- **Started:** 2026-03-10T01:30:00Z (approximate, pre-checkpoint)
- **Completed:** 2026-03-10T02:32:31Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 11

## Accomplishments
- Zustand store extended with lifecycle operations Map, history array, and lock-check helpers with SSE event dispatch
- AgentLifecycleTab shows Start for stopped agents, Stop+Restart for running agents, Force Kill after 10s timeout
- ConfirmModal with destructive styling for stop/restart, backdrop/Escape dismiss, Cancel and Confirm buttons
- Agent card spinner overlay near status dot during lifecycle operations
- Lifecycle tab RBAC-gated: entirely hidden for viewer role, visible for operator/admin
- Operation history with timestamps, usernames, status badges, and smart error hints (EADDRINUSE, binary not found)
- Process-based verification using pgrep and launchctl for reliable lifecycle management

## Task Commits

Each task was committed atomically:

1. **Task 1: Zustand lifecycle state and SSE lifecycle event handling** - `792a05b` (feat)
2. **Task 2: Confirm modal, Lifecycle tab, and card spinner overlay** - `a4628f2` (feat)
3. **Task 3: Visual verification checkpoint** - APPROVED (human-verify, no commit)
4. **Bug fixes during verification** - `7d2327e` (fix)

## Files Created/Modified
- `src/components/agents/confirm-modal.tsx` - Reusable confirmation dialog with destructive styling option
- `src/components/agents/agent-lifecycle-tab.tsx` - Lifecycle tab with context-aware buttons, operation history, force kill
- `src/store/index.ts` - Extended with lifecycleOperations Map, lifecycleHistory, lock checks
- `src/lib/use-server-events.ts` - SSE agent.lifecycle event dispatch to Zustand store
- `src/components/agents/agent-card.tsx` - Spinner overlay near status dot during lifecycle ops
- `src/components/agents/agent-slide-out.tsx` - RBAC-gated Lifecycle tab (hidden for viewer)
- `src/lib/agent-health.ts` - Process detection via pgrep, checkProcessRunning()
- `src/lib/agent-lifecycle.ts` - launchctl support, findPidByCommand(), findAgentPid()
- `src/lib/health-monitor.ts` - Error log truncation on dismiss
- `src/app/api/agents/[id]/start/route.ts` - Process-based verification
- `src/app/api/agents/[id]/stop/route.ts` - Process-based verification

## Decisions Made
- Process detection via pgrep instead of port-only lsof checks -- port checks miss processes that haven't bound yet or that bind to different ports
- launchctl unload/load for launchd-managed agents -- raw SIGTERM doesn't properly manage launchd services, they auto-restart
- Error log truncation on disk when dismissing errors -- prevents stale errors from reappearing on next health poll

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Process detection via pgrep instead of port-only check**
- **Found during:** Task 3 (verification)
- **Issue:** Port-based lsof detection was unreliable for agents that hadn't bound their port yet or used different ports
- **Fix:** Added checkProcessRunning() using pgrep for process-name-based detection
- **Files modified:** src/lib/agent-health.ts, src/lib/__tests__/agent-health.test.ts
- **Committed in:** 7d2327e

**2. [Rule 1 - Bug] launchctl unload/load for launchd-managed agents**
- **Found during:** Task 3 (verification)
- **Issue:** SIGTERM to launchd-managed processes caused them to auto-restart; stop didn't work
- **Fix:** Added launchctl unload/load commands, findPidByCommand(), findAgentPid()
- **Files modified:** src/lib/agent-lifecycle.ts, src/lib/__tests__/agent-lifecycle.test.ts
- **Committed in:** 7d2327e

**3. [Rule 1 - Bug] Operation history color coding incorrect**
- **Found during:** Task 3 (verification)
- **Issue:** Stop and start action dots had wrong colors in operation history
- **Fix:** Stop action dot is red, start action dot is green
- **Files modified:** src/components/agents/agent-lifecycle-tab.tsx
- **Committed in:** 7d2327e

**4. [Rule 1 - Bug] Error logs persisting after dismiss**
- **Found during:** Task 3 (verification)
- **Issue:** Dismissed errors reappeared on next health poll because log files weren't truncated
- **Fix:** Truncate error log files on disk when dismissing errors
- **Files modified:** src/lib/health-monitor.ts
- **Committed in:** 7d2327e

**5. [Rule 1 - Bug] API routes using port-based verification**
- **Found during:** Task 3 (verification)
- **Issue:** Start/stop API routes verified success via port check, which was unreliable
- **Fix:** Switched to process-based verification in start and stop route handlers
- **Files modified:** src/app/api/agents/[id]/start/route.ts, src/app/api/agents/[id]/stop/route.ts
- **Committed in:** 7d2327e

---

**Total deviations:** 5 auto-fixed (5x Rule 1 - Bug)
**Impact on plan:** All fixes were necessary for correct lifecycle behavior discovered during human verification. No scope creep.

## Issues Encountered
None beyond the auto-fixed bugs above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete: both server-side (plan 01) and UI (plan 02) lifecycle controls are fully operational
- Ready for Phase 4 (Alert Rules and Notifications) or Phase 5 (Historical Metrics)
- Phases 4 and 5 can run in parallel (both depend on Phase 2, not each other)

## Self-Check: PASSED

- All 6 key files verified on disk
- All 3 commits verified in git history (792a05b, a4628f2, 7d2327e)

---
*Phase: 03-agent-lifecycle-and-gateway*
*Completed: 2026-03-10*
