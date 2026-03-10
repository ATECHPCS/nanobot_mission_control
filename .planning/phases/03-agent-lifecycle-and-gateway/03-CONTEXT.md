# Phase 3: Agent Lifecycle and Gateway - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Start, stop, and restart nanobot agents from the dashboard. Proxy gateway health/status queries through MC API routes so the browser never communicates directly with agent gateway ports. This phase adds lifecycle control and HTTP gateway integration on top of Phase 2's agent discovery and health monitoring.

</domain>

<decisions>
## Implementation Decisions

### Lifecycle controls placement
- Controls live in the slide-out panel only — cards stay clean, just showing status
- New "Lifecycle" tab in the slide-out (alongside existing Overview, Errors, Channels)
- Context-aware buttons: running agent shows Stop + Restart; stopped agent shows Start only. No disabled/grayed buttons — only relevant actions visible
- Single restart button (stop + start atomically) — shows "Restarting..." state during operation
- Launch command displayed in the tab (the launch script path and exec command)
- Operation history (last 5-10 entries) shown in the tab with timestamps and usernames ("Stopped by alice at 2:30pm")
- Operation history is in-memory only (Zustand store) — lost on page refresh, good enough for v1
- Buttons + history only in the Lifecycle tab — process details (PID, uptime) stay in the Overview tab, no duplication

### Visual feedback during operations
- Spinner overlay appears on the agent card near the status dot while operation is in progress
- Status dot stays current color until operation completes, then updates
- SSE broadcast lifecycle state changes to all connected operator+ clients — other users see agents start/stop in real time
- Lifecycle SSE events filtered by role — only sent to operator+ connections, not viewers

### Graceful stop and force kill
- Graceful stop sends SIGTERM first
- 10-second timeout before offering Force Kill button (manual escalation, not automatic)
- Force Kill sends SIGKILL to the process group
- Force kill uses same operator+ role as normal stop (no admin escalation needed)

### Confirmation UX
- Modal dialog for stop/restart actions (not start — starting is non-destructive)
- Modal shows: agent name + action + warning about active sessions being interrupted
- Red/danger-styled confirm button for destructive actions (uses existing Tailwind `destructive` token)
- Reuse existing dialog/modal component pattern from the codebase
- Modal closes immediately after confirm click — progress shown via card spinner + Lifecycle tab
- Errors surface via toast notification + inline error in Lifecycle tab operation history

### Gateway proxy design
- Proxy health + status endpoints only (GET /health, GET /status from agent gateways)
- Enhance existing health checks: HTTP health query supplements (not replaces) the TCP port check. TCP confirms process alive, HTTP confirms gateway functioning. Two separate signals.
- Gateway queries run on the same health poll interval (configurable, default 30s) — piggybacked on existing cycle
- 5-second HTTP timeout for gateway health requests
- Viewer role can query gateway health/status through the proxy (read-only, consistent with Phase 2)

### Root agent handling
- Root agent (Andy) gets lifecycle controls via inferred config mechanism
- Launch command inferred from config.json: `nanobot gateway --port {port}`
- Labeled "inferred from config" in the Lifecycle tab to distinguish from script-based agents
- System default HOME used for root agent (no HOME override)
- No BOT_ID environment variable set for root agent
- Same PID-based port lookup and process group kill as sub-agents

### Agents without gateway port
- Lifecycle tab visible but disabled with explanatory message ("No gateway port configured")
- No action buttons shown

### Concurrent operations
- UI lock during lifecycle operations: buttons disabled for that agent across ALL users (via SSE "operation in progress" broadcast)
- Reject conflicting operations: if Start clicked during in-progress Stop, show "Stop in progress — please wait"
- Lock auto-expires after timeout (e.g., 30s) to prevent permanent lockout from hung operations

### RBAC for lifecycle
- Operator+ role required for all lifecycle operations (start, stop, restart, force kill)
- Lifecycle tab entirely hidden for viewer role (not just buttons hidden — tab not in tab bar)
- Tab hiding handles path/PID privacy (no additional path sanitization needed for this tab)
- Operation history shows username of who performed each action

### Process detection and management
- Port-based PID lookup: `lsof -ti :{port}` to find agent process
- Kill entire process group (kill -TERM -- -$PGID) to catch all child processes — no zombies
- Verify process is dead after kill: poll port/ps after SIGTERM. If still alive after 10s, offer Force Kill
- Verify gateway is up after start: poll gateway HTTP health endpoint until it responds, then report "Started successfully"
- Launch agents by running the launch script directly: `bash launch-{name}.sh` as detached child process
- Agent processes fully detached (unref'd) — survive dashboard restart

### Startup failure handling
- Startup errors shown inline in the Lifecycle tab (not toast), with stderr from the failed launch captured
- Smart error hints: detect common patterns ("port in use" → "Port 18793 is already in use", "not found" → "nanobot binary not found in PATH")
- Failure detection window: wait for process exit during gateway startup verification. If process exits, capture stderr. If still running but gateway doesn't respond, it's a different failure.

### Port conflict detection
- Pre-check port availability before starting an agent
- Warn if port is in use: "Port 18793 is in use by Stefany. Starting Cody on the same port will fail."
- Warning is non-blocking — operator can still proceed if they know the conflict is from a zombie process

### Agent output capture
- No ongoing stdout/stderr capture from running agent processes (agents log to their own files)
- Only capture stderr on startup failure for error diagnosis

### Claude's Discretion
- Exact spinner overlay design and positioning on cards
- Gateway health endpoint response schema parsing
- Operation lock implementation details (server-side vs client-side state)
- Smart error hint pattern matching implementation
- Exact confirmation modal copy/wording
- How to handle the gateway verification timeout (how long to poll before declaring "gateway didn't come up")

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/agent-discovery.ts`: Already parses launch scripts (`parseHomeFromLaunchScript`), finds launch scripts (`findLaunchScript`), reads agent config (`readAgentConfig`). Has all agent discovery info needed for lifecycle operations.
- `src/types/agent-health.ts`: `DiscoveredAgent` type already has `launchScript`, `gatewayPort`, `gatewayHost` fields — perfect for lifecycle controls.
- `src/lib/agent-health.ts`: Health checking service — extend with HTTP gateway health queries.
- `src/lib/health-monitor.ts`: Health polling orchestrator — add gateway HTTP queries to the existing cycle.
- `src/components/agents/agent-slide-out.tsx`: Existing slide-out panel with tabs (Overview, Errors, Channels) — add Lifecycle tab.
- `src/components/agents/agent-card.tsx`: Card component — add spinner overlay for in-progress operations.
- `src/lib/event-bus.ts`: SSE broadcast infrastructure — use for lifecycle state change events.
- `src/store/index.ts`: Zustand store — extend with lifecycle operation state and in-memory history.
- `src/app/api/spawn/route.ts`: Existing spawn route (OC-era) — pattern reference for process management API routes, but uses different mechanism (runClawdbot).

### Established Patterns
- API routes: `requireRole()` + `validateBody()` + rate limiting for mutations
- SSE: `eventBus.broadcast()` for real-time updates to connected clients
- Zustand: single store with `useMissionControl` hook
- Component tabs: existing tab pattern in agent-slide-out and agent-detail-tabs

### Integration Points
- `src/components/agents/agent-slide-out.tsx`: Add Lifecycle tab (conditionally shown based on role)
- `src/components/agents/agent-card.tsx`: Add spinner overlay for in-progress lifecycle operations
- `src/lib/agent-health.ts`: Add HTTP gateway health check alongside existing TCP port check
- `src/lib/health-monitor.ts`: Integrate HTTP health queries into existing poll cycle
- `src/store/index.ts`: Add lifecycle state (operation in progress, history, lock state)
- `src/app/api/`: New API routes for lifecycle operations and gateway proxy
- `src/lib/validation.ts`: Add Zod schemas for lifecycle request bodies

</code_context>

<specifics>
## Specific Ideas

- Launch scripts are simple bash: `export HOME=...; export BOT_ID=...; exec nanobot gateway --port {port}`. Dashboard runs them via `bash launch-{name}.sh`.
- Root agent (Andy) has no launch script — infer `nanobot gateway --port {port}` from config.json, use system HOME.
- Process tree kill using PGID (process group) for clean shutdown — no zombie processes.
- Port-based PID lookup via `lsof -ti :{port}` works for both root and sub-agents regardless of how they were started.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-agent-lifecycle-and-gateway*
*Context gathered: 2026-03-09*
