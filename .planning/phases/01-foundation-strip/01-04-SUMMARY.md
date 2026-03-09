---
phase: 01-foundation-strip
plan: 04
subsystem: api, ui, infra
tags: [branding, refactoring, env-vars, config, naming]

# Dependency graph
requires:
  - phase: 01-foundation-strip (plans 01-01b, 01-02)
    provides: "NANOBOT_* env var namespace, canonical types, config properties"
provides:
  - "Zero OC references in src/ production code (verified by grep)"
  - "runNanobot() function replacing runOpenClaw()"
  - "NanobotAgentConfig interface replacing OpenClawAgentConfig"
  - "Config with zero legacy aliases -- nanobotBin, nanobotConfigPath, nanobotGatewayHost added"
  - "User-visible branding says Nanobot Mission Control"
  - "No OPENCLAW_* env var reads remain in any API route"
affects: [02-agent-discovery, 03-gateway-integration, 05-pipeline-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NANOBOT_* env vars as sole namespace for all agent runtime config"
    - "Backward-compat JSON field reads (agentId ?? openclawId) for stored data"
    - "DB column names kept as-is with JSDoc annotation for legacy fields"

key-files:
  created: []
  modified:
    - src/lib/command.ts
    - src/lib/config.ts
    - src/lib/agent-templates.ts
    - src/lib/validation.ts
    - src/lib/sessions.ts
    - src/lib/mentions.ts
    - src/app/login/page.tsx
    - src/app/layout.tsx
    - src/app/api/status/route.ts
    - src/app/api/gateways/route.ts
    - src/app/api/gateways/health/route.ts
    - src/app/api/gateway-config/route.ts
    - src/app/api/notifications/deliver/route.ts
    - src/app/api/spawn/route.ts
    - src/app/api/pipelines/run/route.ts
    - src/components/panels/super-admin-panel.tsx

key-decisions:
  - "mentions.ts reads agentId ?? openclawId from stored JSON for backward compat with existing agent configs"
  - "DB column openclaw_home kept as-is (renaming requires migration); annotated with JSDoc"
  - "Config legacy aliases replaced with properly named properties (nanobotBin, nanobotConfigPath, nanobotGatewayHost)"

patterns-established:
  - "Legacy DB column names preserved and annotated rather than migrated"
  - "Stored JSON backward-compat reads use nullish coalescing (newField ?? legacyField)"

requirements-completed: [FOUN-01, FOUN-02]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 1 Plan 04: Foundation Strip Gap Closure Summary

**Eliminated all 89 remaining OpenClaw references across 29 src/ files -- zero OC strings in production code, all function/type/env-var names migrated to nanobot namespace**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T13:04:59Z
- **Completed:** 2026-03-09T13:09:25Z
- **Tasks:** 2
- **Files modified:** 29

## Accomplishments

- Renamed `runOpenClaw` to `runNanobot` in command.ts and all 7 API route consumers
- Removed all 7 legacy config aliases, replaced with properly named properties (nanobotBin, nanobotConfigPath, nanobotGatewayHost, nanobotGatewayPort)
- Updated user-visible branding across login page, layout metadata, local mode banner, and settings panel
- Renamed `OpenClawAgentConfig` to `NanobotAgentConfig` interface and all references
- Replaced all `OPENCLAW_*` env var reads in API routes with `NANOBOT_*` equivalents
- Updated super-admin panel: `openclaw-main` to `nanobot-main`, decommission paths updated

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename core functions, remove config aliases, fix branding and lib files** - `72adc16` (feat)
2. **Task 2: Strip OC references from all API routes** - `9679f7d` (feat)

## Files Created/Modified

- `src/lib/command.ts` - runOpenClaw renamed to runNanobot, uses nanobotBin/nanobotStateDir
- `src/lib/config.ts` - Legacy aliases removed, nanobotBin/nanobotConfigPath/nanobotGatewayHost/nanobotGatewayPort added
- `src/lib/agent-templates.ts` - OpenClawAgentConfig renamed to NanobotAgentConfig
- `src/lib/validation.ts` - openclaw_id to agent_id, provision_openclaw_workspace to provision_workspace
- `src/lib/sessions.ts` - config.openclawStateDir to config.nanobotStateDir, comments updated
- `src/lib/mentions.ts` - openclawId variable renamed to agentId with backward-compat JSON read
- `src/lib/utils.ts` - Comment updated from OpenClaw 2026.3.x to neutral wording
- `src/lib/migrations.ts` - Legacy DB column annotated
- `src/lib/db.ts` - Legacy DB column annotated with JSDoc
- `src/app/login/page.tsx` - Branding: "Nanobot Mission Control"
- `src/app/layout.tsx` - Metadata: "Nanobot Mission Control Dashboard"
- `src/components/layout/local-mode-banner.tsx` - "No nanobot gateway detected"
- `src/components/panels/settings-panel.tsx` - "Gateway connection settings"
- `src/app/api/status/route.ts` - runNanobot, nanobotHome, nanobot regexes, config properties
- `src/app/api/gateways/route.ts` - NANOBOT_GATEWAY_HOST/PORT/TOKEN env vars
- `src/app/api/gateways/health/route.ts` - x-nanobot-version header, hasToolsProfileRisk
- `src/app/api/gateway-config/route.ts` - nanobotConfigPath, NANOBOT_CONFIG_PATH error messages
- `src/app/api/notifications/deliver/route.ts` - runNanobot import and calls
- `src/app/api/spawn/route.ts` - NANOBOT_TOOLS_PROFILE env var, comments
- `src/app/api/tokens/route.ts` - Comment updated
- `src/app/api/sessions/route.ts` - Comment updated
- `src/app/api/logs/route.ts` - Comments and format descriptions updated
- `src/app/api/tasks/[id]/broadcast/route.ts` - runNanobot import and call
- `src/app/api/agents/message/route.ts` - runNanobot import and call
- `src/app/api/agents/[id]/soul/route.ts` - nanobotStateDir, NANOBOT_STATE_DIR error
- `src/app/api/agents/[id]/wake/route.ts` - runNanobot import and call
- `src/app/api/agents/[id]/route.ts` - Comment updated
- `src/app/api/pipelines/run/route.ts` - runNanobot dynamic import and call
- `src/components/panels/super-admin-panel.tsx` - nanobot-main, .nanobot paths

## Decisions Made

- **mentions.ts backward-compat read:** `parsed?.agentId ?? parsed?.openclawId` preserves reading existing stored agent configs that may contain the old field name. This is a data-layer compatibility reference, not a code-level OC dependency.
- **DB column names preserved:** `openclaw_home` column in tenants table kept as-is (renaming requires a SQL migration). Annotated with `-- legacy column name` comment in migrations.ts and JSDoc in db.ts.
- **Config property strategy:** Rather than keeping deprecated aliases, created properly named properties (nanobotBin, nanobotConfigPath, nanobotGatewayHost, nanobotGatewayPort) so no file references old names.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FOUN-01 and FOUN-02 verification gaps fully closed
- Zero OpenClaw references remain in src/ production code
- All function names, env var reads, branding, comments, and types use nanobot namespace
- Ready for Phase 2: Agent Discovery and Health

## Self-Check: PASSED

- Commit 72adc16: FOUND
- Commit 9679f7d: FOUND
- 01-04-SUMMARY.md: FOUND
- Key files exist: VERIFIED
- Zero OC references in production code: VERIFIED

---
*Phase: 01-foundation-strip*
*Completed: 2026-03-09*
