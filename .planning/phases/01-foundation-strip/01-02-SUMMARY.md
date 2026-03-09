---
phase: 01-foundation-strip
plan: 02
subsystem: types, store, auth
tags: [tech-debt, types, typescript, zustand, security]

# Dependency graph
requires:
  - phase: 01-foundation-strip
    provides: "Plans 01-01 and 01-01b completed (OC files deleted, mixed files stripped)"
provides:
  - "src/types/shared.ts: canonical entity type definitions for both server and client code"
  - "src/lib/safe-compare.ts: canonical constant-time string comparison"
  - "No duplicate Zustand store (src/index.ts deleted)"
  - "No any types in files touched by Phase 1"
affects: [01-03, phase-2-agent-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Db*Row types for raw SQLite rows (string JSON columns) vs client types (parsed JSON fields)"
    - "Re-export type aliases in db.ts: DbTaskRow exported as Task for backward compat"
    - "safeCompare extracted to standalone module, imported by auth.ts, local copy in proxy.ts (middleware runtime isolation)"

key-files:
  created:
    - src/types/shared.ts
    - src/lib/safe-compare.ts
  modified:
    - src/lib/db.ts
    - src/store/index.ts
    - src/lib/auth.ts
    - src/proxy.ts
  deleted:
    - src/index.ts

key-decisions:
  - "Created two type tiers in shared.ts: client-facing types (Task, Agent, etc. with parsed JSON fields) and DbXxxRow types (with string JSON columns) for SQLite row shapes"
  - "db.ts re-exports DbTaskRow as Task, DbAgentRow as Agent, etc. so existing server-side consumers importing { Task } from '@/lib/db' get the correct raw-row types without code changes"
  - "proxy.ts keeps a local safeCompare copy instead of importing from auth.ts because middleware runtime cannot import modules that pull in better-sqlite3"
  - "Task priority union reconciled to include both 'critical' and 'urgent' (server had only 'urgent', client had both)"

patterns-established:
  - "Import entity types from @/types/shared for client/component code"
  - "Import from @/lib/db for server-side route handlers (gets DbXxxRow types aliased as short names)"
  - "safeCompare canonical source: src/lib/safe-compare.ts"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-03-09
---

# Phase 1 Plan 02: Tech Debt Cleanup Summary

**Deleted 760-line duplicate Zustand store, consolidated entity types into shared.ts, extracted safeCompare, and replaced any types in Phase 1 files**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09
- **Tasks:** 2
- **Files modified:** 4
- **Files created:** 2
- **Files deleted:** 1

## Accomplishments

- Deleted src/index.ts (760-line dead duplicate of src/store/index.ts, zero imports)
- Created src/types/shared.ts with 18 canonical entity types + 6 DbXxxRow types for SQLite row shapes
- Reconciled Task priority drift: added 'critical' to both server and client type definitions
- Updated src/lib/db.ts to import/re-export types from shared.ts (DbTaskRow as Task, etc.)
- Updated src/store/index.ts to import/re-export all 16 entity types from shared.ts
- Extracted safeCompare into src/lib/safe-compare.ts as canonical implementation
- Fixed timing leak in proxy.ts safeCompare (was returning false immediately on length mismatch)
- Replaced all any types in Phase 1 touched files: db.ts (3), auth.ts (1), store/index.ts (2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete duplicate store and consolidate types** - `ca63f5f` (feat)
2. **Task 2: Fix safeCompare and replace any types** - `ea13341` (fix)

## Files Created/Modified

- `src/types/shared.ts` -- Canonical entity types: Task, Agent, Comment, Activity, Notification, ChatMessage, Conversation, Session, LogEntry, CronJob, SpawnRequest, MemoryFile, TokenUsage, ModelConfig, StandupReport, CurrentUser, ConnectionStatus + Db*Row types
- `src/lib/safe-compare.ts` -- Canonical safeCompare with constant-time comparison and dummy-buffer length-mismatch protection
- `src/lib/db.ts` -- Re-exports Db*Row types as short names (Task, Agent, etc.) for backward compat; replaced 3 any types
- `src/store/index.ts` -- Imports/re-exports from shared.ts; removed ~250 lines of inline type definitions; replaced 2 any types
- `src/lib/auth.ts` -- Imports safeCompare from safe-compare.ts; re-exports for consumers; replaced 1 any type
- `src/proxy.ts` -- Fixed timing leak in local safeCompare; added JSDoc noting relationship to canonical implementation
- `src/index.ts` -- DELETED (760-line duplicate Zustand store)

## Decisions Made

- Created two-tier type system: client types in shared.ts (parsed JSON fields like `tags?: string[]`) and DbXxxRow types (raw SQLite fields like `tags?: string`). db.ts re-exports DbXxxRow under short names so all existing API route imports work unchanged.
- proxy.ts keeps a local safeCompare instead of importing from auth.ts because the middleware runtime cannot import the db -> better-sqlite3 chain. The local copy was fixed to eliminate the timing leak.
- Task priority union reconciled: both 'critical' and 'urgent' included. Server previously lacked 'critical'.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cannot import safeCompare from auth.ts into proxy.ts**
- **Found during:** Task 2 (safeCompare consolidation)
- **Issue:** proxy.ts runs in Next.js middleware runtime. Importing from auth.ts would pull in db.ts -> better-sqlite3 (native module), crashing the middleware.
- **Fix:** Created src/lib/safe-compare.ts as standalone canonical module. auth.ts imports from it. proxy.ts keeps a local copy with a JSDoc explaining why. Both copies are now identical (timing-safe).
- **Files modified:** src/lib/safe-compare.ts (created), src/lib/auth.ts, src/proxy.ts
- **Committed in:** ea13341

**2. [Rule 1 - Bug] db.ts re-exported Activity type had JSON field mismatch**
- **Found during:** Task 1 (type consolidation)
- **Issue:** Initially re-exported shared Activity (with `data?: Record<string, unknown>`) as db.ts Activity, but API routes cast raw rows as Activity and call JSON.parse(activity.data), which requires data to be string type.
- **Fix:** Created DbXxxRow types with string JSON columns and re-exported those under the short names (Task, Agent, etc.) from db.ts. Client code imports from shared.ts directly.
- **Files modified:** src/types/shared.ts, src/lib/db.ts
- **Committed in:** ca63f5f

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both deviations resulted in a cleaner architecture than the plan's simple "import from shared.ts everywhere" approach.

## Issues Encountered

- Build verification could not be run due to bash permission restrictions (pnpm build denied). Type correctness verified via manual analysis of all import chains and type usage patterns.

## User Setup Required

None.

## Next Phase Readiness

- shared.ts provides the canonical type foundation for all future phases
- safe-compare.ts is ready for reuse across the codebase
- Plan 01-03 (E2E tests and final verification) can validate the build and run tests

## Self-Check: PASSED

- src/index.ts verified deleted (test -f fails)
- src/types/shared.ts verified present on disk
- src/lib/safe-compare.ts verified present on disk
- Commit ca63f5f verified in git log (Task 1)
- Commit ea13341 verified in git log (Task 2)
- Both db.ts and store/index.ts import from @/types/shared (grep confirmed)
- safeCompare in proxy.ts has timing-safe length handling (grep confirmed)
- No any types remain in auth.ts, db.ts (logActivity/logAuditEvent/appendProvisionEvent), store/index.ts, proxy.ts

---
*Phase: 01-foundation-strip*
*Completed: 2026-03-09*
