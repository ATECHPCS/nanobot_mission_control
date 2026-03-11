# Roadmap: Nanobot Mission Control

## Overview

Transform the Mission Control fork from an OpenClaw-protocol dashboard into a nanobot-native operations console. The journey starts by stripping OpenClaw dead code and verifying the existing foundation, then builds upward: discover agents from the filesystem, monitor their health, control their lifecycles via gateway integration, expose their session logs and token usage, enable memory editing, and finally synthesize everything into a unified dashboard with remote access.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation Strip** - Remove OpenClaw protocol and verify existing MC features work cleanly
- [x] **Phase 2: Agent Discovery and Health** - Auto-discover nanobot agents and monitor their process/channel health
- [ ] **Phase 3: Agent Lifecycle and Gateway** - Start/stop/restart agents and communicate via HTTP gateway
- [x] **Phase 4: Session Viewer and Token Tracking** - Browse JSONL conversation logs and visualize token usage
- [x] **Phase 5: Memory Management** - Browse and edit agent memory files from the dashboard (completed 2026-03-10)
- [ ] **Phase 6: Overview Dashboard and Remote Access** - Unified multi-agent dashboard with Cloudflare Tunnel support

## Phase Details

### Phase 1: Foundation Strip
**Goal**: A clean codebase free of OpenClaw protocol code where all existing MC features (auth, RBAC, kanban, webhooks, SSE, tests) work without OpenClaw dependencies
**Depends on**: Nothing (first phase)
**Requirements**: FOUN-01, FOUN-02, FOUN-03, FOUN-04, FOUN-05, FOUN-06, FOUN-07, FOUN-08
**Success Criteria** (what must be TRUE):
  1. No OpenClaw-specific code remains in the codebase (WebSocket client, device identity, Ed25519 signing, OpenClaw config files are all removed)
  2. User can log in, manage sessions, and use API keys without any OpenClaw dependencies
  3. User can create, move, and manage kanban tasks without references to OpenClaw agents
  4. Webhook system accepts events, delivers payloads, and retries failures without OpenClaw event sources
  5. All existing E2E tests pass or have been updated to reflect nanobot context
**Plans**: 6 plans

Plans:
- [x] 01-01-PLAN.md -- Delete OC-only files, fix cascading imports
- [x] 01-01b-PLAN.md -- Strip mixed files of OC references, rename env vars to NANOBOT_*
- [x] 01-02-PLAN.md -- Tech debt cleanup (duplicate store, shared types, safeCompare, any types)
- [x] 01-03-PLAN.md -- Update E2E tests, add smoke tests, final verification
- [ ] 01-04-PLAN.md -- [GAP CLOSURE] Strip remaining 89 OC references from 31 untouched files
- [ ] 01-05-PLAN.md -- [GAP CLOSURE] Build/test verification and visual branding check

### Phase 2: Agent Discovery and Health
**Goal**: Dashboard automatically finds nanobot agents on the filesystem and continuously monitors whether each agent process is alive, when it was last active, whether it has errors, and whether its channels are connected
**Depends on**: Phase 1
**Requirements**: AREG-01, AREG-02, AREG-03, AREG-04, HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06
**Success Criteria** (what must be TRUE):
  1. Dashboard displays all agents found in ~/.nanobot/workspace/agents/ with their name, model, gateway port, and workspace path -- without manual configuration
  2. Adding a new agent directory to the workspace causes it to appear in the dashboard without a restart
  3. Each agent card shows a color-coded status indicator (green/yellow/red) reflecting process liveness, last activity, error state, and channel health
  4. Health data refreshes automatically on a configurable interval (default 30 seconds) without manual page reload
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Types, agent discovery service, health checking, health monitor, API routes (Wave 1)
- [x] 02-02-PLAN.md -- Zustand store, agent card grid UI, summary bar, toast, nav-rail wiring (Wave 2)
- [x] 02-03-PLAN.md -- Slide-out detail panel, RBAC, keyboard nav, visual verification (Wave 3)

### Phase 3: Agent Lifecycle and Gateway
**Goal**: Operators can start, stop, and restart nanobot agents directly from the dashboard, and the dashboard communicates with running agents via their HTTP gateway ports
**Depends on**: Phase 2
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, GATE-01, GATE-03, GATE-04
**Success Criteria** (what must be TRUE):
  1. Operator can start a stopped agent from the dashboard and see it transition to alive/green status within one health check cycle
  2. Operator can stop a running agent from the dashboard (with confirmation dialog) and all processes in the agent's tree are killed (no zombie processes)
  3. Gateway health/status queries route through MC API routes -- browser never communicates directly with agent gateway ports
  4. Gateway connection failures (agent down, timeout, port unreachable) display clear error messages rather than silent failures or crashes
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Lifecycle service, gateway proxy, API routes, health monitor locks, unit tests (Wave 1)
- [ ] 03-02-PLAN.md -- Zustand lifecycle state, Lifecycle tab, confirm modal, card spinner, SSE events, visual verification (Wave 2)

### Phase 4: Session Viewer and Token Tracking
**Goal**: Users can browse agent conversation history from JSONL session files and see per-agent, per-model token usage visualized over time
**Depends on**: Phase 2
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, TOKN-01, TOKN-02, TOKN-03, TOKN-04
**Success Criteria** (what must be TRUE):
  1. User can select an agent and browse its JSONL conversation sessions rendered as a chat-style timeline with user messages, agent responses, and tool calls
  2. User can search sessions by keyword and filter by date to find specific conversations
  3. Session viewer handles large JSONL files (10MB+) without freezing the browser (streaming or virtualized rendering)
  4. Dashboard displays per-agent and per-model token usage charts (Recharts) with trend lines showing usage over time
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md -- Types, JSONL parser, SQLite migration, API routes, unit tests (Wave 1)
- [x] 04-02-PLAN.md -- Three-column Sessions panel UI with chat viewer, search/filter, deep linking (Wave 2)
- [x] 04-03-PLAN.md -- Unified Tokens panel with Recharts charts, stats cards, per-model breakdown (Wave 2)

### Phase 5: Memory Management
**Goal**: Users can browse and edit agent memory files (MEMORY.md, SOUL.md, IDENTITY.md, etc.) from the dashboard with RBAC-gated editing
**Depends on**: Phase 2
**Requirements**: MEMO-01, MEMO-02, MEMO-03, MEMO-04, MEMO-05
**Success Criteria** (what must be TRUE):
  1. User can browse an agent's memory files (MEMORY.md, SOUL.md, IDENTITY.md, HISTORY.md) and subdirectories (episodes/, graph/, procedures/, topics/) from the dashboard
  2. User with operator/admin role can edit a memory file using the markdown editor and the change persists to the agent's filesystem
  3. Viewer-role users can read memory files but the edit controls are not available to them
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md -- Memory files service, unit tests, API routes for file tree and read/write (Wave 1)
- [x] 05-02-PLAN.md -- Memory tab UI: file tree, editor/viewer, slide-out wiring, visual verification (Wave 2)

### Phase 6: Overview Dashboard and Remote Access
**Goal**: Agent-centric landing page showing all agents with composite status at a glance, real-time activity feed, and error summary -- replacing the legacy overview dashboard
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. Landing page shows all agents as composite status cards displaying name, alive/dead/error status, last activity, channel health, and token usage
  2. Activity feed shows real-time nanobot agent events via SSE without manual refresh
  3. Error and failure counts are displayed prominently and can be filtered
**Plans**: 4 plans

Plans:
- [x] 06-01-PLAN.md -- New dashboard components (MetricStrip, ActivityFeedInline, ErrorSummaryPanel), nav rail cleanup, live-feed removal (Wave 1)
- [x] 06-02-PLAN.md -- OverviewLanding composition, ContentRouter wiring, legacy file deletion, visual verification (Wave 2)
- [ ] 06-03-PLAN.md -- [GAP CLOSURE] Add message count to agent cards (DASH-02 fix)
- [ ] 06-04-PLAN.md -- [GAP CLOSURE] Add cached token display to Token Usage page

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 4 depends on Phase 2 (not Phase 3), so Phases 3 and 4 could theoretically run in parallel.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Strip | 4/6 | Gap closure | - |
| 2. Agent Discovery and Health | 3/3 | Complete | 2026-03-09 |
| 3. Agent Lifecycle and Gateway | 1/2 | In progress | - |
| 4. Session Viewer and Token Tracking | 3/3 | Complete   | 2026-03-10 |
| 5. Memory Management | 2/2 | Complete   | 2026-03-10 |
| 6. Overview Dashboard and Remote Access | 2/4 | Gap closure | - |
