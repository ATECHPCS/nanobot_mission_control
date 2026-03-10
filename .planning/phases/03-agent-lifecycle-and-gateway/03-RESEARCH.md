# Phase 3: Agent Lifecycle and Gateway - Research

**Researched:** 2026-03-09
**Domain:** Process lifecycle management, gateway HTTP proxy, real-time UI state, confirmation UX
**Confidence:** HIGH

## Summary

Phase 3 adds lifecycle control (start/stop/restart) for nanobot agents and proxies gateway health/status queries through the Mission Control API. The codebase from Phase 2 already has all the infrastructure needed: agent discovery with launch scripts and gateway ports, TCP port liveness checking, SSE event broadcasting, Zustand store with agent health snapshots, and a slide-out panel with extensible tabs.

The core technical challenge is Node.js process management on macOS: spawning detached child processes via `bash launch-{name}.sh`, killing process groups via PGID to avoid zombie processes, and handling the async lifecycle (port availability pre-check, spawn, poll for gateway liveness, error capture). The nanobot gateway process does NOT expose an HTTP health endpoint -- the current Phase 2 TCP port check (`net.Socket` connect) is the only reliable liveness signal. Gateway "health" in this phase means: TCP port responds (process alive) plus HTTP fetch attempt (gateway functional). The HTTP health endpoint may not exist in nanobot v0.1.4, so the HTTP check should be treated as a supplementary signal that gracefully degrades to TCP-only.

The UI work involves: a new Lifecycle tab in the slide-out panel (conditionally hidden for viewer role), a confirmation modal component (built from scratch using existing Tailwind patterns -- no dialog library in the codebase), spinner overlay on agent cards during operations, and real-time SSE broadcast of lifecycle state changes to all operator+ clients.

**Primary recommendation:** Build three new API routes (`POST /api/agents/{id}/start`, `POST /api/agents/{id}/stop`, `GET /api/agents/{id}/gateway/{endpoint}`) that handle process management server-side. Use `child_process.spawn` with `detached: true` + `unref()` for launching agents, and `lsof -ti :{port}` + `kill -TERM -- -{pgid}` for stopping them. Extend the Zustand store with lifecycle operation state (per-agent locks, operation history). Build a simple confirmation modal component. No new npm dependencies required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Controls live in the slide-out panel only -- cards stay clean, just showing status
- New "Lifecycle" tab in the slide-out (alongside existing Overview, Errors, Channels)
- Context-aware buttons: running agent shows Stop + Restart; stopped agent shows Start only. No disabled/grayed buttons -- only relevant actions visible
- Single restart button (stop + start atomically) -- shows "Restarting..." state during operation
- Launch command displayed in the tab (the launch script path and exec command)
- Operation history (last 5-10 entries) shown in the tab with timestamps and usernames ("Stopped by alice at 2:30pm")
- Operation history is in-memory only (Zustand store) -- lost on page refresh, good enough for v1
- Buttons + history only in the Lifecycle tab -- process details (PID, uptime) stay in the Overview tab, no duplication
- Spinner overlay appears on the agent card near the status dot while operation is in progress
- Status dot stays current color until operation completes, then updates
- SSE broadcast lifecycle state changes to all connected operator+ clients -- other users see agents start/stop in real time
- Lifecycle SSE events filtered by role -- only sent to operator+ connections, not viewers
- Graceful stop sends SIGTERM first
- 10-second timeout before offering Force Kill button (manual escalation, not automatic)
- Force Kill sends SIGKILL to the process group
- Force kill uses same operator+ role as normal stop (no admin escalation needed)
- Modal dialog for stop/restart actions (not start -- starting is non-destructive)
- Modal shows: agent name + action + warning about active sessions being interrupted
- Red/danger-styled confirm button for destructive actions (uses existing Tailwind `destructive` token)
- Reuse existing dialog/modal component pattern from the codebase
- Modal closes immediately after confirm click -- progress shown via card spinner + Lifecycle tab
- Errors surface via toast notification + inline error in Lifecycle tab operation history
- Proxy health + status endpoints only (GET /health, GET /status from agent gateways)
- Enhance existing health checks: HTTP health query supplements (not replaces) the TCP port check. TCP confirms process alive, HTTP confirms gateway functioning. Two separate signals.
- Gateway queries run on the same health poll interval (configurable, default 30s) -- piggybacked on existing cycle
- 5-second HTTP timeout for gateway health requests
- Viewer role can query gateway health/status through the proxy (read-only, consistent with Phase 2)
- Root agent (Andy) gets lifecycle controls via inferred config mechanism
- Launch command inferred from config.json: `nanobot gateway --port {port}`
- Labeled "inferred from config" in the Lifecycle tab to distinguish from script-based agents
- System default HOME used for root agent (no HOME override)
- No BOT_ID environment variable set for root agent
- Same PID-based port lookup and process group kill as sub-agents
- Lifecycle tab visible but disabled with explanatory message ("No gateway port configured") for agents without gateway port
- No action buttons shown for agents without gateway port
- UI lock during lifecycle operations: buttons disabled for that agent across ALL users (via SSE "operation in progress" broadcast)
- Reject conflicting operations: if Start clicked during in-progress Stop, show "Stop in progress -- please wait"
- Lock auto-expires after timeout (e.g., 30s) to prevent permanent lockout from hung operations
- Operator+ role required for all lifecycle operations (start, stop, restart, force kill)
- Lifecycle tab entirely hidden for viewer role (not just buttons hidden -- tab not in tab bar)
- Tab hiding handles path/PID privacy (no additional path sanitization needed for this tab)
- Operation history shows username of who performed each action
- Port-based PID lookup: `lsof -ti :{port}` to find agent process
- Kill entire process group (kill -TERM -- -$PGID) to catch all child processes -- no zombies
- Verify process is dead after kill: poll port/ps after SIGTERM. If still alive after 10s, offer Force Kill
- Verify gateway is up after start: poll gateway HTTP health endpoint until it responds, then report "Started successfully"
- Launch agents by running the launch script directly: `bash launch-{name}.sh` as detached child process
- Agent processes fully detached (unref'd) -- survive dashboard restart
- Startup errors shown inline in the Lifecycle tab (not toast), with stderr from the failed launch captured
- Smart error hints: detect common patterns ("port in use" -> "Port 18793 is already in use", "not found" -> "nanobot binary not found in PATH")
- Failure detection window: wait for process exit during gateway startup verification. If process exits, capture stderr. If still running but gateway doesn't respond, it's a different failure.
- Pre-check port availability before starting an agent
- Warn if port is in use: "Port 18793 is in use by Stefany. Starting Cody on the same port will fail."
- Warning is non-blocking -- operator can still proceed if they know the conflict is from a zombie process
- No ongoing stdout/stderr capture from running agent processes (agents log to their own files)
- Only capture stderr on startup failure for error diagnosis

### Claude's Discretion
- Exact spinner overlay design and positioning on cards
- Gateway health endpoint response schema parsing
- Operation lock implementation details (server-side vs client-side state)
- Smart error hint pattern matching implementation
- Exact confirmation modal copy/wording
- How to handle the gateway verification timeout (how long to poll before declaring "gateway didn't come up")

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIFE-01 | Operator can start an agent from the dashboard by executing its launch script | Process spawning via `child_process.spawn` with detached+unref, port pre-check, gateway verification polling, stderr capture on failure |
| LIFE-02 | Operator can stop a running agent from the dashboard (proper process tree kill) | PID lookup via `lsof -ti :{port}`, PGID extraction via `ps -o pgid=`, process group kill via `kill -TERM -- -{pgid}`, 10s timeout then force kill offer |
| LIFE-03 | Operator can restart an agent from the dashboard (stop + start) | Atomic restart = sequential stop then start, "Restarting..." intermediate state in UI |
| LIFE-04 | Dashboard shows confirmation dialog before stop/restart actions | Custom modal component with danger-styled confirm button, no modal for start (non-destructive) |
| LIFE-05 | Dashboard handles process tree management correctly (kill grandchild processes, not just direct child) | PGID-based process group kill ensures entire process tree is terminated |
| GATE-01 | Dashboard communicates with agents via HTTP requests to their gateway ports | Proxy API route at `/api/agents/{id}/gateway/{endpoint}`, HTTP fetch with 5s timeout |
| GATE-03 | Dashboard handles gateway connection failures gracefully (timeout, retry, error display) | 5s HTTP timeout, graceful degradation to TCP-only, clear error messages for connection refused/timeout/unreachable |
| GATE-04 | All agent communication routes through MC API routes (browser never talks directly to agent ports) | Proxy pattern: browser -> MC API -> agent gateway; no CORS needed, ports stay internal |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `child_process` | built-in | Spawn/kill agent processes | Native, no deps needed |
| Node.js `net` | built-in | TCP port liveness checks | Already used in Phase 2 `checkPortAlive()` |
| Node.js `fetch` | built-in (Node 18+) | HTTP gateway health queries | Native fetch available in Next.js server runtime |
| Zod | 4.3.6 | Request body validation | Already used in `src/lib/validation.ts` |
| Zustand | 5.0.11 | Client state for lifecycle ops | Already used in `src/store/index.ts` |
| SSE (EventSource) | built-in | Real-time lifecycle event broadcast | Already used via `src/lib/event-bus.ts` + `src/lib/use-server-events.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lsof` | system | PID lookup by port | macOS built-in, used for port->PID resolution |
| `ps` | system | PGID extraction | macOS built-in, used for PID->PGID mapping |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lsof -ti :{port}` | `fuser {port}/tcp` | `lsof` is more portable on macOS; `fuser` has different flags per platform |
| Custom modal | Headless UI Dialog | Adds dependency; project has no component library, custom is simpler for one modal |
| Server-side operation locks | Client-only locks via SSE | Server-side is more reliable for multi-user; prevents race conditions |

**Installation:**
```bash
# No new dependencies required -- everything is built-in or already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/api/agents/[id]/
    start/route.ts          # POST - start agent
    stop/route.ts           # POST - stop agent (SIGTERM)
    force-stop/route.ts     # POST - force kill agent (SIGKILL)
    gateway/[...path]/route.ts  # GET - proxy to agent gateway
  lib/
    agent-lifecycle.ts      # Server-side process management (spawn, kill, PGID)
    agent-gateway.ts        # HTTP gateway proxy/health queries
  components/agents/
    agent-lifecycle-tab.tsx  # Lifecycle tab UI
    confirm-modal.tsx       # Confirmation dialog component
    lifecycle-spinner.tsx   # Card spinner overlay (or inline in agent-card.tsx)
  store/index.ts            # Extended with lifecycle state
  lib/validation.ts         # Extended with lifecycle schemas
  types/agent-health.ts     # Extended with lifecycle types
```

### Pattern 1: Server-Side Process Management
**What:** All process management happens in API routes on the server. The browser never directly spawns or kills processes.
**When to use:** Always -- security and correctness require server-side execution.
**Example:**
```typescript
// src/lib/agent-lifecycle.ts
import { spawn, execSync } from 'node:child_process'

/**
 * Find PID of process listening on a port.
 * Returns null if no process found.
 */
export function findPidByPort(port: number): number | null {
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim()
    const pid = parseInt(output.split('\n')[0], 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null  // No process on that port
  }
}

/**
 * Get the process group ID for a given PID.
 */
export function getProcessGroupId(pid: number): number | null {
  try {
    const output = execSync(`ps -o pgid= -p ${pid}`, { encoding: 'utf-8' }).trim()
    const pgid = parseInt(output, 10)
    return isNaN(pgid) ? null : pgid
  } catch {
    return null
  }
}

/**
 * Check if a port is available (nothing listening on it).
 */
export function isPortAvailable(port: number): boolean {
  return findPidByPort(port) === null
}

/**
 * Start an agent by executing its launch script as a detached process.
 * The process is fully detached and survives dashboard restart.
 */
export function startAgent(launchScript: string, env?: Record<string, string>): {
  pid: number | null
  error?: string
} {
  try {
    const child = spawn('bash', [launchScript], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // capture stderr only
      env: { ...process.env, ...env },
    })

    // Collect stderr for error diagnosis
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 4096) stderr = stderr.slice(-4096) // cap
    })

    child.unref() // Allow dashboard to exit without killing agent

    return { pid: child.pid ?? null }
  } catch (err: any) {
    return { pid: null, error: err.message }
  }
}

/**
 * Stop an agent by killing its process group.
 * Sends SIGTERM to the process group (negative PGID).
 */
export function stopAgent(port: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): {
  killed: boolean
  pid: number | null
  error?: string
} {
  const pid = findPidByPort(port)
  if (!pid) return { killed: false, pid: null, error: 'No process found on port' }

  const pgid = getProcessGroupId(pid)
  if (!pgid) return { killed: false, pid, error: 'Could not determine process group' }

  try {
    // Kill the entire process group (negative PGID)
    process.kill(-pgid, signal)
    return { killed: true, pid }
  } catch (err: any) {
    return { killed: false, pid, error: err.message }
  }
}
```

### Pattern 2: Gateway Proxy Route
**What:** API route that forwards requests to agent gateway ports, so the browser never communicates directly with agents.
**When to use:** For all gateway health/status queries.
**Example:**
```typescript
// src/app/api/agents/[id]/gateway/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { healthMonitor } from '@/lib/health-monitor'

const GATEWAY_TIMEOUT_MS = 5000
const ALLOWED_PATHS = ['health', 'status']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, path } = await params
  const endpoint = path.join('/')

  if (!ALLOWED_PATHS.includes(endpoint)) {
    return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 })
  }

  const snapshot = healthMonitor.getAgentSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { gatewayPort, gatewayHost } = snapshot.agent
  if (!gatewayPort) {
    return NextResponse.json({ error: 'Agent has no gateway port' }, { status: 404 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)

    const response = await fetch(
      `http://${gatewayHost}:${gatewayPort}/${endpoint}`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)

    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Gateway timeout', details: 'Agent gateway did not respond within 5 seconds' }, { status: 504 })
    }
    return NextResponse.json({
      error: 'Gateway unreachable',
      details: err.code === 'ECONNREFUSED' ? 'Connection refused -- agent may be down' : err.message,
    }, { status: 502 })
  }
}
```

### Pattern 3: SSE Role-Filtered Broadcasting
**What:** Lifecycle SSE events should only be sent to operator+ connections, not viewers.
**When to use:** For lifecycle state changes, operation locks.
**Implementation note:** The current `eventBus` broadcasts to ALL SSE connections indiscriminately. The simplest approach for role-filtered events is to broadcast a lifecycle event with a `minRole` field, and have the SSE route handler filter based on the connection's authenticated role. However, the current SSE route (`/api/events`) does not track per-connection user roles. Two approaches:
  - **Option A (recommended):** Broadcast all lifecycle events to all connections but include a `role_filter` field. The CLIENT-SIDE `useServerEvents` hook checks the current user's role and ignores events the user shouldn't see. This is acceptable because lifecycle events contain no secret data (just "agent X is being stopped") and viewer role simply won't render the Lifecycle tab.
  - **Option B:** Create a separate SSE endpoint for lifecycle events (`/api/events/lifecycle`) that requires operator role. More pure but adds complexity.

### Pattern 4: Zustand Lifecycle State
**What:** Extend the store with per-agent lifecycle operation state and operation history.
**When to use:** For UI rendering of in-progress operations, lock state, and history.
**Example:**
```typescript
// Types to add
interface LifecycleOperation {
  agentId: string
  action: 'start' | 'stop' | 'restart' | 'force_stop'
  status: 'pending' | 'success' | 'error'
  timestamp: number
  username: string
  error?: string
}

// Store additions
lifecycleOperations: Map<string, LifecycleOperation>  // agentId -> current operation
lifecycleHistory: LifecycleOperation[]                 // last 10 entries per agent
setLifecycleOperation: (agentId: string, op: LifecycleOperation | null) => void
addLifecycleHistory: (op: LifecycleOperation) => void
```

### Pattern 5: Root Agent Lifecycle
**What:** Root agent (Andy) has no launch script -- infer launch command from config.json.
**When to use:** When `agent.launchScript` is empty string (root agent detection).
**Example:**
```typescript
function getLaunchCommand(agent: DiscoveredAgent): { command: string; label: string } {
  if (agent.launchScript) {
    return {
      command: `bash ${agent.launchScript}`,
      label: 'Launch script',
    }
  }
  // Root agent: infer from config
  return {
    command: `nanobot gateway --port ${agent.gatewayPort}`,
    label: 'Inferred from config',
  }
}

function startRootAgent(agent: DiscoveredAgent): ReturnType<typeof startAgent> {
  // Root agent uses system HOME, no BOT_ID
  const child = spawn('nanobot', ['gateway', '--port', String(agent.gatewayPort)], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env },  // System HOME, no HOME override
  })
  child.unref()
  return { pid: child.pid ?? null }
}
```

### Anti-Patterns to Avoid
- **Spawning processes from the browser:** All process management must happen server-side via API routes. Never expose spawn/kill operations to the client directly.
- **Using `child.kill()` instead of process group kill:** `child.kill()` only kills the direct child, not grandchildren. The nanobot gateway spawns Telegram bots, cron services, etc. as child processes. Must kill the entire PGID.
- **Auto-escalating SIGTERM to SIGKILL:** The decision explicitly says manual escalation only. After 10s timeout, SHOW the Force Kill button -- don't auto-kill.
- **Storing operation history in a database:** Explicitly decided as in-memory only (Zustand). Lost on page refresh.
- **Polling agent gateway from the browser:** All gateway communication must proxy through MC API routes (GATE-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PID lookup by port | Custom /proc parsing | `lsof -ti :{port}` via `execSync` | Platform-tested, handles edge cases (multiple PIDs, IPv4/IPv6) |
| Process group ID | Manual process tree walking | `ps -o pgid= -p {pid}` via `execSync` | Kernel-level PGID is the correct abstraction for process families |
| Process group kill | Recursive child kill | `process.kill(-pgid, signal)` | Node.js natively supports negative PID (= process group). One call kills entire tree |
| HTTP timeout | Manual `setTimeout` + abort | `AbortController` with `fetch` | Built-in, clean, handles all edge cases |
| Detached process | Custom daemonization | `spawn(cmd, args, { detached: true })` + `child.unref()` | Node.js built-in; child survives parent exit |

**Key insight:** Process management on Unix is well-solved at the OS level. The kernel's process group abstraction (PGID) is exactly what we need for "kill agent and all its children." Don't try to walk the process tree manually.

## Common Pitfalls

### Pitfall 1: Zombie Processes from Direct Child Kill
**What goes wrong:** Killing only the direct child process (the bash shell that runs the launch script) leaves the actual nanobot gateway and its channel workers running as orphans.
**Why it happens:** Launch scripts use `exec nanobot gateway`, which replaces the bash process with nanobot. But nanobot itself spawns Telegram polling, cron, heartbeat, etc. Killing just the PID from `lsof` kills the gateway but may miss child workers if they're in a different process group.
**How to avoid:** Always use process group kill (`kill -TERM -- -{pgid}`). The `exec` in the launch script means the nanobot process inherits the process group of the bash shell, so PGID kill works correctly.
**Warning signs:** Ports remaining occupied after "successful" stop; `lsof -ti :{port}` still returns PIDs after kill.

### Pitfall 2: Race Condition Between Stop and Start
**What goes wrong:** During restart, if start fires before the port is fully released after stop, the new process fails with "address in use."
**Why it happens:** Even after SIGTERM and process exit, the OS may hold the port in TIME_WAIT state briefly.
**How to avoid:** After stop, poll `lsof -ti :{port}` until it returns empty (port released), with a short timeout (2-3 seconds). Only then proceed with start.
**Warning signs:** Restart operations randomly failing with "port in use" errors.

### Pitfall 3: `execSync` Blocking the Event Loop
**What goes wrong:** Using `execSync` for `lsof` and `ps` blocks the Node.js event loop, making the server unresponsive during lifecycle operations.
**Why it happens:** `execSync` is synchronous -- it blocks the thread until the child process completes.
**How to avoid:** Use `execSync` only for very fast commands (`lsof` and `ps` complete in <50ms). For anything longer, use `exec` (async). The lifecycle API routes are already `async` so callers wait anyway. For production, consider `execFile` (async) but `execSync` is acceptable for these sub-50ms commands with <10 agents.
**Warning signs:** Dashboard becoming unresponsive during lifecycle operations.

### Pitfall 4: Root Agent Missing Environment
**What goes wrong:** Starting the root agent via `nanobot gateway --port {port}` without setting up the correct environment (PATH must include `/usr/local/bin` for nanobot binary).
**Why it happens:** `spawn()` may use a minimal PATH unless explicitly configured.
**How to avoid:** Pass `process.env` as the environment for the spawned process. For root agent, `HOME` is already correct (system default). For sub-agents, set HOME and BOT_ID from the launch script parsing.
**Warning signs:** "nanobot: command not found" errors on start.

### Pitfall 5: SSE Event Flooding During Lifecycle Operations
**What goes wrong:** Broadcasting too many lifecycle SSE events (every poll tick during startup verification) causes UI jitter and unnecessary re-renders.
**Why it happens:** If the health monitor detects status changes every 30s poll, and lifecycle verification also broadcasts, events multiply.
**How to avoid:** Lifecycle operations should broadcast exactly three events: `lifecycle.started` (operation began), `lifecycle.completed` (success), or `lifecycle.failed` (error). Don't broadcast intermediate poll results during gateway verification -- handle those server-side.
**Warning signs:** UI flickering during lifecycle operations; multiple rapid toast notifications.

### Pitfall 6: Nanobot Gateway May Not Have HTTP Health Endpoint
**What goes wrong:** Attempting to fetch `GET /health` from the nanobot gateway returns connection errors or unexpected responses because the gateway process does not expose an HTTP server.
**Why it happens:** Investigation of nanobot v0.1.4 source code shows the gateway command starts the agent loop and channel manager but does not bind an HTTP server on the configured port. The `gateway.port` config field exists but is not used for HTTP serving in the current version. Channels like Telegram use long-polling, not webhooks.
**How to avoid:** Design the gateway HTTP health check as a supplementary signal that GRACEFULLY DEGRADES. If the HTTP fetch fails with ECONNREFUSED, that's expected and should not be treated as an error -- fall back to TCP port check as the primary liveness signal. Log the HTTP failure at debug level, not error level. The TCP port check (`checkPortAlive` from Phase 2) remains the definitive liveness signal.
**Warning signs:** All agents showing "gateway unhealthy" despite being alive and functioning normally.

## Code Examples

### Starting an Agent (API Route)
```typescript
// src/app/api/agents/[id]/start/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { startAgent, isPortAvailable, findPidByPort } from '@/lib/agent-lifecycle'
import { eventBus } from '@/lib/event-bus'
import { checkPortAlive } from '@/lib/agent-health'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const { id } = await params
  const snapshot = healthMonitor.getAgentSnapshot(id)
  if (!snapshot) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { gatewayPort } = snapshot.agent
  if (!gatewayPort) return NextResponse.json({ error: 'Agent has no gateway port' }, { status: 400 })

  // Pre-check: is port already in use?
  if (!isPortAvailable(gatewayPort)) {
    const existingPid = findPidByPort(gatewayPort)
    return NextResponse.json({
      error: 'Port in use',
      details: `Port ${gatewayPort} is already in use (PID: ${existingPid})`,
      port: gatewayPort,
      pid: existingPid,
    }, { status: 409 })
  }

  // Broadcast operation started
  eventBus.broadcast('agent.lifecycle', {
    id, action: 'start', status: 'pending',
    username: auth.user.username, timestamp: Date.now(),
  })

  // Start the agent
  const result = startAgent(snapshot.agent.launchScript, snapshot.agent)
  if (result.error) {
    eventBus.broadcast('agent.lifecycle', {
      id, action: 'start', status: 'error',
      error: result.error, username: auth.user.username, timestamp: Date.now(),
    })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Poll for gateway to come up (background -- don't block response)
  // Return immediately with "starting" status
  return NextResponse.json({
    success: true,
    agentId: id,
    pid: result.pid,
    status: 'starting',
  })
}
```

### Stopping an Agent (API Route)
```typescript
// src/app/api/agents/[id]/stop/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const snapshot = healthMonitor.getAgentSnapshot(id)
  if (!snapshot) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { gatewayPort } = snapshot.agent
  const result = stopAgent(gatewayPort, 'SIGTERM')

  eventBus.broadcast('agent.lifecycle', {
    id, action: 'stop', status: result.killed ? 'pending' : 'error',
    error: result.error, username: auth.user.username, timestamp: Date.now(),
  })

  return NextResponse.json({
    success: result.killed,
    agentId: id,
    pid: result.pid,
    error: result.error,
  })
}
```

### Confirmation Modal Component
```typescript
// src/components/agents/confirm-modal.tsx
'use client'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmModal({
  open, title, message, confirmLabel, onConfirm, onCancel, destructive = false,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onCancel} />
      {/* Dialog */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
          <p className="text-xs text-muted-foreground mb-4">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

### Lifecycle Tab Structure
```typescript
// src/components/agents/agent-lifecycle-tab.tsx
// Key sections:
// 1. Launch command display (script path or "inferred from config")
// 2. Action buttons (context-aware: Start for stopped, Stop+Restart for running)
// 3. Operation history (last 5-10 entries from Zustand store)
// 4. Error display (inline, not toast, with smart error hints)
// 5. Force Kill button (appears after 10s timeout on stop)
```

### Event Bus Extension
```typescript
// Add new event type to src/lib/event-bus.ts
export type EventType =
  // ... existing types ...
  | 'agent.lifecycle'  // Lifecycle state change (start/stop/restart/force_stop)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `child.kill()` direct PID | `process.kill(-pgid, signal)` process group | Long-established Unix pattern | Kills entire process tree, prevents zombies |
| `setTimeout` for HTTP timeout | `AbortController` with `fetch` | Node.js 18+ | Cleaner timeout handling, built-in |
| `spawn` with pipe stdio | `spawn` with `['ignore', 'ignore', 'pipe']` | Best practice for daemons | Only capture stderr, ignore stdout (agents log to files) |

**Deprecated/outdated:**
- `process.kill(pid)` without PGID: Only kills the target process, not its children. Always use process group kill for process families.

## Open Questions

1. **Nanobot Gateway HTTP Health Endpoint**
   - What we know: Nanobot v0.1.4 does NOT have an HTTP health endpoint. The gateway config has host/port but no HTTP server is started. Telegram uses long-polling.
   - What's unclear: Whether future nanobot versions will add `/health` and `/status` HTTP endpoints.
   - Recommendation: Implement the HTTP health check as a graceful optional enhancement. If the HTTP fetch succeeds, great -- use the response. If it fails with ECONNREFUSED, fall back to TCP-only (which is how Phase 2 currently works). This future-proofs the code for when nanobot adds HTTP endpoints while not breaking for v0.1.4.

2. **TCP Port Binding by Nanobot Gateway**
   - What we know: The `exec nanobot gateway --port 18793` command starts the agent. The `gateway.port` config field exists. Channels (Telegram) use long-polling not webhooks. In Phase 2, `checkPortAlive` TCP port check is used for liveness.
   - What's unclear: What exactly listens on the gateway port. It may be an internal message bus or webhook receiver, or the port may not be bound at all in current version.
   - Recommendation: For Phase 3 lifecycle, use `lsof -ti :{port}` for PID discovery (it will find whatever is on the port). For gateway start verification, use `checkPortAlive` (TCP connect) as the success signal -- this is consistent with Phase 2's liveness approach.

3. **Operation Lock Scope**
   - What we know: Locks should prevent concurrent operations on the same agent. SSE should broadcast lock state to all users.
   - What's unclear: Whether to implement locks server-side (in health monitor singleton) or client-side (in Zustand via SSE sync).
   - Recommendation: **Server-side locks in the health monitor singleton.** The health monitor already holds per-agent state and survives HMR via globalThis. Add a `lifecycleLocks: Map<string, LifecycleLock>` that tracks which agent has an in-progress operation, with auto-expiry at 30s. API routes check this before accepting operations. SSE broadcasts lock state for UI display.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (configured in vitest.config.ts) |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIFE-01 | Start agent via launch script | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "startAgent"` | Wave 0 |
| LIFE-02 | Stop agent via process group kill | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "stopAgent"` | Wave 0 |
| LIFE-03 | Restart = stop + start atomically | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "restartAgent"` | Wave 0 |
| LIFE-04 | Confirmation dialog before stop/restart | manual-only | Manual: verify modal appears before stop/restart | N/A (UI) |
| LIFE-05 | Process tree kill via PGID | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "process group"` | Wave 0 |
| GATE-01 | HTTP gateway proxy | unit | `pnpm test -- --run src/lib/__tests__/agent-gateway.test.ts -t "proxy"` | Wave 0 |
| GATE-03 | Gateway failure handling | unit | `pnpm test -- --run src/lib/__tests__/agent-gateway.test.ts -t "failure"` | Wave 0 |
| GATE-04 | All comms through MC API | e2e | `pnpm test:e2e -- tests/agent-lifecycle.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts src/lib/__tests__/agent-gateway.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/agent-lifecycle.test.ts` -- covers LIFE-01, LIFE-02, LIFE-03, LIFE-05
- [ ] `src/lib/__tests__/agent-gateway.test.ts` -- covers GATE-01, GATE-03
- [ ] `tests/agent-lifecycle.spec.ts` -- E2E for GATE-04 (browser never talks to agent ports)

## Sources

### Primary (HIGH confidence)
- Local codebase inspection: `src/lib/agent-discovery.ts`, `src/lib/agent-health.ts`, `src/lib/health-monitor.ts`, `src/lib/event-bus.ts`, `src/store/index.ts`, `src/lib/auth.ts`, `src/lib/validation.ts`, `src/lib/command.ts`, `src/lib/config.ts`
- Local nanobot source: `/Users/designmac/nanobot/nanobot/cli/commands.py` (gateway command implementation)
- Local nanobot config: `~/.nanobot-stefany-home/.nanobot/config.json`, `~/.nanobot/config.json`
- Nanobot launch script: `~/.nanobot/workspace/agents/stefany/launch-stefany.sh`
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) - spawn, detached, unref, process group kill

### Secondary (MEDIUM confidence)
- Phase 2 RESEARCH.md and CONTEXT.md -- established patterns for health checking, SSE, Zustand store
- [Killing process families with Node.js](https://medium.com/@almenon214/killing-processes-with-node-772ffdd19aad) - PGID-based kill patterns

### Tertiary (LOW confidence)
- Nanobot gateway HTTP API: Investigation shows NO HTTP health endpoint in v0.1.4. The gateway process may or may not bind to the configured port. LOW confidence on exact behavior -- designed for graceful degradation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns verified in existing codebase
- Architecture: HIGH -- builds directly on established Phase 2 patterns (API routes, SSE, Zustand, health monitor)
- Process management: HIGH -- Unix PGID kill is well-understood; Node.js `spawn` with `detached` is documented
- Gateway HTTP API: LOW -- nanobot v0.1.4 does NOT appear to have HTTP endpoints; designed for graceful degradation
- Pitfalls: HIGH -- identified from nanobot source code investigation and Unix process management fundamentals
- UI patterns: HIGH -- modal/tab/toast components follow existing codebase conventions

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain -- process management patterns don't change)
