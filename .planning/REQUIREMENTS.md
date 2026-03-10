# Requirements: Nanobot Mission Control

**Defined:** 2026-03-09
**Core Value:** At a glance, know whether every nanobot agent is alive, healthy, and doing what it should be -- and if not, fix it from the dashboard.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUN-01**: OpenClaw gateway protocol fully removed from codebase (WebSocket client, device identity, Ed25519 signing, OpenClaw config)
- [x] **FOUN-02**: Environment variables renamed from OpenClaw conventions to NANOBOT_* namespace
- [x] **FOUN-03**: Existing auth system (session + API key) works without OpenClaw dependencies
- [x] **FOUN-04**: Existing RBAC (viewer/operator/admin) works without OpenClaw dependencies
- [x] **FOUN-05**: Existing kanban task board works without OpenClaw agent references
- [x] **FOUN-06**: Existing webhook system works without OpenClaw event sources
- [x] **FOUN-07**: Existing SSE activity feed infrastructure works without OpenClaw events
- [x] **FOUN-08**: Existing E2E tests pass or are updated for nanobot context

### Agent Registry

- [x] **AREG-01**: Dashboard auto-discovers agents by scanning ~/.nanobot/workspace/agents/ directory
- [x] **AREG-02**: Dashboard reads agent config from each agent's isolated HOME directory config.json
- [x] **AREG-03**: Dashboard displays discovered agents with name, model, gateway port, and workspace path
- [x] **AREG-04**: Dashboard detects new agents added to the workspace without restart (filesystem watching or polling)

### Agent Health

- [x] **HLTH-01**: Dashboard shows process alive/dead status for each agent by checking gateway port liveness
- [x] **HLTH-02**: Dashboard shows last activity timestamp per agent from JSONL session files
- [x] **HLTH-03**: Dashboard shows error state per agent (crash detection, failed tool calls, rate limits)
- [x] **HLTH-04**: Dashboard shows channel status per agent (Telegram/Discord connected/disconnected/error)
- [x] **HLTH-05**: Health checks run on configurable interval (default 30 seconds)
- [x] **HLTH-06**: Agent cards display color-coded status indicators (green/yellow/red)

### Agent Lifecycle

- [x] **LIFE-01**: Operator can start an agent from the dashboard by executing its launch script
- [x] **LIFE-02**: Operator can stop a running agent from the dashboard (proper process tree kill)
- [x] **LIFE-03**: Operator can restart an agent from the dashboard (stop + start)
- [x] **LIFE-04**: Dashboard shows confirmation dialog before stop/restart actions
- [x] **LIFE-05**: Dashboard handles process tree management correctly (kill grandchild processes, not just direct child)

### Gateway Integration

- [x] **GATE-01**: Dashboard communicates with agents via HTTP requests to their gateway ports
- [x] **GATE-03**: Dashboard handles gateway connection failures gracefully (timeout, retry, error display)
- [x] **GATE-04**: All agent communication routes through MC API routes (browser never talks directly to agent ports)

### Session Viewer

- [x] **SESS-01**: User can browse JSONL conversation sessions per agent
- [x] **SESS-02**: Sessions render as chat-style timeline with user messages, agent responses, and tool calls
- [x] **SESS-03**: User can search and filter sessions by date and keyword
- [x] **SESS-04**: Session viewer handles large JSONL files without blocking (streaming/virtualized rendering)

### Token Tracking

- [ ] **TOKN-01**: Dashboard extracts token counts from JSONL session data
- [ ] **TOKN-02**: Dashboard displays per-agent token usage with Recharts visualizations
- [ ] **TOKN-03**: Dashboard shows per-model token breakdown
- [ ] **TOKN-04**: Dashboard shows token usage trends over time

### Memory Management

- [ ] **MEMO-01**: User can browse agent memory files (MEMORY.md, SOUL.md, IDENTITY.md, HISTORY.md)
- [ ] **MEMO-02**: User can browse agent memory subdirectories (episodes/, graph/, procedures/, topics/)
- [ ] **MEMO-03**: User can edit memory files from the dashboard with a markdown editor
- [ ] **MEMO-04**: Memory editor saves changes back to the agent's filesystem
- [ ] **MEMO-05**: Viewer permission role can view but not edit memory files

### Overview Dashboard

- [ ] **DASH-01**: Landing page shows all agents with composite status cards
- [ ] **DASH-02**: Each agent card shows: name, status (alive/dead/error), last activity, channel health, token usage
- [ ] **DASH-03**: Activity feed shows real-time nanobot agent events via SSE
- [ ] **DASH-04**: Error/failure counts displayed prominently with filtering capability

### Remote Access

- [ ] **REMT-01**: Dashboard supports Cloudflare Tunnel for remote access without opening ports
- [ ] **REMT-02**: Documentation for setting up cloudflared with the dashboard
- [ ] **REMT-03**: Dashboard enforces Cloudflare Access (Zero Trust) when tunnel is active

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: Webhook-to-notification bridge for critical agent failures (Telegram/Discord alerts)
- **NOTF-02**: Configurable alert thresholds (agent down > N minutes, error rate > N%)

### Analytics

- **ANLK-01**: Agent performance benchmarking (response times, success rates)
- **ANLK-02**: Historical usage analytics with date range selection

### Scheduling

- **SCHD-01**: Rewired scheduled tasks/cron management from MC fork for nanobot context

### Advanced

- **ADVN-01**: OAuth/SSO integration for larger team deployments
- **ADVN-02**: Multi-machine agent management (agents across different hosts)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cost/dollar tracking | Subscription plans don't have meaningful per-token billing -- volume tracking only |
| Agent-to-agent messaging via dashboard | Agents have their own message bus -- dashboard mediating creates single point of failure |
| Visual workflow/DAG builder | Nanobot agents are autonomous -- DAG implies deterministic orchestration which contradicts the model |
| LLM playground / prompt engineering | Agent behavior is tuned via SOUL.md/IDENTITY.md files, not prompt templates |
| Mobile app | Responsive web UI works on mobile browsers via Cloudflare Tunnel |
| Multi-tenant / multi-workspace | Single-user/small-team tool -- RBAC handles access control |
| Real-time WebSocket for all data | SSE for activity feed + smart polling sufficient -- WebSocket everywhere adds complexity |
| OpenClaw gateway protocol | Replaced entirely with nanobot-native integration |
| Chat/messaging to agents via dashboard | Redundant -- agents are communicated with via Telegram or future chat solution |
| Task dispatch to agents via gateway | Kanban board is for user task tracking only -- agents receive work through their own channels |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUN-01 | Phase 1 | Complete |
| FOUN-02 | Phase 1 | Complete |
| FOUN-03 | Phase 1 | Complete |
| FOUN-04 | Phase 1 | Complete |
| FOUN-05 | Phase 1 | Complete |
| FOUN-06 | Phase 1 | Complete |
| FOUN-07 | Phase 1 | Complete |
| FOUN-08 | Phase 1 | Complete |
| AREG-01 | Phase 2 | Complete |
| AREG-02 | Phase 2 | Complete |
| AREG-03 | Phase 2 | Complete |
| AREG-04 | Phase 2 | Complete |
| HLTH-01 | Phase 2 | Complete |
| HLTH-02 | Phase 2 | Complete |
| HLTH-03 | Phase 2 | Complete |
| HLTH-04 | Phase 2 | Complete |
| HLTH-05 | Phase 2 | Complete |
| HLTH-06 | Phase 2 | Complete |
| LIFE-01 | Phase 3 | Complete |
| LIFE-02 | Phase 3 | Complete |
| LIFE-03 | Phase 3 | Complete |
| LIFE-04 | Phase 3 | Complete |
| LIFE-05 | Phase 3 | Complete |
| GATE-01 | Phase 3 | Complete |
| GATE-03 | Phase 3 | Complete |
| GATE-04 | Phase 3 | Complete |
| SESS-01 | Phase 4 | In Progress (data layer complete, UI pending 04-02) |
| SESS-02 | Phase 4 | In Progress (data layer complete, UI pending 04-02) |
| SESS-03 | Phase 4 | In Progress (data layer complete, UI pending 04-02) |
| SESS-04 | Phase 4 | In Progress (data layer complete, UI pending 04-02) |
| TOKN-01 | Phase 4 | Pending |
| TOKN-02 | Phase 4 | Pending |
| TOKN-03 | Phase 4 | Pending |
| TOKN-04 | Phase 4 | Pending |
| MEMO-01 | Phase 5 | Pending |
| MEMO-02 | Phase 5 | Pending |
| MEMO-03 | Phase 5 | Pending |
| MEMO-04 | Phase 5 | Pending |
| MEMO-05 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |
| DASH-04 | Phase 6 | Pending |
| REMT-01 | Phase 6 | Pending |
| REMT-02 | Phase 6 | Pending |
| REMT-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
