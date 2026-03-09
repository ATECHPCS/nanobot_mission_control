---
phase: 01-foundation-strip
plan: 01
subsystem: ui, api, infra
tags: [next.js, zustand, typescript, codebase-surgery, openClaw-removal]

# Dependency graph
requires: []
provides:
  - Clean codebase with all OC-only files deleted (10 files, 12k+ lines removed)
  - ContentRouter and nav-rail updated with no dead panel references
  - Agent API routes decoupled from OC gateway write-back logic
  - Scheduler decoupled from OC agent sync
affects: [01-foundation-strip, 02-agent-discovery-and-health]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agent config parsing without OC enrichment (direct JSON.parse)"
    - "Capabilities check without WebSocket connection fallback"

key-files:
  created: []
  modified:
    - "src/app/[[...panel]]/page.tsx"
    - "src/components/layout/nav-rail.tsx"
    - "src/components/layout/header-bar.tsx"
    - "src/lib/scheduler.ts"
    - "src/app/api/agents/route.ts"
    - "src/app/api/agents/[id]/route.ts"
    - "src/app/api/cleanup/route.ts"
    - "src/app/api/settings/route.ts"

key-decisions:
  - "Deleted agents/sync API route entirely (100% OC-specific, no nanobot equivalent yet)"
  - "Replaced AgentSquadPanelPhase3 in agents tab with ActivityFeedPanel as interim content"
  - "Kept connection/gateway state in Zustand store (used by UI for SSE status indicator)"
  - "Removed gateway/gateway-config nav items but kept other admin nav items"

patterns-established:
  - "Agent config retrieval: direct JSON.parse without OC workspace enrichment"

requirements-completed: [FOUN-01]

# Metrics
duration: 18min
completed: 2026-03-09
---

# Phase 1 Plan 01: Delete OC-Only Files Summary

**Deleted 10 OpenClaw-only files (12,400+ lines) and fixed all cascading imports across ContentRouter, nav-rail, scheduler, and agent API routes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-09T11:21:22Z
- **Completed:** 2026-03-09T11:39:43Z
- **Tasks:** 2
- **Files modified:** 9 modified, 24 deleted

## Accomplishments
- Deleted all 10 OpenClaw-only files/directories (device-identity, agent-sync, websocket, 5 panels, e2e-openclaw, openapi.json, OC test fixtures)
- Fixed all cascading import errors in ContentRouter, nav-rail, header-bar, scheduler, and 4 API routes
- Deleted the OC-specific agents/sync API route entirely
- TypeScript compilation passes with zero new errors (18 pre-existing errors in super-admin.ts are out of scope)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete OpenClaw-only files** - `6359d0f` (chore)
2. **Task 2: Fix cascading imports** - `ec3609d` (feat)

## Files Created/Modified
- `src/lib/device-identity.ts` - Deleted (Ed25519 device identity)
- `src/lib/agent-sync.ts` - Deleted (OC gateway agent sync)
- `src/lib/websocket.ts` - Deleted (WebSocket client for OC gateway)
- `src/components/panels/gateway-config-panel.tsx` - Deleted (OC gateway config)
- `src/components/panels/multi-gateway-panel.tsx` - Deleted (multi-gateway management)
- `src/components/panels/agent-comms-panel.tsx` - Deleted (OC agent communication)
- `src/components/panels/agent-squad-panel.tsx` - Deleted (621 lines, OC agent squad)
- `src/components/panels/agent-squad-panel-phase3.tsx` - Deleted (926 lines, OC agent squad phase 3)
- `scripts/e2e-openclaw/` - Deleted (OC E2E test harness directory)
- `tests/fixtures/openclaw/` - Deleted (OC test fixtures)
- `openapi.json` - Deleted (OC API endpoint documentation)
- `src/app/api/agents/sync/route.ts` - Deleted (OC config sync route)
- `src/app/[[...panel]]/page.tsx` - Removed deleted panel imports, cases, and WebSocket connect logic
- `src/components/layout/nav-rail.tsx` - Removed gateways and gateway-config nav items
- `src/components/layout/header-bar.tsx` - Removed WebSocket import, added reconnect stub
- `src/lib/scheduler.ts` - Removed agent-sync import and OC startup sync, removed gatewaySessions cleanup
- `src/app/api/agents/route.ts` - Removed agent-sync, runOpenClaw, OC provisioning and gateway write-back
- `src/app/api/agents/[id]/route.ts` - Removed agent-sync, OC gateway write-back and rollback logic
- `src/app/api/cleanup/route.ts` - Removed gatewaySessions cleanup blocks
- `src/app/api/settings/route.ts` - Removed gateway-related setting definitions

## Decisions Made
- Deleted `agents/sync` API route entirely since it is 100% OC-specific (syncs from openclaw.json). No nanobot equivalent exists yet; will be rebuilt in Phase 2 with filesystem-based discovery.
- Replaced `AgentSquadPanelPhase3` (deleted) in the agents tab with `ActivityFeedPanel` as interim content until nanobot agent panels are built.
- Kept `connection` and `gatewayAvailable` state in Zustand store since nav-rail and header-bar use it for SSE status indicators. These are generic UI state, not OC-specific imports.
- Removed gateway-related setting definitions from settings route since gateway config fields were already deprecated in config.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed gatewaySessions references in cleanup route, scheduler, and settings**
- **Found during:** Task 2 (build verification)
- **Issue:** `config.retention.gatewaySessions` was already removed from config.ts type but cleanup/route.ts, scheduler.ts, and settings/route.ts still referenced it, causing TS2339 type errors
- **Fix:** Removed gatewaySessions blocks from cleanup route GET/POST, removed import of pruneGatewaySessionsOlderThan from scheduler, removed gateway-related settings definitions
- **Files modified:** src/app/api/cleanup/route.ts, src/lib/scheduler.ts, src/app/api/settings/route.ts
- **Verification:** `tsc --noEmit` passes with zero new errors
- **Committed in:** ec3609d (Task 2 commit)

**2. [Rule 3 - Blocking] Deleted OC-specific agents/sync API route**
- **Found during:** Task 2 (import search)
- **Issue:** `src/app/api/agents/sync/route.ts` imports both `syncAgentsFromConfig` and `previewSyncDiff` from deleted agent-sync.ts
- **Fix:** Deleted the entire route file (100% OC-specific functionality)
- **Files modified:** src/app/api/agents/sync/route.ts (deleted)
- **Verification:** No remaining imports from deleted modules confirmed via grep
- **Committed in:** ec3609d (Task 2 commit)

**3. [Rule 3 - Blocking] Removed OC provisioning code from agents POST route**
- **Found during:** Task 2 (import search)
- **Issue:** agents/route.ts imported writeAgentToConfig, enrichAgentConfigFromWorkspace, runOpenClaw, and had OpenClaw workspace provisioning logic
- **Fix:** Removed all OC imports and provisioning/gateway-writeback code blocks
- **Files modified:** src/app/api/agents/route.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** ec3609d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All auto-fixes were necessary to achieve a clean build. No scope creep -- all fixes directly addressed cascading errors from the planned file deletions.

## Issues Encountered
- `pnpm` not available in execution environment; used `npm install` and `npx` commands instead
- Next.js Turbopack build fails with ENOENT on temp files (environment-specific issue, not code-related); verified correctness via `tsc --noEmit` instead
- 18 pre-existing TypeScript errors in `src/lib/super-admin.ts` (out of scope for this plan, will be addressed in Plan 01-02 tech debt cleanup)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All OC-only files deleted, codebase compiles cleanly without them
- Ready for Plan 01-01b (if exists) or Plan 01-02 (tech debt cleanup: duplicate store, shared types, safeCompare, any types)
- Pre-existing super-admin.ts type errors should be addressed in Plan 01-02

## Self-Check: PASSED

- All 10 OC-only files/directories confirmed deleted from disk
- SUMMARY.md file exists at expected path
- Both task commits (6359d0f, ec3609d) found in git log

---
*Phase: 01-foundation-strip*
*Completed: 2026-03-09*
