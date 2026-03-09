# Phase 1: Foundation Strip - Research

**Researched:** 2026-03-09
**Domain:** Codebase surgery -- removing OpenClaw protocol code, env var renaming, tech debt cleanup, smoke tests
**Confidence:** HIGH

## Summary

Phase 1 is a large-scale code removal and cleanup operation on a forked Next.js 16 / React 19 / TypeScript 5.7 dashboard. The codebase has 271 OpenClaw references across 45 files. The work divides into four clear streams: (1) delete OpenClaw-only files entirely, (2) strip OpenClaw references from mixed-purpose files, (3) rename environment variables to NANOBOT_* namespace, and (4) fix known tech debt (duplicate store, type drift, `any` types, duplicated `safeCompare`).

This is not a feature-building phase -- it is pure subtraction and consolidation. The primary risk is breaking existing functionality during the strip. The mitigation is systematic: delete whole files first, then strip mixed files one-by-one, then rename env vars, then fix tech debt, then verify everything compiles and tests pass.

**Primary recommendation:** Work in waves -- deletions first (low risk, high signal), then strips (medium risk), then env renames (high coordination), then tech debt (isolated). Run `pnpm build` and `pnpm test:e2e` after each wave to catch breakage early.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Nuclear clean: remove OpenClaw code AND address tech debt from codebase map
- Delete entire files that are OpenClaw-only (device-identity.ts, agent-sync.ts, websocket.ts client, gateway panels)
- Remove dead panels from nav rail
- Clean up duplicate Zustand store (delete src/index.ts, keep src/store/index.ts)
- Consolidate type definitions into src/types/shared.ts
- Replace `any` types with proper typing where touched
- Rename all OPENCLAW_*, OC_* env vars to NANOBOT_* namespace immediately
- Update .env.example with new variable names
- Clean break -- no backwards compatibility shims
- Remove OpenClaw-only panels entirely: gateway-config-panel, multi-gateway-panel, agent-comms-panel, agent-squad panels
- Keep panels that can be rewired for nanobot: agent-detail-tabs, task-board, settings, super-admin, dashboard
- Remove references from nav-rail.tsx and ContentRouter
- Run existing E2E test suite, fix what breaks from the strip
- Add basic smoke tests for: auth login/logout, kanban CRUD, webhook delivery, SSE connection
- Update or remove OpenClaw-specific test fixtures in tests/fixtures/

### Claude's Discretion
- Which lib files to delete entirely vs. strip OpenClaw references from
- How to handle the 271 OpenClaw references across 45 files (batch or file-by-file)
- Exact smoke test structure and coverage
- Whether to keep or remove the OpenAPI spec (openapi.json) -- it documents OpenClaw endpoints

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUN-01 | OpenClaw gateway protocol fully removed (WebSocket client, device identity, Ed25519, config) | Delete files: websocket.ts, device-identity.ts, agent-sync.ts. Strip config.ts of OC gateway refs. Remove gateway-connect.spec.ts and device-identity.spec.ts tests. |
| FOUN-02 | Environment variables renamed from OpenClaw to NANOBOT_* namespace | Rename OPENCLAW_HOME, OPENCLAW_STATE_DIR, OPENCLAW_GATEWAY_HOST, OPENCLAW_GATEWAY_PORT, NEXT_PUBLIC_GATEWAY_* in config.ts, .env.example, docker-compose.yml, Dockerfile. |
| FOUN-03 | Auth system works without OpenClaw dependencies | Auth (src/lib/auth.ts) has no direct OC deps. Verify session cookie, API key, and Google OAuth paths work after config.ts changes. |
| FOUN-04 | RBAC works without OpenClaw dependencies | RBAC is in auth.ts via requireRole(). Strip super-admin.ts (39 OC refs) without breaking role checks. |
| FOUN-05 | Kanban task board works without OpenClaw agent references | Strip agent-detail-tabs.tsx (12 refs). Task board panel itself has minimal OC coupling -- verify task CRUD API routes. |
| FOUN-06 | Webhook system works without OpenClaw event sources | webhooks.ts listens on eventBus -- remove OC-specific event types. Verify webhook delivery for non-OC events. |
| FOUN-07 | SSE activity feed works without OpenClaw events | event-bus.ts and use-server-events.ts are OC-independent. Remove OC event dispatch from store. Verify SSE endpoint. |
| FOUN-08 | Existing E2E tests pass or updated for nanobot context | Delete OC-specific specs (gateway-connect, device-identity, direct-cli). Update fixtures in tests/fixtures/. Fix remaining specs. |

</phase_requirements>

## Standard Stack

### Core (already in place -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 | App Router framework | Already in place, App Router with API routes |
| React | 19.0.1 | UI rendering | Already in place |
| TypeScript | 5.7.2 | Type safety | Already in place, strict mode |
| Zustand | 5.0.11 | Client state management | Already in place at src/store/index.ts |
| Zod | 4.3.6 | Runtime validation | Already in place for all API routes |
| better-sqlite3 | 12.6.2 | Embedded database | Already in place with WAL mode |
| Vitest | 2.1.5 | Unit testing | Already in place |
| Playwright | 1.51.0 | E2E testing | Already in place |
| pino | 10.3.1 | Server logging | Already in place |

### Supporting (no changes needed)
No new libraries required for Phase 1. This phase only removes code.

### Alternatives Considered
None -- Phase 1 is subtraction only. No new technology decisions.

## Architecture Patterns

### Recommended Work Structure
```
Wave 1: Delete OpenClaw-only files (10 files)
Wave 2: Strip mixed files (7 high-ref files + remaining)
Wave 3: Rename env vars (config.ts, .env.example, docker-compose.yml, Dockerfile)
Wave 4: Tech debt cleanup (duplicate store, shared types, safeCompare, any types)
Wave 5: Test updates and smoke tests
```

### Pattern 1: File Deletion (Wave 1)
**What:** Delete files that are 100% OpenClaw-specific, then fix all import errors.
**When to use:** File has no core MC logic worth keeping.
**Files to delete:**
- `src/lib/device-identity.ts` -- Ed25519 device identity
- `src/lib/agent-sync.ts` -- Syncs agents from OpenClaw gateway
- `src/lib/websocket.ts` -- WebSocket client for OpenClaw gateway
- `src/components/panels/gateway-config-panel.tsx` -- OC gateway config
- `src/components/panels/multi-gateway-panel.tsx` -- Multi-gateway management
- `src/components/panels/agent-comms-panel.tsx` -- OC agent communication
- `src/components/panels/agent-squad-panel.tsx` -- Phase 2 agent squad (621 lines)
- `src/components/panels/agent-squad-panel-phase3.tsx` -- Phase 3 agent squad (926 lines)
- `scripts/e2e-openclaw/` -- OC E2E test harness directory
- `tests/fixtures/openclaw/` -- OC test fixtures (if OC-specific)

**After deletion, fix cascading import errors in:**
- `src/app/[[...panel]]/page.tsx` -- ContentRouter imports deleted panels
- `src/components/layout/nav-rail.tsx` -- Nav links to deleted panels
- `src/store/index.ts` -- Store may reference OC state slices (WebSocket status, gateway state)
- `src/lib/scheduler.ts` -- May import agent-sync for scheduled sync
- Any test files importing deleted modules

### Pattern 2: Reference Stripping (Wave 2)
**What:** Remove OpenClaw-specific code blocks from files that contain both OC and core logic.
**When to use:** File has valuable core logic mixed with OC references.
**Strategy:** For each file, search for `openclaw`, `OpenClaw`, `OPENCLAW`, `gateway`, `oc_`, `OC_` patterns. Remove entire code blocks (functions, conditionals, imports) that are OC-specific. Keep core logic intact.

**High-reference files in priority order:**
1. `src/lib/super-admin.ts` (39 refs) -- Remove OC provisioning commands, keep tenant management
2. `src/lib/config.ts` (36 refs) -- Remove OC env var reads, replace with NANOBOT_* (overlaps Wave 3)
3. `src/app/api/integrations/route.ts` (20 refs) -- Remove OC env var management
4. `src/app/api/agents/route.ts` (17 refs) -- Remove OC agent sync, keep agent CRUD
5. `src/app/api/cron/route.ts` (15 refs) -- Remove `openclaw cron trigger` command execution
6. `src/app/api/chat/messages/route.ts` (14 refs) -- Remove OC gateway chat routing
7. `src/components/panels/agent-detail-tabs.tsx` (12 refs) -- Remove OC-specific agent fields

### Pattern 3: Environment Variable Rename (Wave 3)
**What:** Rename all OPENCLAW_* and OC_* env vars to NANOBOT_* namespace.
**Key renames:**
| Old | New | Used In |
|-----|-----|---------|
| `OPENCLAW_HOME` | `NANOBOT_HOME` | config.ts |
| `OPENCLAW_STATE_DIR` | `NANOBOT_STATE_DIR` | config.ts |
| `OPENCLAW_GATEWAY_HOST` | (delete -- no gateway) | config.ts |
| `OPENCLAW_GATEWAY_PORT` | (delete -- no gateway) | config.ts |
| `NEXT_PUBLIC_GATEWAY_HOST` | (delete -- no gateway) | config.ts |
| `NEXT_PUBLIC_GATEWAY_PORT` | (delete -- no gateway) | config.ts |
| `MC_*` | `NANOBOT_*` or keep MC_* | config.ts, various |

**Note:** MC_* vars (MC_PROVISIONER_SOCKET, MC_ALLOWED_HOSTS, etc.) may stay as-is or rename -- Claude's discretion. The locked decision is to rename OPENCLAW_*/OC_* to NANOBOT_*.

**Files to update:** config.ts, .env.example, .env.test, docker-compose.yml, Dockerfile, docs/*.md, next.config.js (if CSP refs env vars).

### Pattern 4: Tech Debt Cleanup (Wave 4)
**What:** Fix the four identified tech debt items.

**4a. Delete duplicate store:**
- Delete `src/index.ts` (760 lines, dead code)
- Verify no imports reference it (grep confirmed none)

**4b. Consolidate types into shared.ts:**
- Create/expand `src/types/shared.ts` with canonical entity types (Task, Agent, Comment, Notification, Activity, CronJob, etc.)
- Import from both `src/lib/db.ts` (server) and `src/store/index.ts` (client)
- Remove duplicate definitions from both files
- Key drift to fix: `priority` field -- server allows `'urgent'` but not `'critical'`, client allows both

**4c. Fix duplicated safeCompare:**
- Export `safeCompare` from `src/lib/auth.ts`
- Import in `src/proxy.ts`, delete local duplicate
- The proxy version has a timing leak (returns false immediately on length mismatch)

**4d. Replace `any` types in touched files:**
- Use `unknown` for catch blocks: `catch (err: unknown) { const msg = err instanceof Error ? err.message : String(err); }`
- Focus on files already being modified (super-admin.ts, config.ts, scheduler.ts)
- 90 occurrences across 22 files -- only fix in files touched by this phase, not all 22

### Anti-Patterns to Avoid
- **Big-bang refactor:** Do NOT attempt all 271 references in a single commit. Work file-by-file or wave-by-wave with build verification between waves.
- **Leaving dead imports:** After deleting files, grep for all imports of deleted modules. TypeScript will catch most, but dynamic imports or string references may slip through.
- **Renaming env vars without updating all consumers:** Use project-wide grep for each old env var name to ensure complete replacement.
- **Fixing unrelated tech debt:** Only fix `any` types in files already touched by the strip. Do not go on a cleanup spree in untouched files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding all OpenClaw references | Manual file-by-file search | `grep -r "openclaw\|OpenClaw\|OPENCLAW\|oc_\|OC_" src/` | Comprehensive, won't miss references |
| Verifying build after changes | Manual testing | `pnpm build` (catches TS errors + import errors) | Compiler is the best verifier for deletion work |
| Verifying no dead imports remain | Manual code review | `pnpm build && pnpm test` | TypeScript strict mode will flag missing imports |

## Common Pitfalls

### Pitfall 1: Circular Import Breakage
**What goes wrong:** Deleting files that are imported transitively can cause circular dependency errors in seemingly unrelated files.
**Why it happens:** db.ts imports config.ts imports modules that may reference deleted files. The import graph is deeply connected.
**How to avoid:** After each file deletion, run `pnpm build` immediately. Fix errors before proceeding to the next deletion.
**Warning signs:** "Module not found" errors in files you did not touch.

### Pitfall 2: Store State Slices Referencing Deleted Concepts
**What goes wrong:** Zustand store has state slices for OC concepts (gateway status, WebSocket connection state, agent sync state). Deleting the WebSocket hook without cleaning the store leaves orphaned state and broken dispatchers.
**Why it happens:** The store imports types and dispatches events from deleted modules.
**How to avoid:** When deleting websocket.ts, also remove: (a) WebSocket state from store, (b) WebSocket event dispatch from use-server-events.ts, (c) useWebSocket() call from page.tsx.
**Warning signs:** TypeScript errors referencing WebSocket types in store.

### Pitfall 3: ContentRouter and Nav Rail Out of Sync
**What goes wrong:** Deleting panel components without updating both ContentRouter (in page.tsx) and nav-rail.tsx leaves dead routes or navigation links that crash.
**Why it happens:** Panel registration is in two places: the switch statement and the nav config.
**How to avoid:** Always update both files together when removing a panel.
**Warning signs:** Runtime errors when clicking nav links.

### Pitfall 4: Environment Variable Rename Breaks Docker
**What goes wrong:** Renaming env vars in config.ts but not in docker-compose.yml, Dockerfile, or .env.example causes the Docker build or container to use defaults instead of configured values.
**Why it happens:** Env var names are strings -- TypeScript cannot catch mismatches between config.ts reads and docker-compose.yml definitions.
**How to avoid:** Grep for every old env var name across ALL files (not just src/): `grep -r "OPENCLAW" . --include="*.ts" --include="*.js" --include="*.yml" --include="*.env*" --include="*.md" --include="Dockerfile"`.
**Warning signs:** App works in dev (where .env is loaded) but fails in Docker.

### Pitfall 5: E2E Tests Depend on OpenClaw Fixtures
**What goes wrong:** E2E tests in tests/ use fixtures from tests/fixtures/openclaw/ that simulate an OC state directory. Deleting fixtures without updating tests causes test failures.
**Why it happens:** tests/helpers.ts may set up OC fixture paths as environment variables.
**How to avoid:** Review tests/helpers.ts and each spec file for fixture dependencies. Delete OC-specific specs entirely (gateway-connect.spec.ts, device-identity.spec.ts, direct-cli.spec.ts). Update remaining specs to not reference OC fixtures.
**Warning signs:** Test failures mentioning missing fixture files.

### Pitfall 6: openapi.json Documents OC Endpoints
**What goes wrong:** The OpenAPI spec at openapi.json documents endpoints that no longer exist after the strip, causing the /docs page to show dead API documentation.
**Why it happens:** openapi.json is a static file, not auto-generated.
**How to avoid:** Either delete openapi.json entirely (and remove the /docs page import of Scalar), or strip OC-specific endpoint definitions from it. Recommendation: delete it -- it will be rebuilt from scratch when nanobot APIs are defined in later phases.
**Warning signs:** /docs page showing endpoints that return 404.

## Code Examples

### Removing a panel from ContentRouter
```typescript
// In src/app/[[...panel]]/page.tsx
// BEFORE:
case 'gateway-config':
  return <GatewayConfigPanel />;

// AFTER: Delete the case entirely and remove the import at the top:
// import { GatewayConfigPanel } from '@/components/panels/gateway-config-panel';
```

### Removing a nav rail entry
```typescript
// In src/components/layout/nav-rail.tsx
// Remove the entire nav item object for deleted panels from the navigation array
```

### Stripping OC references from config.ts
```typescript
// BEFORE:
export const config = {
  openclawHome: process.env.OPENCLAW_HOME || '~/.openclaw',
  openclawStateDir: process.env.OPENCLAW_STATE_DIR || '',
  gatewayHost: process.env.OPENCLAW_GATEWAY_HOST || 'localhost',
  gatewayPort: parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789'),
  // ... core config
};

// AFTER:
export const config = {
  nanobotHome: process.env.NANOBOT_HOME || '~/.nanobot',
  nanobotStateDir: process.env.NANOBOT_STATE_DIR || '',
  // gateway fields DELETED entirely -- no nanobot equivalent yet
  // ... core config preserved
};
```

### Fixing catch block any types
```typescript
// BEFORE:
catch (err: any) {
  logger.error('Failed:', err.message);
}

// AFTER:
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Failed:', message);
}
```

### Creating shared types
```typescript
// src/types/shared.ts
export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent';
  // ... canonical definition used by both server and client
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenClaw WebSocket gateway | Direct HTTP to nanobot gateway ports | This phase (removal) | No real-time gateway push; polling/HTTP in Phase 3 |
| OPENCLAW_* env vars | NANOBOT_* env vars | This phase | Clean namespace, no OC traces |
| Duplicate type definitions | Shared types in src/types/shared.ts | This phase | Single source of truth for entity types |
| `any` in catch blocks | `unknown` with instanceof guard | This phase (partial) | Better type safety in touched files |

**Deprecated/outdated after this phase:**
- `device-identity.ts`: Ed25519 signing -- not used by nanobot agents
- `agent-sync.ts`: OpenClaw config sync -- replaced by filesystem discovery in Phase 2
- `websocket.ts`: WebSocket client -- nanobot uses HTTP gateway ports
- All gateway panels: No multi-gateway concept in nanobot architecture
- `openapi.json`: Documents OC API endpoints that no longer exist

## Open Questions

1. **MC_* environment variables -- rename or keep?**
   - What we know: OPENCLAW_*/OC_* definitely rename to NANOBOT_*. MC_* vars (MC_PROVISIONER_SOCKET, MC_ALLOWED_HOSTS, MC_RETAIN_*_DAYS, MC_ENABLE_HSTS) are Mission Control specific.
   - What's unclear: Whether MC_* should also become NANOBOT_* for consistency.
   - Recommendation: Keep MC_* as-is for now. They are generic Mission Control config, not OC-specific. Rename only the clearly OC-namespaced vars.

2. **How many of the 30 E2E spec files are OC-specific?**
   - What we know: gateway-connect.spec.ts, device-identity.spec.ts, direct-cli.spec.ts are clearly OC-specific. Others may have OC fixture dependencies.
   - What's unclear: Exact OC coupling in each of the ~30 spec files.
   - Recommendation: Delete the 3 clearly OC specs. Run the remaining suite and fix failures.

3. **openapi.json -- delete or strip?**
   - What we know: It documents OpenClaw API endpoints. The /docs page renders it via Scalar.
   - What's unclear: Whether any non-OC endpoints are documented there that should be preserved.
   - Recommendation: Delete openapi.json and simplify the /docs page. Rebuild API docs in a later phase when nanobot APIs are stable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.5 (unit) + Playwright 1.51.0 (E2E) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUN-01 | No OpenClaw code remains | build + grep | `pnpm build && grep -r "openclaw\|OpenClaw\|OPENCLAW" src/ --include="*.ts" --include="*.tsx"` (expect 0 results) | N/A -- grep check |
| FOUN-02 | Env vars renamed to NANOBOT_* | build + grep | `grep -r "OPENCLAW_\|OC_" src/ .env* docker-compose.yml Dockerfile` (expect 0 results) | N/A -- grep check |
| FOUN-03 | Auth works standalone | E2E | `npx playwright test tests/login-flow.spec.ts tests/auth-guards.spec.ts` | Yes |
| FOUN-04 | RBAC works standalone | E2E | `npx playwright test tests/auth-guards.spec.ts` | Yes |
| FOUN-05 | Kanban works without OC agents | E2E | `npx playwright test tests/tasks-crud.spec.ts` | Yes (assumed) |
| FOUN-06 | Webhooks work without OC events | smoke | `pnpm test -- --grep webhook` | Wave 0 -- needs smoke test |
| FOUN-07 | SSE works without OC events | smoke | `pnpm test -- --grep sse` | Wave 0 -- needs smoke test |
| FOUN-08 | E2E tests pass | E2E | `pnpm test:e2e` | Yes -- existing suite |

### Sampling Rate
- **Per task commit:** `pnpm build` (catches import and type errors from deletions)
- **Per wave merge:** `pnpm build && pnpm test && pnpm test:e2e`
- **Phase gate:** Full suite green + grep verification of zero OC references

### Wave 0 Gaps
- [ ] Smoke test for webhook delivery: `src/lib/__tests__/webhooks-smoke.test.ts`
- [ ] Smoke test for SSE connection: `src/lib/__tests__/sse-smoke.test.ts`
- [ ] Smoke test for auth login/logout: `src/lib/__tests__/auth-smoke.test.ts` (or verify existing E2E covers this)
- [ ] Smoke test for kanban CRUD: verify `tests/tasks-crud.spec.ts` exists and covers basic CRUD

## Sources

### Primary (HIGH confidence)
- Project codebase analysis documents: ARCHITECTURE.md, STRUCTURE.md, CONCERNS.md, STACK.md -- direct inspection of current state
- CONTEXT.md -- user decisions from discussion phase
- REQUIREMENTS.md -- phase requirement IDs and descriptions

### Secondary (MEDIUM confidence)
- File reference counts (271 across 45 files) -- from codebase map analysis, verified in CONTEXT.md

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase inspection, no external sources needed for this phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, existing stack fully documented
- Architecture: HIGH -- deletion/stripping patterns are straightforward; all target files identified
- Pitfalls: HIGH -- common codebase surgery risks, verified against actual import graph
- Test strategy: MEDIUM -- exact OC coupling in each E2E spec needs runtime verification

**Research date:** 2026-03-09
**Valid until:** No expiration -- codebase surgery research is stable (no external dependencies to change)
