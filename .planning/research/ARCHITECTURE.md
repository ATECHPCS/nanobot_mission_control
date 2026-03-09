# Architecture Research

**Domain:** AI agent operations dashboard integrating with filesystem-based nanobot agents
**Researched:** 2026-03-09
**Confidence:** HIGH (based on direct codebase analysis of both MC fork and live nanobot agent infrastructure)

## System Overview

```
                         Browser (React 19 / Zustand / SSE)
                                    |
                         +-----------------------+
                         |   Next.js 16 Server   |
                         |   (API Routes Layer)  |
                         +----+--------+---------+
                              |        |
                   +----------+        +----------+
                   |                              |
            +-----------+               +------------------+
            | SQLite DB |               | Nanobot Adapter  |
            | (WAL)     |               | Service Layer    |
            +-----------+               +------+-----------+
              MC-owned data                    |
              (tasks, users,          +--------+--------+
               activities,           |                  |
               audit log)     +------+------+    +------+------+
                              | Filesystem  |    | HTTP Gateway |
                              | Reader      |    | Client       |
                              +------+------+    +------+------+
                                     |                  |
                              +------+------+    +------+------+
                              | Agent       |    | Agent       |
                              | Workspace   |    | Gateway     |
                              | (~/.nanobot |    | Processes   |
                              |  /workspace |    | (per-agent  |
                              |  /agents/)  |    |  HTTP ports)|
                              +-------------+    +-------------+

     Two data planes:
       LEFT  = SQLite (MC-owned, mutable, relational)
       RIGHT = Filesystem + HTTP (agent-owned, read-mostly from MC's perspective)
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Browser Client** | Render dashboard UI, receive real-time updates via SSE, dispatch user actions | React 19, Zustand store, EventSource API |
| **Next.js API Routes** | Auth/RBAC gateway, orchestrate reads/writes across both data planes | Next.js 16 route handlers, middleware proxy |
| **SQLite Database** | Store MC-owned relational data: tasks, users, agents (registry), activities, audit log, notifications | better-sqlite3, WAL mode, migrations |
| **Nanobot Adapter Service** | Unified interface for all agent interactions -- abstracts filesystem reads and HTTP gateway calls | New service layer (replaces OpenClaw sync/command modules) |
| **Filesystem Reader** | Read agent workspace files: MEMORY.md, IDENTITY.md, SOUL.md, sessions/*.jsonl, logs/*.log, jobs.json | Node.js fs, path-scoped reads with traversal protection |
| **HTTP Gateway Client** | Communicate with running agent processes via their gateway ports | fetch() to localhost:{port}, health checks |
| **SSE Event Bus** | Push real-time updates from server to all connected browser clients | Node.js EventEmitter singleton, /api/events endpoint |
| **Scheduler** | Periodic tasks: heartbeat checks, agent sync, backup, cleanup | setInterval tick loop, configurable intervals |

## Recommended Architecture: Dual Data Plane

The fundamental architectural insight is that this system has **two fundamentally different data planes** that must be integrated but not conflated.

### Data Plane 1: MC-Owned (SQLite)

Data that Mission Control creates, owns, and mutates:

- User accounts and sessions (auth)
- Task board (kanban state, assignments, comments)
- Activity stream (audit trail of all actions)
- Agent registry (name, role, status cache, config snapshot)
- Notifications
- Webhook configurations and delivery history

**Pattern:** Standard CRUD via API routes. SQLite is the source of truth. SSE broadcasts mutations to connected clients.

### Data Plane 2: Agent-Owned (Filesystem + HTTP)

Data that agents create and own, which MC reads (and occasionally writes):

- Agent workspace files: `~/.nanobot/workspace/agents/{name}/`
  - `IDENTITY.md` -- agent identity and personality
  - `SOUL.md` -- agent soul/system prompt
  - `AGENTS.md` -- agent instructions and rules
  - `MEMORY.md` -- long-term memory (can be large, e.g. Stefany's is 254 lines with QBO data)
  - `HEARTBEAT.md` -- periodic task definitions
  - `SESSION-STATE.md` -- current session context
  - `TOOLS.md` -- available tools
  - `USER.md` -- user information
  - `jobs.json` -- cron job definitions
  - `sessions/*.jsonl` -- conversation logs
  - `logs/*.log` -- agent logs (stdout, stderr)
  - `memory/` -- structured memory (HISTORY.md, WAL.md, episodes/, graph/, vault/, etc.)
  - `skills/` -- agent skill definitions (subdirectories)
- Agent HOME directories: `~/.nanobot-{name}-home/`
  - `.nanobot/config.json` -- agent-specific nanobot configuration
- Agent gateway processes: `nanobot gateway --port {port}` on localhost

**Pattern:** Read via filesystem APIs. Write only for specific operations (edit memory, update heartbeat). Gateway communication via HTTP. Agent processes managed via shell commands.

### Why Two Planes, Not One

The existing MC fork tries to sync everything into SQLite via `agent-sync.ts` (reading `openclaw.json` and upserting). This creates a **stale cache problem**: the SQLite copy drifts from the filesystem truth. For nanobot agents, the filesystem IS the source of truth for agent state.

**Recommendation: Read-through, not sync-and-cache.**

For agent data, the API routes should read directly from the filesystem on each request rather than syncing into SQLite. SQLite stores only MC-owned metadata (status cache, last-seen timestamps, task assignments). Agent content (memory, identity, soul, sessions) is always read fresh from disk.

Exception: The agent **registry** (which agents exist, their ports, their workspace paths) should be in SQLite because it's MC-managed configuration. But agent **content** should be read-through.

## Data Flow

### Flow 1: Dashboard Load (Multi-Agent Overview)

```
Browser GET /api/agents
    |
    v
API Route
    |
    +-- SQLite: SELECT agents (registry, status cache, task stats)
    |
    +-- For each agent:
    |     Filesystem: stat launch script, check process, read IDENTITY.md
    |     HTTP: HEAD http://localhost:{port}/health (gateway alive?)
    |
    v
Merge & Return JSON
    |
    v
Zustand store.setAgents(agents)
    |
    v
React renders agent cards with status indicators
```

### Flow 2: Agent Health Check (Scheduler, every 5 min)

```
Scheduler tick
    |
    v
For each registered agent:
    |
    +-- Check process alive: `pgrep -f "nanobot gateway --port {port}"`
    |     or HTTP: GET http://localhost:{port}/health
    |
    +-- Check filesystem: stat logs/{name}.log (last modified = last activity)
    |
    +-- Check sessions: read sessions/*.jsonl tail (last message timestamp)
    |
    v
Update SQLite: agents.status, agents.last_seen
    |
    v
EventBus.broadcast('agent.status_changed', ...)
    |
    v
SSE -> Browser -> Zustand -> UI updates status indicators
```

### Flow 3: View Agent Memory (On-Demand)

```
Browser GET /api/agents/{id}/memory?file=MEMORY.md
    |
    v
API Route
    |
    +-- SQLite: SELECT workspace path for agent
    |
    +-- Filesystem: readFile(workspace/memory/MEMORY.md)
    |
    v
Return { content: string, modified: timestamp }
    |
    v
Browser renders markdown viewer/editor
```

### Flow 4: Agent Lifecycle Control (Start/Stop/Restart)

```
Browser POST /api/agents/{id}/lifecycle { action: "restart" }
    |
    v
API Route (requires operator role)
    |
    +-- SQLite: Get agent config (workspace path, port, launch script)
    |
    +-- Process: kill existing gateway process
    |
    +-- Process: spawn launch script (exec nanobot gateway --port {port})
    |     Sets HOME, PATH, BOT_ID environment variables
    |
    +-- Wait for health check to pass (poll localhost:{port}/health)
    |
    v
Update SQLite: status = 'idle', last_seen = now
    |
    v
EventBus.broadcast('agent.status_changed', ...)
```

### Flow 5: Task Dispatch to Agent

```
Browser POST /api/agents/{id}/message { text: "Process this receipt" }
    |
    v
API Route
    |
    +-- SQLite: Get agent gateway port
    |
    +-- HTTP: POST http://localhost:{port}/message
    |     { channel: "dashboard", text: "...", chatId: "mc-{userId}" }
    |
    v
Agent processes message, responds via gateway
    |
    v
MC polls or receives callback with response
```

### Flow 6: Real-Time Updates (SSE)

```
Browser: EventSource('/api/events')
    |
    v
SSE endpoint holds connection open
    |
    v
EventBus.on('server-event', (event) => {
    write event to SSE stream
})
    |
    v
Browser: parse event, dispatch to Zustand store
    |
    v
React re-renders affected components
```

## Recommended Project Structure

After stripping OpenClaw and adding nanobot-native modules:

```
src/
├── app/
│   ├── api/
│   │   ├── agents/                  # Agent CRUD, lifecycle, messaging
│   │   │   ├── route.ts             # GET (list), POST (register)
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts         # GET/PUT/DELETE single agent
│   │   │   │   ├── lifecycle/       # POST start/stop/restart
│   │   │   │   ├── memory/          # GET/PUT agent memory files
│   │   │   │   ├── sessions/        # GET conversation logs
│   │   │   │   ├── logs/            # GET agent logs
│   │   │   │   └── message/         # POST send message via gateway
│   │   ├── tasks/                   # Task board CRUD (keep from MC)
│   │   ├── auth/                    # Authentication (keep from MC)
│   │   ├── events/                  # SSE endpoint (keep from MC)
│   │   └── settings/                # Dashboard settings (keep from MC)
│   └── [[...panel]]/                # SPA catch-all route (keep from MC)
├── components/
│   ├── panels/                      # Main dashboard panels
│   │   ├── agent-overview/          # Multi-agent status grid
│   │   ├── agent-detail/            # Single agent deep-dive
│   │   ├── memory-browser/          # Agent memory viewer/editor
│   │   ├── session-viewer/          # JSONL conversation browser
│   │   └── ... (kanban, activity feed from MC)
│   ├── ui/                          # Shared UI primitives (keep from MC)
│   └── layout/                      # Layout components (keep from MC)
├── lib/
│   ├── nanobot/                     # NEW: Nanobot integration layer
│   │   ├── registry.ts              # Agent discovery from filesystem
│   │   ├── filesystem.ts            # Safe filesystem reads/writes
│   │   ├── gateway-client.ts        # HTTP client for agent gateways
│   │   ├── process-manager.ts       # Start/stop/restart agent processes
│   │   ├── session-parser.ts        # Parse JSONL session files
│   │   ├── log-reader.ts            # Tail and parse agent logs
│   │   └── types.ts                 # Nanobot-specific type definitions
│   ├── db.ts                        # SQLite (keep, modify schema)
│   ├── event-bus.ts                 # SSE event bus (keep as-is)
│   ├── auth.ts                      # Authentication (keep as-is)
│   ├── config.ts                    # App config (modify: nanobot paths)
│   ├── scheduler.ts                 # Periodic tasks (modify: nanobot health)
│   └── ... (webhooks, rate-limit, validation -- keep from MC)
├── store/
│   └── index.ts                     # Zustand store (modify: nanobot agent types)
└── types/
    └── index.ts                     # Shared type definitions
```

### Structure Rationale

- **`lib/nanobot/`**: All nanobot-specific integration in one directory. This replaces `agent-sync.ts`, `command.ts` (OpenClaw runners), `sessions.ts` (OpenClaw session reader), and `device-identity.ts` (Ed25519 handshake). Clean boundary between "MC framework" and "nanobot integration."
- **Keep MC patterns for MC-owned data**: Tasks, auth, activities, webhooks -- these work well already. No need to reinvent.
- **Panels over pages**: MC uses a single-page panel system (`[[...panel]]` catch-all). Keep this -- it enables the nav-rail pattern with instant panel switching.

## Architectural Patterns

### Pattern 1: Read-Through Filesystem Access

**What:** API routes read agent files directly from disk on each request instead of caching in SQLite.
**When to use:** Any agent content read (memory, identity, sessions, logs).
**Trade-offs:** Slightly slower than cached reads (+1-5ms for local disk). Always fresh. No sync drift. Simpler code.

```typescript
// lib/nanobot/filesystem.ts
import { readFile, stat } from 'node:fs/promises'
import { resolveAgentPath } from './registry'

export async function readAgentFile(agentName: string, relativePath: string): Promise<{
  content: string
  modified: number
} | null> {
  const fullPath = resolveAgentPath(agentName, relativePath)
  // resolveAgentPath validates path is within agent workspace (traversal protection)
  try {
    const [content, info] = await Promise.all([
      readFile(fullPath, 'utf-8'),
      stat(fullPath)
    ])
    return { content, modified: info.mtimeMs }
  } catch {
    return null
  }
}
```

### Pattern 2: Gateway Health Probe with Fallback

**What:** Check agent liveness by probing the HTTP gateway first, falling back to process detection.
**When to use:** Agent status checks (scheduler heartbeat, dashboard load).
**Trade-offs:** HTTP probe is definitive (agent is responding) but slow if agent is down (timeout). Process check is fast but doesn't confirm the agent is healthy.

```typescript
// lib/nanobot/gateway-client.ts
export async function checkAgentHealth(port: number): Promise<'alive' | 'unresponsive' | 'dead'> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3000)
    })
    return response.ok ? 'alive' : 'unresponsive'
  } catch {
    return 'dead'
  }
}
```

### Pattern 3: Process Lifecycle via Launch Scripts

**What:** Start/stop agents by executing their existing launch scripts rather than constructing nanobot commands directly.
**When to use:** Agent lifecycle control from dashboard.
**Trade-offs:** Depends on launch scripts existing and being correct. But this is the right boundary -- launch scripts are the agent owner's contract for "how to start this agent." MC should not bypass them.

```typescript
// lib/nanobot/process-manager.ts
import { spawn, exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function startAgent(agent: AgentConfig): Promise<void> {
  // Use the agent's own launch script
  const child = spawn('bash', [agent.launchScriptPath], {
    detached: true,     // Survive MC restart
    stdio: 'ignore',    // Don't capture stdout
    env: process.env
  })
  child.unref()         // Don't block MC process exit
}

export async function stopAgent(port: number): Promise<void> {
  // Find and kill the gateway process on this port
  const { stdout } = await execAsync(`lsof -ti:${port}`)
  const pid = stdout.trim()
  if (pid) {
    process.kill(parseInt(pid), 'SIGTERM')
  }
}
```

### Pattern 4: JSONL Session Streaming

**What:** Parse nanobot JSONL session files as streams for the session viewer.
**When to use:** Browsing conversation history.
**Trade-offs:** JSONL files can be large. Stream parsing avoids loading entire files into memory. Pagination via byte offset rather than line count for efficiency.

```typescript
// lib/nanobot/session-parser.ts
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export async function readSessionPage(
  filePath: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ messages: any[]; nextOffset: number }> {
  const messages: any[] = []
  let lineNum = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' })
  })

  for await (const line of rl) {
    if (lineNum >= offset && messages.length < limit) {
      try { messages.push(JSON.parse(line)) } catch { /* skip malformed */ }
    }
    lineNum++
    if (messages.length >= limit) break
  }

  return { messages, nextOffset: lineNum }
}
```

### Pattern 5: Agent Registry as Configuration

**What:** Store agent registry (name, port, workspace path, launch script) in a nanobot-native config file rather than syncing from openclaw.json.
**When to use:** Agent discovery and registration.
**Trade-offs:** Requires a one-time setup step. But avoids the OpenClaw config dependency entirely.

The registry can either be:
- A `nanobot-agents.json` file that MC reads (simplest)
- Auto-discovered by scanning `~/.nanobot/workspace/agents/` for directories containing launch scripts (more magical, but fragile)
- Stored in SQLite agents table as MC-managed configuration (best for CRUD operations)

**Recommendation:** Auto-discover from filesystem, store in SQLite for fast lookups and UI state. Re-scan on demand or on startup.

```typescript
// lib/nanobot/registry.ts
export async function discoverAgents(workspaceRoot: string): Promise<DiscoveredAgent[]> {
  const agentsDir = path.join(workspaceRoot, 'agents')
  const entries = await readdir(agentsDir, { withFileTypes: true })
  const agents: DiscoveredAgent[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const agentDir = path.join(agentsDir, entry.name)
    const launchScript = await findLaunchScript(agentDir)
    if (!launchScript) continue

    const port = await parsePortFromLaunchScript(launchScript)
    const identity = await readAgentFile(entry.name, 'IDENTITY.md')

    agents.push({
      name: entry.name,
      port,
      workspacePath: agentDir,
      launchScriptPath: launchScript,
      identity: identity ? parseIdentity(identity.content) : null,
    })
  }
  return agents
}
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Nanobot Gateway (per agent) | HTTP REST to localhost:{port} | Each agent has its own port. Health check, send messages, query state. Ports are assigned per-agent (Stefany: 18793, Cody: 18792). |
| Cloudflare Tunnel | Reverse proxy via `cloudflared` | Zero-trust remote access to MC dashboard. Configured outside MC. |
| Telegram (via agents) | Indirect -- agents handle Telegram. MC monitors channel health. | MC should NOT talk to Telegram directly. Monitor via agent logs/sessions. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser <-> API Routes | HTTP REST + SSE | Auth via session cookie or API key. SSE for real-time. |
| API Routes <-> SQLite | Direct function calls (better-sqlite3) | Synchronous, in-process. WAL mode for concurrent reads. |
| API Routes <-> Agent Filesystem | Node.js fs module | Path traversal protection via `resolveWithin()`. Read-heavy, occasional writes. |
| API Routes <-> Agent Gateways | HTTP fetch to localhost | 3s timeout for health checks. Longer for message sends. |
| Scheduler <-> All Data | Direct access to SQLite + filesystem | Runs in-process, shares DB connection. |

## What to Strip from MC Fork

The existing MC fork has significant OpenClaw-specific code that should be removed:

| Module | Action | Replacement |
|--------|--------|-------------|
| `lib/agent-sync.ts` | Remove | `lib/nanobot/registry.ts` (filesystem discovery) |
| `lib/command.ts` (runOpenClaw, runClawdbot) | Remove | `lib/nanobot/process-manager.ts` (launch scripts) |
| `lib/device-identity.ts` | Remove entirely | Not needed -- no Ed25519 handshake |
| `lib/websocket.ts` (OpenClaw gateway protocol v3) | Remove | `lib/nanobot/gateway-client.ts` (simple HTTP) |
| `lib/gateway-url.ts` | Remove | Simple localhost:{port} construction |
| `lib/provisioner-client.ts` | Remove | Not applicable |
| `lib/sessions.ts` | Rewrite | `lib/nanobot/session-parser.ts` (JSONL, not JSON session stores) |
| `lib/config.ts` | Modify | Replace OPENCLAW_* env vars with NANOBOT_* |
| `lib/google-auth.ts` | Remove | Out of scope per PROJECT.md |
| `proxy.ts` | Keep, simplify | Remove OpenClaw gateway-specific proxy logic |

**Estimated deletion:** ~60% of existing lib/ code. The core infrastructure (db, event-bus, auth, rate-limit, validation, webhooks, scheduler) is reusable.

## Build Order (Dependency Chain)

The architecture has clear dependency layers that dictate build order:

```
Phase 1: Foundation (no agent integration yet)
   Strip OpenClaw code, update config, verify MC core still works
   ├── Keep: auth, db, event-bus, scheduler, tasks, webhooks
   └── Remove: OpenClaw sync, command, websocket, device-identity
         |
Phase 2: Agent Registry + Filesystem Reader
   Agent discovery and read-only filesystem access
   ├── lib/nanobot/registry.ts (discover agents from workspace)
   ├── lib/nanobot/filesystem.ts (safe file reads)
   ├── lib/nanobot/types.ts (type definitions)
   ├── API: GET /api/agents (read from registry + filesystem)
   └── UI: Agent overview panel (names, identities, workspace paths)
         |
Phase 3: Health Monitoring + Process Management
   Agent liveness detection and lifecycle control
   ├── lib/nanobot/gateway-client.ts (HTTP health probes)
   ├── lib/nanobot/process-manager.ts (start/stop/restart)
   ├── Scheduler: heartbeat check updated for nanobot
   ├── API: POST /api/agents/{id}/lifecycle
   └── UI: Status indicators, start/stop/restart buttons
         |
Phase 4: Memory + Session Viewing
   Read and display agent memory and conversation history
   ├── lib/nanobot/session-parser.ts (JSONL parsing)
   ├── lib/nanobot/log-reader.ts (log file tailing)
   ├── API: GET /api/agents/{id}/memory, sessions, logs
   └── UI: Memory browser, session viewer, log viewer panels
         |
Phase 5: Gateway Communication + Task Dispatch
   Send messages to agents, dispatch tasks
   ├── HTTP client for agent gateway message endpoint
   ├── API: POST /api/agents/{id}/message
   ├── Channel status monitoring
   └── UI: Message composer, task dispatch, channel health
```

**Rationale for ordering:**
1. **Phase 1 first** because everything else depends on a clean, working MC core without OpenClaw baggage.
2. **Phase 2 before Phase 3** because you need to know which agents exist before you can check if they're alive.
3. **Phase 3 before Phase 4** because health monitoring is more critical than viewing history -- you need to know if agents are up before browsing their data.
4. **Phase 4 before Phase 5** because reading agent data is simpler and lower-risk than writing to agents, and validates the filesystem integration patterns.
5. **Phase 5 last** because it depends on all previous layers and introduces the most complexity (bidirectional communication).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2-5 agents (current) | Monolith is fine. Direct filesystem reads. Sequential health checks. No performance concerns. |
| 10-20 agents | Parallelize health checks (Promise.all). Consider caching IDENTITY.md reads (changes rarely). JSONL sessions may need pagination. |
| 50+ agents | Unlikely for this use case, but: move health checks to a dedicated worker thread. Consider SQLite FTS for session search. Watch for filesystem inode pressure. |

### Scaling Priorities

1. **First bottleneck:** JSONL session files growing large. A 6-month agent conversation could be hundreds of MB. Pagination and streaming reads are essential from day one.
2. **Second bottleneck:** Health check fan-out. With 20 agents, sequential 3-second-timeout health checks could take 60 seconds. Parallelize early.

## Anti-Patterns

### Anti-Pattern 1: Sync-and-Cache Agent Data

**What people do:** Periodically copy agent filesystem data into SQLite, then read from SQLite.
**Why it's wrong:** Creates stale cache that drifts from filesystem truth. Adds sync machinery, conflict resolution, and "which copy is correct?" problems. The existing MC fork does this via `agent-sync.ts`.
**Do this instead:** Read-through pattern. Read agent files from filesystem on each request. Cache only immutable or rarely-changing data (agent identity) with short TTLs.

### Anti-Pattern 2: WebSocket to Agent Gateways from Browser

**What people do:** Have the browser connect directly to agent gateway WebSocket ports.
**Why it's wrong:** Exposes agent ports to the network. Bypasses MC auth/RBAC. Creates CORS complexity. The existing MC fork's `websocket.ts` does this with an elaborate handshake protocol.
**Do this instead:** All agent communication goes through MC API routes. MC's server-side code talks to agent gateways. Browser only talks to MC.

### Anti-Pattern 3: Treating Agent Filesystem as a Database

**What people do:** Use agent markdown files as a queryable data store (e.g., parsing MEMORY.md to extract structured data).
**Why it's wrong:** Markdown is not a query language. Parsing is fragile. Agent may change format at any time. MEMORY.md is the agent's working document, not an API.
**Do this instead:** Display agent files as-is (render markdown). For structured queries (token usage, task stats), use SQLite. For agent state, trust the filesystem representation.

### Anti-Pattern 4: Bidirectional Memory Editing Without Guardrails

**What people do:** Let dashboard users freely edit agent MEMORY.md, SOUL.md, IDENTITY.md.
**Why it's wrong:** These files are the agent's cognitive state. Unguarded edits can break agent behavior. No undo mechanism. Agent may overwrite dashboard edits.
**Do this instead:** Read-only by default. Edit mode requires operator role. Show diff before saving. Consider copy-on-write (backup before edit). Never edit files the agent is actively writing to (check HEARTBEAT.md, SESSION-STATE.md).

### Anti-Pattern 5: Process Management Without PID Tracking

**What people do:** Spawn agent processes without tracking PIDs, relying on port scanning to find them later.
**Why it's wrong:** Port reuse, zombie processes, and inability to distinguish between "agent crashed" and "agent was never started."
**Do this instead:** Track spawned PIDs in SQLite or a PID file. Use `detached: true` + `child.unref()` so agents survive MC restarts. On MC startup, reconcile PID file with running processes.

## Key Architectural Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Agent data access pattern | Read-through filesystem | Avoids sync drift; filesystem IS the source of truth |
| Browser-to-agent communication | Via MC API routes only | Enforces auth/RBAC; single network surface |
| Real-time updates | SSE (keep existing) | Already works well; simpler than WebSocket for server-push |
| Agent process management | Launch scripts with PID tracking | Respects agent owner's startup contract |
| Agent registry | Auto-discover + SQLite cache | Filesystem scan for discovery; SQLite for fast lookups and UI state |
| Session file access | Streaming JSONL parser | Handles large files without memory pressure |
| Config replacement | NANOBOT_WORKSPACE_DIR, NANOBOT_AGENTS_DIR | Drop all OPENCLAW_* env vars |

## Sources

- Direct codebase analysis of MC fork: `/Users/designmac/projects/nanobot_mission_control/src/`
- Live nanobot agent infrastructure: `~/.nanobot/workspace/agents/{stefany,cody}/`
- Agent launch scripts: `launch-stefany.sh` (port 18793), `launch-cody.sh` (port 18792)
- Nanobot agent data model: IDENTITY.md, MEMORY.md, SOUL.md, HEARTBEAT.md, SESSION-STATE.md, AGENTS.md, TOOLS.md, USER.md, jobs.json, sessions/*.jsonl, memory/*, logs/*
- MC existing architecture: event-bus.ts (SSE), db.ts (SQLite/WAL), scheduler.ts, agent-sync.ts, sessions.ts, websocket.ts, proxy.ts, store/index.ts (Zustand)

---
*Architecture research for: nanobot-native operations dashboard*
*Researched: 2026-03-09*
