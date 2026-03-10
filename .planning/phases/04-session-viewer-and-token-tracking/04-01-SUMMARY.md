---
phase: 04-session-viewer-and-token-tracking
plan: 01
subsystem: api
tags: [jsonl, sqlite, session-parsing, streaming, readline, zod, api-routes]

# Dependency graph
requires:
  - phase: 02-agent-discovery
    provides: discoverAgents() for agent enumeration and homePath resolution
provides:
  - NanobotSessionMeta/Message/Metadata type definitions
  - JSONL parser with metadata line handling and channel extraction
  - SQLite nanobot_sessions table (migration 028) with session metadata cache
  - readSessionContent and readSessionContentStream for paginated message retrieval
  - GET/POST /api/nanobot-sessions for session listing and sync trigger
  - GET /api/nanobot-sessions/{agent}/{session} for paginated session content
  - parseSessionFilename and parseMetadataKey helper functions
  - CHANNEL_ICONS map for channel type display
  - sessionListQuerySchema and sessionContentQuerySchema Zod validators
affects: [04-02-session-panel-ui, 04-03-token-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns: [jsonl-streaming-readline, sqlite-session-cache, file-size-threshold-routing]

key-files:
  created:
    - src/types/nanobot-session.ts
    - src/lib/nanobot-sessions.ts
    - src/app/api/nanobot-sessions/route.ts
    - src/app/api/nanobot-sessions/[agent]/[session]/route.ts
    - src/lib/__tests__/nanobot-sessions.test.ts
    - src/test/fixtures/sample-session.jsonl
    - src/test/fixtures/sample-session-large.jsonl
  modified:
    - src/lib/migrations.ts
    - src/lib/validation.ts

key-decisions:
  - "1MB file size threshold for switching from readFileSync to streaming readline"
  - "Session metadata extracted from JSONL metadata line key field (channel:identifier format)"
  - "Last user message snippet capped at 60 characters for session list preview"
  - "Sync skips unchanged files by comparing file_size_bytes against cached value"

patterns-established:
  - "JSONL metadata line detection: skip lines with _type === 'metadata' in message arrays"
  - "Dual read strategy: sync readFileSync for small files, async readline stream for large files"
  - "Session filename parsing: first underscore separates channel from identifier"

requirements-completed: [SESS-01, SESS-02, SESS-03, SESS-04]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 4 Plan 01: Session Data Layer Summary

**JSONL parser with SQLite caching, streaming reader for large files, and paginated API routes for nanobot session browsing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T05:26:50Z
- **Completed:** 2026-03-10T05:32:15Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Complete type system for nanobot session metadata, messages, and API responses
- JSONL parser that correctly handles metadata lines, extracts channel info, counts messages, and captures timestamps/snippets
- Streaming readline reader for large JSONL files (>=1MB) with offset/limit pagination
- SQLite migration 028 with nanobot_sessions table, unique constraints, and indexes
- Two API route handlers with RBAC, Zod validation, date range filtering, and search
- 22 passing unit tests covering scan, parse, pagination, and streaming behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, JSONL parser, SQLite migration, and test fixtures** - `3bf4195` (feat)
2. **Task 2: API routes for session listing and content retrieval** - `827fa35` (feat)

## Files Created/Modified
- `src/types/nanobot-session.ts` - Type definitions, helper functions (parseSessionFilename, parseMetadataKey), CHANNEL_ICONS map
- `src/lib/nanobot-sessions.ts` - JSONL parser, scanner, sync, readSessionContent, readSessionContentStream
- `src/lib/migrations.ts` - Added migration 028_nanobot_sessions
- `src/lib/validation.ts` - Added sessionListQuerySchema and sessionContentQuerySchema
- `src/app/api/nanobot-sessions/route.ts` - GET (list) and POST (sync) handlers
- `src/app/api/nanobot-sessions/[agent]/[session]/route.ts` - GET (content) handler with streaming
- `src/lib/__tests__/nanobot-sessions.test.ts` - 22 unit tests
- `src/test/fixtures/sample-session.jsonl` - 5-message test fixture (telegram channel)
- `src/test/fixtures/sample-session-large.jsonl` - 20-message test fixture (cron channel, for pagination testing)

## Decisions Made
- 1MB file size threshold for switching to streaming readline (balances simplicity vs memory safety)
- Session metadata key field (from JSONL metadata line) is authoritative for channel:identifier parsing; filename parsing is fallback
- Last user message capped at 60 chars for session list snippet display
- Sync compares file_size_bytes to skip unchanged files (avoids re-parsing when nothing changed)
- API date range filters use SQLite datetime() function with relative intervals

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in agent-lifecycle.test.ts (4 tests) -- unrelated to this plan's changes, logged but not fixed (out of scope)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Session data layer complete and tested, ready for Sessions Panel UI (Plan 02)
- Token tracking (Plan 03) can use the syncNanobotSessions pattern and nanobot_sessions table
- API routes serve session list from SQLite cache and session content from filesystem

---
*Phase: 04-session-viewer-and-token-tracking*
*Completed: 2026-03-10*
