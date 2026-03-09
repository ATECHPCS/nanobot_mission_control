---
phase: 02-agent-discovery-and-health
plan: 01
subsystem: api
tags: [tcp-health-check, jsonl-parsing, filesystem-scanning, event-bus, singleton, health-monitor]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: event-bus singleton, config with NANOBOT_STATE_DIR, auth/rate-limit middleware, logger
provides:
  - Agent discovery service (filesystem scanning, launch script parsing, config reading)
  - Agent health checking service (TCP port liveness, JSONL activity, error detection, channel status)
  - Composite health scoring (green/yellow/red with worst-dimension-wins)
  - Health monitor singleton with eventBus broadcasting
  - Four API routes for agent health data
  - Type definitions for all agent health types
affects: [02-02 (agent card grid UI), 02-03 (agent detail slide-out), 03 (agent lifecycle)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TCP port liveness via net.Socket for gateway health"
    - "readLastLines() for efficient JSONL tail-reading (last N bytes only)"
    - "globalThis singleton pattern for health monitor (HMR-safe)"
    - "Composite health with worst-dimension-wins logic"
    - "Error detection from dual sources (JSONL sessions + error log files)"

key-files:
  created:
    - src/types/agent-health.ts
    - src/lib/agent-discovery.ts
    - src/lib/agent-health.ts
    - src/lib/health-monitor.ts
    - src/app/api/agents/discover/route.ts
    - src/app/api/agents/[id]/errors/route.ts
    - src/app/api/agents/[id]/errors/dismiss/route.ts
    - src/app/api/agents/[id]/channels/route.ts
    - src/lib/__tests__/agent-discovery.test.ts
    - src/lib/__tests__/agent-health.test.ts
    - src/lib/__tests__/health-monitor.test.ts
  modified: []

key-decisions:
  - "@ts-nocheck on agent-health test file due to Vitest mock overload conflicts with node:fs strict types"
  - "Synchronous fs reads for discovery (acceptable for <10 agents on server side)"
  - "readLastLines reads last N bytes with Buffer.alloc to avoid loading full JSONL/log files"
  - "Error log entries use current timestamp as approximation (logs may lack timestamps)"
  - "Channel connected status derived from gateway port liveness (no per-channel health endpoint)"

patterns-established:
  - "TCP port check pattern: net.Socket with connect/error/timeout events"
  - "readLastLines(filePath, maxBytes) for efficient file tail reading"
  - "Health monitor tick pattern: discover -> check each -> diff previous -> broadcast changes"
  - "API route pattern for health endpoints: requireRole + readLimiter + healthMonitor.getSnapshot()"

requirements-completed: [AREG-01, AREG-02, AREG-03, AREG-04, HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06]

# Metrics
duration: 15min
completed: 2026-03-09
---

# Phase 2 Plan 01: Agent Discovery and Health Backend Summary

**Filesystem-based agent discovery with four-dimension health checks (TCP liveness, JSONL activity, error logs, channel status) and a polling health monitor that broadcasts via eventBus**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-09T18:29:07Z
- **Completed:** 2026-03-09T18:43:49Z
- **Tasks:** 3 (all TDD: RED -> GREEN)
- **Files created:** 11
- **Tests added:** 51 (16 discovery + 28 health + 7 monitor)

## Accomplishments

- Agent discovery service scans ~/.nanobot/workspace/agents/, parses launch scripts for HOME path, reads config.json from agent's isolated home directory
- Health checking across 4 dimensions: TCP port liveness, JSONL session activity recency, error detection (JSONL + error logs), channel status
- Composite health scoring with green/yellow/red using worst-dimension-wins logic
- Health monitor singleton runs every 30 seconds, detects agent additions/removals/status changes, broadcasts via eventBus for SSE
- Four API routes with proper auth (requireRole) and rate limiting

## Task Commits

Each task was committed atomically (TDD: test -> implementation):

1. **Task 1: Types + Agent Discovery** - `d673f4a` (test) -> `2c3bd2f` (feat)
2. **Task 2: Agent Health Checking** - `fca5046` (test) -> `af92d83` (feat)
3. **Task 3: Health Monitor + API Routes** - `2a7e8a0` (test) -> `2826f59` (feat)

## Files Created

- `src/types/agent-health.ts` - All type definitions: DiscoveredAgent, HealthLevel, CompositeHealth, AgentHealthSnapshot, AgentError, ChannelStatus, SessionActivity
- `src/lib/agent-discovery.ts` - Filesystem scanning, launch script parsing, config reading
- `src/lib/agent-health.ts` - Port liveness, JSONL parsing, error detection, composite health scoring
- `src/lib/health-monitor.ts` - Singleton health check loop with eventBus broadcasting
- `src/app/api/agents/discover/route.ts` - GET /api/agents/discover (viewer+, read limiter)
- `src/app/api/agents/[id]/errors/route.ts` - GET /api/agents/{id}/errors (viewer+, read limiter)
- `src/app/api/agents/[id]/errors/dismiss/route.ts` - POST /api/agents/{id}/errors/dismiss (operator+, mutation limiter)
- `src/app/api/agents/[id]/channels/route.ts` - GET /api/agents/{id}/channels (viewer+, read limiter)
- `src/lib/__tests__/agent-discovery.test.ts` - 16 discovery tests
- `src/lib/__tests__/agent-health.test.ts` - 28 health checking tests
- `src/lib/__tests__/health-monitor.test.ts` - 7 monitor tests

## Decisions Made

- Used `@ts-nocheck` on agent-health test file because Vitest mock factories for `node:fs` overloaded methods (openSync, readSync, statSync) conflict with TypeScript's strict overload resolution. Tests run correctly at runtime.
- Synchronous filesystem reads are acceptable for agent discovery (expected <10 agents) since this runs server-side in the health check loop.
- `readLastLines()` reads only the last N bytes of files using `fs.openSync` + `fs.readSync` to avoid loading entire JSONL files (can be 87KB+) or error logs (can be 2.9MB+) into memory.
- Error log entries from Python tracebacks use the current timestamp as approximation since the error log format lacks consistent timestamps.
- Channel "connected" status is derived from gateway port liveness rather than per-channel health checks (no per-channel endpoint exists on the nanobot gateway).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript strict overload resolution for `node:fs` mocked methods in Vitest caused compilation errors. The mock factory replaces `readSync`, `openSync`, `statSync` etc. with `vi.fn()` but TypeScript sees the overloaded signatures and rejects the mock implementations. Resolved with `@ts-nocheck` directive since the mocks work correctly at runtime.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All backend services ready for UI consumption in plans 02-02 (agent card grid) and 02-03 (agent detail slide-out)
- `healthMonitor.getSnapshot()` returns complete `AgentHealthSnapshot[]` for rendering
- `healthMonitor.getAgentSnapshot(id)` returns single agent data for detail panel
- eventBus broadcasts `agent.status_changed`, `agent.created`, `agent.deleted` for real-time SSE updates
- API routes follow established patterns and are ready for client-side fetch

## Self-Check: PASSED

- All 12 files verified present on disk
- All 6 task commits verified in git history
- 175 total tests pass (51 new + 124 existing)
- TypeScript compiles cleanly

---
*Phase: 02-agent-discovery-and-health*
*Completed: 2026-03-09*
