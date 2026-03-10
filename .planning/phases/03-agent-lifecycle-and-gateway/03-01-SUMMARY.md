---
phase: 03-agent-lifecycle-and-gateway
plan: 01
subsystem: api
tags: [child_process, spawn, lsof, pgid, process-management, gateway-proxy, lifecycle-locks, sse]

# Dependency graph
requires:
  - phase: 02-agent-discovery-and-health
    provides: "Agent discovery, health monitoring, checkPortAlive, healthMonitor singleton, SSE event bus"
provides:
  - "Process management library (findPidByPort, getProcessGroupId, startAgent, stopAgent, restartAgent)"
  - "Gateway proxy library (proxyGatewayRequest with timeout and error handling)"
  - "Lifecycle API routes (start, stop, force-stop, gateway proxy)"
  - "Lifecycle lock system in health monitor (acquire, release, auto-expire)"
  - "Lifecycle types (LifecycleAction, LifecycleStatus, LifecycleOperation, LifecycleLock)"
  - "'agent.lifecycle' event type for SSE broadcast"
affects: [03-agent-lifecycle-and-gateway, 05-operations-and-admin]

# Tech tracking
tech-stack:
  added: []
  patterns: [PGID-based process group kill, detached child processes with unref, port-based PID lookup via lsof, AbortController fetch timeout, server-side lifecycle locks with auto-expiry, background verification polling]

key-files:
  created:
    - src/lib/agent-lifecycle.ts
    - src/lib/agent-gateway.ts
    - src/app/api/agents/[id]/start/route.ts
    - src/app/api/agents/[id]/stop/route.ts
    - src/app/api/agents/[id]/force-stop/route.ts
    - src/app/api/agents/[id]/gateway/[...path]/route.ts
    - src/lib/__tests__/agent-lifecycle.test.ts
    - src/lib/__tests__/agent-gateway.test.ts
  modified:
    - src/types/agent-health.ts
    - src/lib/event-bus.ts
    - src/lib/validation.ts
    - src/lib/health-monitor.ts

key-decisions:
  - "Server-side lifecycle locks in health monitor singleton (not client-side Zustand) for multi-user safety"
  - "Background verification polling (setTimeout) returns API response immediately while monitoring start/stop outcome"
  - "Force-stop allows escalation from existing stop/restart lock without acquiring a new lock"
  - "Gateway proxy validates endpoint against allowlist before forwarding (health and status only)"

patterns-established:
  - "Lifecycle lock pattern: acquireLock before mutation, releaseLock on completion, auto-expire at 30s"
  - "Background verification: API returns immediately with 'starting'/'stopping' status, setTimeout polls for result and broadcasts SSE"
  - "Process group kill: findPidByPort -> getProcessGroupId -> process.kill(-pgid, signal)"

requirements-completed: [LIFE-01, LIFE-02, LIFE-03, LIFE-05, GATE-01, GATE-03, GATE-04]

# Metrics
duration: 7min
completed: 2026-03-10
---

# Phase 3 Plan 01: Agent Lifecycle and Gateway Summary

**Server-side process management with PGID-based kill, gateway HTTP proxy, lifecycle locks, and 4 API routes with background verification polling**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-10T00:29:00Z
- **Completed:** 2026-03-10T00:36:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Process management library with port-based PID lookup, PGID kill, detached spawn for both sub-agents and root agent
- Gateway proxy with 5s timeout, ECONNREFUSED handling, and endpoint allowlist (health/status)
- 4 API routes: start (POST), stop (POST), force-stop (POST), gateway proxy (GET)
- Lifecycle lock system in health monitor with 30s auto-expiry preventing concurrent operations
- Background verification: start route polls checkPortAlive for 15s, stop route polls for 10s
- 28 unit tests covering all process management and gateway proxy logic
- Full test suite (203 tests) passes, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Lifecycle and gateway service libraries with tests** - `f2b6142` (test: failing tests), `62b7b48` (feat: implementation + passing tests)
2. **Task 2: API routes and health monitor lifecycle locks** - `8776aea` (feat: routes + locks)

## Files Created/Modified
- `src/lib/agent-lifecycle.ts` - Process management (findPidByPort, getProcessGroupId, startAgent, stopAgent, restartAgent, waitForPortRelease)
- `src/lib/agent-gateway.ts` - Gateway HTTP proxy with timeout and error handling
- `src/app/api/agents/[id]/start/route.ts` - POST handler for starting agents with port pre-check and background verification
- `src/app/api/agents/[id]/stop/route.ts` - POST handler for stopping agents (SIGTERM) with background port release verification
- `src/app/api/agents/[id]/force-stop/route.ts` - POST handler for force killing agents (SIGKILL) with lock escalation
- `src/app/api/agents/[id]/gateway/[...path]/route.ts` - GET handler proxying requests to agent gateways
- `src/types/agent-health.ts` - Added LifecycleAction, LifecycleStatus, LifecycleOperation, LifecycleLock types
- `src/lib/event-bus.ts` - Added 'agent.lifecycle' event type
- `src/lib/validation.ts` - Added lifecycleStopSchema
- `src/lib/health-monitor.ts` - Added lifecycle lock system (acquireLock, releaseLock, getLock, cleanExpiredLocks)
- `src/lib/__tests__/agent-lifecycle.test.ts` - 22 unit tests for process management
- `src/lib/__tests__/agent-gateway.test.ts` - 6 unit tests for gateway proxy

## Decisions Made
- Server-side lifecycle locks in health monitor singleton (not client-side) for multi-user safety and race condition prevention
- Background verification polling using setTimeout so API routes return immediately with pending status
- Force-stop allows lock escalation from existing stop/restart without acquiring new lock (smooth escalation UX)
- Gateway proxy validates endpoint against ALLOWED_ENDPOINTS before forwarding -- only health and status allowed
- ECONNREFUSED detection checks both err.code and err.cause.code for compatibility with Node.js fetch error wrapping

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock hoisting for node:child_process**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Vitest vi.mock factory was hoisted above variable declarations, causing ReferenceError for mock functions
- **Fix:** Used vi.hoisted() to define mock functions before the vi.mock factory runs
- **Files modified:** src/lib/__tests__/agent-lifecycle.test.ts
- **Verification:** All 22 lifecycle tests pass
- **Committed in:** 62b7b48 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test mock fix necessary for test framework compatibility. No scope creep.

## Issues Encountered
None beyond the test mock hoisting issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server-side lifecycle infrastructure complete, ready for UI integration (Phase 3 Plan 02+)
- Lifecycle tab, confirmation modal, spinner overlay, and Zustand store extensions needed for frontend
- All API routes follow established patterns (requireRole, rate limiting, SSE broadcast)
- 203 tests pass, TypeScript compiles clean

## Self-Check: PASSED

All 9 created files verified on disk. All 3 task commits (f2b6142, 62b7b48, 8776aea) verified in git log.

---
*Phase: 03-agent-lifecycle-and-gateway*
*Completed: 2026-03-10*
