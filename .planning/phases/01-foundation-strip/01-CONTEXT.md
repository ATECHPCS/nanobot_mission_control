# Phase 1: Foundation Strip - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all OpenClaw protocol code from the forked Mission Control codebase and verify that existing features (auth, RBAC, kanban, webhooks, SSE) work standalone. Also clean up known tech debt (duplicate store, type drift, `any` types). Rename environment variables to NANOBOT_* namespace. Delete OpenClaw-only panels. End state: a clean, working Next.js dashboard with zero OpenClaw references.

</domain>

<decisions>
## Implementation Decisions

### Strip approach
- Nuclear clean: remove OpenClaw code AND address tech debt from codebase map
- Delete entire files that are OpenClaw-only (device-identity.ts, agent-sync.ts, websocket.ts client, gateway panels)
- Remove dead panels from nav rail
- Clean up duplicate Zustand store (delete src/index.ts, keep src/store/index.ts)
- Consolidate type definitions into src/types/shared.ts
- Replace `any` types with proper typing where touched

### Environment variables
- Rename all OPENCLAW_*, OC_* env vars to NANOBOT_* namespace immediately
- Update .env.example with new variable names
- Clean break — no backwards compatibility shims

### Panel cleanup
- Remove OpenClaw-only panels entirely: gateway-config-panel, multi-gateway-panel, agent-comms-panel, agent-squad panels
- Keep panels that can be rewired for nanobot: agent-detail-tabs, task-board, settings, super-admin, dashboard
- Remove references from nav-rail.tsx and ContentRouter

### Test strategy
- Run existing E2E test suite, fix what breaks from the strip
- Add basic smoke tests for: auth login/logout, kanban CRUD, webhook delivery, SSE connection
- Update or remove OpenClaw-specific test fixtures in tests/fixtures/

### Claude's Discretion
- Which lib files to delete entirely vs. strip OpenClaw references from
- How to handle the 271 OpenClaw references across 45 files (batch or file-by-file)
- Exact smoke test structure and coverage
- Whether to keep or remove the OpenAPI spec (openapi.json) — it documents OpenClaw endpoints

</decisions>

<code_context>
## Existing Code Insights

### Files to Delete (OpenClaw-only)
- `src/lib/device-identity.ts` — Ed25519 device identity, no nanobot equivalent
- `src/lib/agent-sync.ts` — Syncs agents from OpenClaw gateway, replaced by filesystem discovery
- `src/lib/websocket.ts` — WebSocket client for OpenClaw gateway
- `src/components/panels/gateway-config-panel.tsx` — OpenClaw gateway configuration
- `src/components/panels/multi-gateway-panel.tsx` — Multi-gateway management
- `src/components/panels/agent-comms-panel.tsx` — OpenClaw agent communication
- `src/components/panels/agent-squad-panel.tsx` — Phase 2 agent squad (621 lines)
- `src/components/panels/agent-squad-panel-phase3.tsx` — Phase 3 agent squad (926 lines)
- `scripts/e2e-openclaw/` — OpenClaw E2E test harness
- `tests/fixtures/` — OpenClaw test fixtures (if OC-specific)

### Files to Strip (mixed OpenClaw + core logic)
- `src/lib/config.ts` — 36 OpenClaw references, also has core config logic
- `src/lib/super-admin.ts` — 39 references, tenant provisioning has OC-specific code
- `src/app/api/integrations/route.ts` — 20 references, manages OC environment vars
- `src/app/api/agents/route.ts` — 17 references, agent CRUD mixed with OC sync
- `src/app/api/cron/route.ts` — 15 references, cron triggers use `openclaw` CLI
- `src/app/api/chat/messages/route.ts` — 14 references, chat routing via OC gateway
- `src/components/panels/agent-detail-tabs.tsx` — 12 references, agent details with OC fields

### Established Patterns
- API routes use `requireRole()` + `validateBody()` + `getDatabase()` pattern consistently
- SSE via `eventBus.broadcast()` — this pattern stays, just needs new event types later
- Zustand store is the single client-side source of truth
- All mutations go through API routes, never direct DB access from client

### Integration Points
- `src/app/[[...panel]]/page.tsx` — ContentRouter imports all panels, needs panel references removed
- `src/components/layout/nav-rail.tsx` — Navigation links to panels, needs OC panels removed
- `src/lib/config.ts` — Central config, needs OC env vars replaced with NANOBOT_*
- `src/store/index.ts` — Store has OC-specific state slices that should be cleaned

### Tech Debt to Address
- Delete duplicate store at `src/index.ts` (dead code, type drift)
- Consolidate server/client type definitions into `src/types/shared.ts`
- Fix duplicated `safeCompare` in `src/proxy.ts` (import from `src/lib/auth.ts`)
- Replace `any` types in touched files with proper types

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard codebase surgery. User wants a "nuclear" clean that leaves zero OpenClaw traces and addresses known tech debt.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-strip*
*Context gathered: 2026-03-09*
