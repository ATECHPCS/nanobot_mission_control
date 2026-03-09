# Phase 2: Agent Discovery and Health - Research

**Researched:** 2026-03-09
**Domain:** Filesystem-based agent discovery, process health monitoring, real-time dashboard UI
**Confidence:** HIGH

## Summary

Phase 2 transforms the Mission Control dashboard from a database-driven agent registry into a filesystem-aware, live-health-monitoring system. The core challenge is bridging the gap between nanobot agents living on the filesystem (with their own config files, session JSONL logs, and gateway processes) and the existing Next.js dashboard that currently manages agents via SQLite.

The nanobot agent ecosystem has a well-defined filesystem layout: each agent lives in `~/.nanobot/workspace/agents/{name}/` with identity files, session JSONL logs, and a launch script. Each agent's actual config (model, channels, gateway port) lives in their isolated HOME directory at `~/.nanobot-{name}-home/.nanobot/config.json`. The gateway process listens on a configurable HTTP port (e.g., 18792 for Cody, 18793 for Stefany). Health determination requires combining: (1) TCP port liveness for the gateway, (2) JSONL session file timestamps for activity recency, (3) error log parsing for error state, and (4) config.json channel inspection for channel health.

**Primary recommendation:** Build a server-side agent discovery service that scans the filesystem on a polling interval, constructs health snapshots, and exposes them via a new API route. Use the existing `eventBus` + SSE pattern to push status changes to the client. The client renders agent cards with the existing `useSmartPoll` hook for fallback polling. No new dependencies required -- the existing stack (Next.js 16, Zustand 5, Tailwind, SSE) handles everything.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Responsive card grid layout -- shows all agents at once, each card self-contained
- Activity-first info hierarchy: name + custom icon + status dot at top, then activity text ("Processing receipts..."), last active timestamp, channel labels as text
- Technical details (port, workspace path, model, PID) go in the slide-out detail panel, NOT on the card
- Custom icon read from optional `icon` field in agent's config.json (e.g., `"icon": "brain"`), fallback to color-coded initials (reuse existing agent-avatar.tsx pattern)
- Error count badge on card when errors exist (e.g., "[3 err]")
- Channel indicators as text labels on card ("Telegram: connected", "Discord: disconnected")
- Cards sorted by status -- unhealthy/errored agents bubble to top
- Summary bar above the grid: text counts ("3 agents: green-dot 2 healthy green-dot 1 error")
- Current activity text shown on card, derived from latest JSONL session entry
- New "Agents" nav item in the left nav rail (separate from Overview)
- Click agent card opens a slide-out panel from the right (overlay style, fixed width ~400px)
- Slide-out uses tabs: Overview, Errors, Channels (extensible for Phase 3+ with Lifecycle, Sessions tabs)
- Overview tab: full agent profile (name, icon, status, model, gateway port, process PID, uptime, workspace path, activity text, last seen)
- Errors tab: scrollable list of recent errors with timestamps (last 24 hours or last 50, whichever smaller)
- Channels tab: per-channel status cards (connected/disconnected, last message time, error info)
- Click outside panel or X button or Escape to close
- Card grid remains interactive when panel is open -- click different agent to switch panel content
- Composite health score: green/yellow/red, worst dimension wins
- Green: process alive + no errors + channels OK + recent activity
- Yellow: process alive but degraded (channel down, no activity > 1 hour, non-critical errors)
- Red: process dead, critical errors, or gateway unreachable
- 1 hour without JSONL session activity = stale (yellow)
- Tooltip on hover over status dot explains why it's yellow/red
- Status transitions: brief pulse animation on card + toast notification for red transitions. Yellow only pulses, no toast.
- Health check interval configurable via Dashboard Settings panel (default 30 seconds)
- "Last checked: X sec ago" subtle footer text below card grid
- Manual "Refresh Now" button near the footer
- Toast notification + card appears when new agent directory discovered
- Toast notification + card disappears when agent directory removed
- Filesystem as source of truth -- always scan filesystem for agent list, no DB caching of agent registry
- Detect: process crashes (was alive, now dead), rate limits in JSONL, failed tool calls in JSONL, channel disconnection
- Error badge shows count from last 24 hours, auto-ages out
- Dismiss/acknowledge button in slide-out clears error badge (requires operator role)
- All roles (viewer/operator/admin) see full health data: status, errors, channels, activity
- Viewers cannot see: filesystem paths and process PIDs (hidden in detail panel)
- Dismiss/acknowledge errors requires operator or admin role
- Red notification dot on Agents nav icon when any agent has red (critical) status
- Yellow/degraded does NOT trigger the nav dot -- only red
- Empty state: helpful message with path hint ("No agents discovered. Add agent directories to ~/.nanobot/workspace/agents/. Scanning every 30s...")
- Initial loading: skeleton cards that shimmer while first scan runs
- Cards follow existing dashboard theme (Tailwind semantic tokens, dark mode via next-themes)
- Status colors: vivid on dark mode, muted on light mode (use existing success/warning/destructive tokens)
- Mobile: single column stack, slide-out becomes full-screen overlay
- Basic keyboard navigation: Tab to focus cards, Enter to open slide-out, Escape to close

### Claude's Discretion
- Exact card dimensions and spacing
- Skeleton card design details
- Slide-out panel animation timing/easing
- How to parse "current activity" from JSONL session entries
- Process liveness detection mechanism (port check, PID file, ps)
- Filesystem watching implementation (chokidar, fs.watch, or polling)
- Error categorization logic (what counts as "critical" vs "non-critical")
- Toast notification library/component choice

### Deferred Ideas (OUT OF SCOPE)
- Push notifications to mobile via Pushover or ntfy.sh -- maps to v2 NOTF-01/NOTF-02. User wants research on both services as notification delivery method.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AREG-01 | Dashboard auto-discovers agents by scanning ~/.nanobot/workspace/agents/ directory | Filesystem structure documented; workspace path available in `config.ts` as `nanobotWorkspaceDir`; `fs.readdirSync` on agents subdirectory |
| AREG-02 | Dashboard reads agent config from each agent's isolated HOME directory config.json | Config location pattern: `~/.nanobot-{name}-home/.nanobot/config.json`; launch script reveals HOME path via `export HOME=...`; config format documented with gateway.port, channels, agents.defaults.model |
| AREG-03 | Dashboard displays discovered agents with name, model, gateway port, and workspace path | Name = directory name; model from config `agents.defaults.model`; port from config `gateway.port`; workspace = agents subdirectory path |
| AREG-04 | Dashboard detects new agents added to the workspace without restart (filesystem watching or polling) | Polling recommended (see Architecture Patterns); `fs.readdirSync` on interval; diff previous vs current directory listing |
| HLTH-01 | Dashboard shows process alive/dead status for each agent by checking gateway port liveness | TCP connect to `gateway.port` with short timeout; see port liveness pattern below |
| HLTH-02 | Dashboard shows last activity timestamp per agent from JSONL session files | Session files in `{workspace}/sessions/*.jsonl`; each line has `"timestamp"` field; read last line of most recently modified file |
| HLTH-03 | Dashboard shows error state per agent (crash detection, failed tool calls, rate limits) | Error log at `{workspace}/logs/{name}-error.log`; JSONL entries with `role: "tool"` containing "Error:" in content; process-was-alive-now-dead detection |
| HLTH-04 | Dashboard shows channel status per agent (Telegram/Discord connected/disconnected/error) | Config.json `channels` section lists enabled channels; error log contains channel-specific errors (e.g., `telegram.error.Conflict`); gateway port liveness implies channels are running |
| HLTH-05 | Health checks run on configurable interval (default 30 seconds) | Server-side polling with configurable interval stored in settings; client uses `useSmartPoll` hook |
| HLTH-06 | Agent cards display color-coded status indicators (green/yellow/red) | Composite health algorithm documented; existing `success`/`warning`/`destructive` Tailwind tokens available; `badge-success`/`badge-warning`/`badge-error` utility classes exist |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^16.1.6 | App framework, API routes, SSR | Already used; API routes handle agent discovery endpoints |
| React | ^19.0.1 | UI rendering | Already used |
| Zustand | ^5.0.11 | Client state management | Already used; existing agent state slice to extend |
| Tailwind CSS | ^3.4.17 | Styling | Already used; semantic tokens defined |
| next-themes | ^0.4.6 | Dark/light mode | Already used |
| Zod | ^4.3.6 | Schema validation | Already used for API validation |
| pino | ^10.3.1 | Server-side logging | Already used |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs` | built-in | Filesystem scanning | Agent directory discovery, config reading, JSONL parsing |
| Node.js `net` | built-in | TCP port check | Gateway liveness detection |
| Node.js `child_process` | built-in | Process detection (optional) | PID-based process check fallback |

### No New Dependencies Needed
The existing stack handles all Phase 2 requirements. No toast library needed -- build a minimal toast component using existing Tailwind animations (`fade-in`, `slide-in-right`) and CSS. No filesystem watcher library needed -- polling is more reliable for this use case (see pitfalls section).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polling fs | chokidar | Chokidar adds a dependency for marginal benefit; polling every 30s is perfectly adequate for agent directory changes |
| Custom toast | sonner/react-hot-toast | Adding a dependency for 4-5 toast use cases is overkill; 50-line custom component suffices |
| TCP port check | HTTP fetch to gateway | HTTP is higher-level but gateway may not have a /health endpoint (confirmed: no standard health endpoint found); raw TCP connect is more reliable |

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/api/
    agents/
      discover/
        route.ts          # GET /api/agents/discover -- filesystem scan + health check
      [id]/
        errors/
          route.ts        # GET /api/agents/{id}/errors -- error log entries
          dismiss/
            route.ts      # POST /api/agents/{id}/errors/dismiss -- acknowledge errors
        channels/
          route.ts        # GET /api/agents/{id}/channels -- channel status
  lib/
    agent-discovery.ts    # Server-side: scan filesystem, read configs, build agent list
    agent-health.ts       # Server-side: port check, JSONL parsing, error detection, composite score
    health-monitor.ts     # Server-side: singleton that runs periodic checks, broadcasts via eventBus
  components/
    agents/
      agent-card.tsx      # Individual agent card component
      agent-card-grid.tsx # Grid layout with summary bar
      agent-slide-out.tsx # Right slide-out panel with tabs
      agent-overview-tab.tsx
      agent-errors-tab.tsx
      agent-channels-tab.tsx
      agent-summary-bar.tsx
      agent-health-dot.tsx # Reusable status dot with tooltip
      agent-skeleton.tsx  # Loading skeleton card
    ui/
      toast.tsx           # Minimal toast notification component
      toast-provider.tsx  # Toast context/container
  types/
    agent-health.ts       # Types: DiscoveredAgent, HealthStatus, ChannelStatus, etc.
```

### Pattern 1: Server-Side Agent Discovery Service
**What:** A singleton service running in the Next.js server process that periodically scans the filesystem, reads agent configs, checks gateway ports, and parses session/error files. Results are cached in memory (not DB) and broadcast via SSE when changes occur.
**When to use:** Every health check interval (default 30 seconds), and on-demand via API.
**Example:**
```typescript
// src/lib/agent-discovery.ts
import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/lib/config'

interface DiscoveredAgent {
  id: string              // directory name, e.g. "stefany"
  name: string            // from IDENTITY.md or directory name
  workspacePath: string   // absolute path to agent workspace dir
  homePath: string        // absolute path to agent HOME dir
  configPath: string      // path to .nanobot/config.json
  launchScript: string    // path to launch-{name}.sh
  model: string           // from config.json agents.defaults.model
  gatewayPort: number     // from config.json gateway.port
  channels: Record<string, { enabled: boolean }> // from config channels section
  icon?: string           // from config icon field, if present
}

export function discoverAgents(): DiscoveredAgent[] {
  const agentsDir = path.join(config.nanobotStateDir, 'workspace', 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => buildAgentFromDirectory(agentsDir, e.name))
    .filter(Boolean) as DiscoveredAgent[]
}

function buildAgentFromDirectory(agentsDir: string, name: string): DiscoveredAgent | null {
  const workspacePath = path.join(agentsDir, name)
  // Parse launch script to find HOME path
  const launchScript = findLaunchScript(workspacePath, name)
  if (!launchScript) return null

  const homePath = parseHomeFromLaunchScript(launchScript)
  const configPath = path.join(homePath, '.nanobot', 'config.json')
  if (!fs.existsSync(configPath)) return null

  const agentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  // ... build DiscoveredAgent from config
}
```

### Pattern 2: TCP Port Liveness Check
**What:** Use Node.js `net.connect()` to test if a gateway port is accepting connections. This is the most reliable method since the nanobot gateway does not expose a standard HTTP health endpoint.
**When to use:** Every health check cycle to determine process alive/dead.
**Example:**
```typescript
// src/lib/agent-health.ts
import net from 'node:net'

export function checkPortAlive(port: number, host = '127.0.0.1', timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}
```

### Pattern 3: JSONL Last-Line Reading (Activity Timestamp)
**What:** Read the last line of the most recently modified `.jsonl` session file to extract the latest activity timestamp and content.
**When to use:** Every health check to determine last activity and current activity text.
**Example:**
```typescript
// src/lib/agent-health.ts
import fs from 'node:fs'
import path from 'node:path'

interface SessionActivity {
  timestamp: string       // ISO 8601 from JSONL
  content: string | null  // assistant message content (activity text)
  role: string            // user/assistant/tool
}

export function getLatestActivity(sessionsDir: string): SessionActivity | null {
  if (!fs.existsSync(sessionsDir)) return null

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime)

  if (files.length === 0) return null

  // Read last few lines of most recent file (reverse read)
  const filePath = path.join(sessionsDir, files[0].name)
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')

  // Walk backwards to find last assistant message for activity text
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i])
      if (entry.role === 'assistant' && entry.content) {
        return {
          timestamp: entry.timestamp,
          content: entry.content.slice(0, 100), // Truncate for card
          role: entry.role,
        }
      }
    } catch { continue }
  }

  // Fallback: use timestamp from last line regardless of role
  try {
    const lastEntry = JSON.parse(lines[lines.length - 1])
    return {
      timestamp: lastEntry.timestamp,
      content: null,
      role: lastEntry.role || 'unknown',
    }
  } catch { return null }
}
```

### Pattern 4: Composite Health Score
**What:** Combine multiple health dimensions into a single green/yellow/red status using worst-dimension-wins logic.
**When to use:** After collecting all health data for an agent.
**Example:**
```typescript
// src/lib/agent-health.ts
type HealthLevel = 'green' | 'yellow' | 'red'

interface HealthDimension {
  level: HealthLevel
  reason: string
}

interface CompositeHealth {
  overall: HealthLevel
  dimensions: {
    process: HealthDimension
    activity: HealthDimension
    errors: HealthDimension
    channels: HealthDimension
  }
}

export function computeCompositeHealth(data: {
  portAlive: boolean
  lastActivityMs: number | null  // ms since epoch
  errorCount24h: number
  criticalErrors: boolean
  channelsDown: string[]
  totalChannels: number
}): CompositeHealth {
  const now = Date.now()
  const ONE_HOUR = 60 * 60 * 1000

  const process: HealthDimension = data.portAlive
    ? { level: 'green', reason: 'Gateway process is running' }
    : { level: 'red', reason: 'Gateway process is not responding' }

  const activity: HealthDimension = (() => {
    if (!data.lastActivityMs) return { level: 'yellow', reason: 'No activity data found' }
    const elapsed = now - data.lastActivityMs
    if (elapsed < ONE_HOUR) return { level: 'green', reason: `Active ${Math.round(elapsed / 60000)}m ago` }
    return { level: 'yellow', reason: `No activity for ${Math.round(elapsed / 3600000)}h` }
  })()

  const errors: HealthDimension = (() => {
    if (data.criticalErrors) return { level: 'red', reason: 'Critical errors detected' }
    if (data.errorCount24h > 0) return { level: 'yellow', reason: `${data.errorCount24h} errors in last 24h` }
    return { level: 'green', reason: 'No errors' }
  })()

  const channels: HealthDimension = (() => {
    if (data.totalChannels === 0) return { level: 'green', reason: 'No channels configured' }
    if (data.channelsDown.length === 0) return { level: 'green', reason: 'All channels connected' }
    if (data.channelsDown.length === data.totalChannels) return { level: 'red', reason: 'All channels down' }
    return { level: 'yellow', reason: `${data.channelsDown.join(', ')} disconnected` }
  })()

  // Worst dimension wins
  const levels: HealthLevel[] = [process.level, activity.level, errors.level, channels.level]
  const overall: HealthLevel = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green'

  return { overall, dimensions: { process, activity, errors, channels } }
}
```

### Pattern 5: Health Monitor Singleton with EventBus Broadcasting
**What:** A server-side singleton that runs the health check loop and broadcasts changes via `eventBus`.
**When to use:** Started when the first API request hits the discovery endpoint; runs continuously.
**Example:**
```typescript
// src/lib/health-monitor.ts
import { eventBus } from '@/lib/event-bus'
import { discoverAgents } from '@/lib/agent-discovery'
import { checkAllHealth, type AgentHealthSnapshot } from '@/lib/agent-health'

class HealthMonitor {
  private static instance: HealthMonitor | null = null
  private intervalId: NodeJS.Timeout | null = null
  private lastSnapshot: Map<string, AgentHealthSnapshot> = new Map()
  private intervalMs = 30_000

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor()
    }
    return HealthMonitor.instance
  }

  setInterval(ms: number) {
    this.intervalMs = ms
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.start()
    }
  }

  start() {
    if (this.intervalId) return
    this.tick() // immediate first check
    this.intervalId = setInterval(() => this.tick(), this.intervalMs)
  }

  private async tick() {
    const agents = discoverAgents()
    const snapshots = await checkAllHealth(agents)

    // Detect changes and broadcast
    for (const snapshot of snapshots) {
      const prev = this.lastSnapshot.get(snapshot.id)
      if (!prev || prev.health.overall !== snapshot.health.overall) {
        eventBus.broadcast('agent.status_changed', {
          id: snapshot.id,
          name: snapshot.name,
          status: snapshot.health.overall,
          health: snapshot.health,
        })
      }
    }

    // Detect removed agents
    for (const [id] of this.lastSnapshot) {
      if (!snapshots.find(s => s.id === id)) {
        eventBus.broadcast('agent.deleted', { id })
      }
    }

    // Update cache
    this.lastSnapshot.clear()
    for (const s of snapshots) this.lastSnapshot.set(s.id, s)
  }

  getSnapshot(): AgentHealthSnapshot[] {
    return Array.from(this.lastSnapshot.values())
  }
}

// Survive HMR
const g = globalThis as typeof globalThis & { __healthMonitor?: HealthMonitor }
export const healthMonitor = g.__healthMonitor ?? HealthMonitor.getInstance()
g.__healthMonitor = healthMonitor
```

### Pattern 6: Slide-Out Panel with Right-Side Animation
**What:** Fixed-position overlay panel that slides in from the right, contains tabbed content.
**When to use:** When user clicks an agent card.
**Example:**
```typescript
// src/components/agents/agent-slide-out.tsx (abbreviated structure)
'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap' // existing hook
import { cn } from '@/lib/utils'

interface SlideOutProps {
  agentId: string | null
  onClose: () => void
}

export function AgentSlideOut({ agentId, onClose }: SlideOutProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!agentId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 h-full w-full md:w-[400px] z-50",
          "bg-card border-l border-border shadow-xl",
          "slide-in-right"  // existing CSS animation
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header with close button */}
        {/* Tab bar: Overview | Errors | Channels */}
        {/* Tab content */}
      </div>
    </>
  )
}
```

### Anti-Patterns to Avoid
- **Do NOT store discovered agents in SQLite:** The user explicitly decided "filesystem as source of truth -- always scan filesystem for agent list, no DB caching of agent registry." The existing `agents` SQLite table is for the legacy DB-based agent system; Phase 2 agents come from filesystem discovery.
- **Do NOT use chokidar or fs.watch for directory watching:** Polling every 30 seconds is more reliable than filesystem watchers, which suffer from platform inconsistencies (especially on macOS with case-insensitive HFS+), and the user already decided on a polling-based interval.
- **Do NOT read the entire JSONL file into memory:** Session files can be very large (87KB+ for Stefany's Telegram session). Read only the last few KB for activity detection, and limit error scanning to the most recent entries.
- **Do NOT make the browser talk directly to agent gateway ports:** All agent communication must route through MC API routes (GATE-04 requirement, even though it's Phase 3). Build the health check on the server side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling with visibility awareness | Custom setInterval with visibilitychange | `useSmartPoll` hook (existing) | Already handles tab visibility, backoff, initial fetch, SSE pause |
| SSE event dispatch | Custom EventSource handling | `useServerEvents` hook (existing) | Already handles reconnection, backoff, event dispatch to Zustand |
| Server-side event broadcasting | Custom pub/sub | `eventBus` singleton (existing) | Already works with SSE endpoint, survives HMR |
| Color-coded avatar fallback | Custom initials component | `AgentAvatar` component (existing) | Already has hash-based color generation, size variants |
| Status indicator dot | Custom status dot | Extend `OnlineStatus` (existing) | Already has green/red styling, pulse animation pattern |
| Focus trap for slide-out | Custom trap | `useFocusTrap` hook (existing) | Already implemented for dialog patterns |
| Class merging | Manual className concatenation | `cn()` utility (existing) | Already configured with `tailwind-merge` |
| API route auth | Custom auth check | `requireRole()` (existing) | Handles session validation, role checking, workspace scoping |

**Key insight:** The existing codebase has robust infrastructure for real-time data flow (SSE + eventBus), visibility-aware polling (useSmartPoll), and auth patterns. Phase 2 should plug into these patterns rather than creating parallel systems.

## Common Pitfalls

### Pitfall 1: Agent HOME Path Discovery
**What goes wrong:** Assuming agent config lives at `~/.nanobot/workspace/agents/{name}/.nanobot/config.json` when it actually lives at `~/.nanobot-{name}-home/.nanobot/config.json` (a completely different directory tree).
**Why it happens:** Each agent sets `export HOME="/Users/designmac/.nanobot-{name}-home"` in its launch script, making `~/.nanobot/config.json` resolve to the agent's isolated home.
**How to avoid:** Parse the launch script (`launch-{name}.sh`) to extract the `HOME=...` line, then read config from `{HOME}/.nanobot/config.json`.
**Warning signs:** Config reads returning empty/null, wrong port numbers, wrong model names.

### Pitfall 2: Large JSONL Files Blocking the Event Loop
**What goes wrong:** Reading a 90KB+ JSONL file synchronously to find the last activity blocks the Node.js event loop, causing the entire dashboard to hang during health checks.
**Why it happens:** `fs.readFileSync` on a large file followed by splitting into lines is expensive.
**How to avoid:** Read only the last N bytes (e.g., 4096) of the file using `fs.openSync` + `fs.readSync` with a buffer positioned at `file.size - 4096`. Parse backward from there. For error scanning, limit to last 50 lines or last 24 hours.
**Warning signs:** Health check API calls taking > 500ms.

### Pitfall 3: Gateway Port False Positives
**What goes wrong:** Another process (not the nanobot gateway) could be listening on the same port, leading to a false "alive" status.
**Why it happens:** Ports can be reused after an agent crashes if another service starts.
**How to avoid:** TCP connect confirms a port is open but doesn't confirm it's the right process. For Phase 2 (read-only monitoring), this is acceptable. In Phase 3 (lifecycle control), add HTTP endpoint validation. Document this as a known limitation.
**Warning signs:** Agent showing "green" but with no recent activity.

### Pitfall 4: Race Between Discovery and Health Check
**What goes wrong:** An agent directory is discovered but the launch script or config.json doesn't exist yet (directory created but files not yet copied).
**Why it happens:** Filesystem operations aren't atomic -- directory creation and file population happen sequentially.
**How to avoid:** Validate that required files exist (`launch-{name}.sh` and config.json accessible from parsed HOME) before adding to discovered agents list. Skip incomplete directories silently.
**Warning signs:** Transient errors during discovery scan.

### Pitfall 5: JSONL Session Metadata Line
**What goes wrong:** Treating the first line of a JSONL session file as a regular message when it's actually a metadata header.
**Why it happens:** The first line has `{"_type": "metadata", "key": "telegram:6432548537", ...}` which is not a user/assistant/tool message.
**How to avoid:** Check for `_type: "metadata"` and skip it. The metadata line contains useful info: `created_at`, `updated_at`, and `last_consolidated` fields.
**Warning signs:** Activity text showing raw metadata instead of actual conversation content.

### Pitfall 6: Stale EventBus Listeners on HMR
**What goes wrong:** In development, Hot Module Replacement causes duplicate event listeners, leading to multiple SSE broadcasts per health change.
**Why it happens:** The health monitor singleton and event bus can be re-instantiated during HMR.
**How to avoid:** Use the `globalThis` pattern (already established in `event-bus.ts`) for the health monitor singleton. Store the instance on `globalThis.__healthMonitor`.
**Warning signs:** Duplicate toast notifications, flickering status indicators.

### Pitfall 7: Error Log Parsing Performance
**What goes wrong:** The error log file (`stefany-error.log`) is 2.9MB for Stefany. Parsing the entire file every 30 seconds is wasteful.
**Why it happens:** Error logs accumulate over time with full Python tracebacks.
**How to avoid:** Track the last read byte offset. On each check, only read from the saved offset to EOF. For initial load, read only the last 100KB. Count errors by looking for log entry boundaries (lines starting with timestamps or known patterns).
**Warning signs:** CPU spikes during health checks, slow API responses.

## Code Examples

### Launch Script Parsing for HOME Path
```typescript
// src/lib/agent-discovery.ts
import fs from 'node:fs'

export function parseHomeFromLaunchScript(scriptPath: string): string {
  const content = fs.readFileSync(scriptPath, 'utf-8')
  // Match: export HOME="/path/to/home" or export HOME=/path/to/home
  const match = content.match(/export\s+HOME\s*=\s*"?([^"\n]+)"?/)
  if (!match) throw new Error(`No HOME export found in ${scriptPath}`)
  return match[1]
}

export function findLaunchScript(workspacePath: string, agentName: string): string | null {
  // Look for launch-{name}.sh
  const scriptPath = path.join(workspacePath, `launch-${agentName}.sh`)
  if (fs.existsSync(scriptPath)) return scriptPath

  // Fallback: look for any launch-*.sh
  const entries = fs.readdirSync(workspacePath)
  const launchFile = entries.find(e => e.startsWith('launch-') && e.endsWith('.sh'))
  return launchFile ? path.join(workspacePath, launchFile) : null
}
```

### Reading Last N Bytes of a File (Efficient JSONL Tail)
```typescript
// src/lib/agent-health.ts
import fs from 'node:fs'

export function readLastLines(filePath: string, maxBytes = 4096): string[] {
  const stat = fs.statSync(filePath)
  if (stat.size === 0) return []

  const bytesToRead = Math.min(maxBytes, stat.size)
  const buffer = Buffer.alloc(bytesToRead)
  const fd = fs.openSync(filePath, 'r')

  try {
    fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead)
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    // First line may be partial if we didn't start at the beginning
    if (stat.size > bytesToRead && lines.length > 0) {
      lines.shift() // Remove potentially partial first line
    }
    return lines
  } finally {
    fs.closeSync(fd)
  }
}
```

### Agent Config Reader
```typescript
// src/lib/agent-discovery.ts
interface AgentConfig {
  model: string
  gatewayPort: number
  gatewayHost: string
  channels: Record<string, { enabled: boolean }>
  icon?: string
}

export function readAgentConfig(configPath: string): AgentConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      model: raw?.agents?.defaults?.model || 'unknown',
      gatewayPort: raw?.gateway?.port || 0,
      gatewayHost: raw?.gateway?.host || '127.0.0.1',
      channels: Object.fromEntries(
        Object.entries(raw?.channels || {})
          .filter(([, v]: [string, any]) => v?.enabled)
          .map(([k, v]: [string, any]) => [k, { enabled: v.enabled }])
      ),
      icon: raw?.icon,
    }
  } catch {
    return null
  }
}
```

### Error Detection from JSONL Sessions
```typescript
// src/lib/agent-health.ts
interface AgentError {
  timestamp: string
  type: 'tool_error' | 'rate_limit' | 'channel_error' | 'crash'
  message: string
  source: string // session file or error log
}

export function detectErrorsFromJsonl(
  sessionsDir: string,
  since: Date // e.g., 24 hours ago
): AgentError[] {
  const errors: AgentError[] = []
  const sinceMs = since.getTime()

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))

  for (const file of files) {
    const filePath = path.join(sessionsDir, file)
    const lines = readLastLines(filePath, 16384) // last 16KB

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (!entry.timestamp) continue
        const ts = new Date(entry.timestamp).getTime()
        if (ts < sinceMs) continue

        // Check for tool errors
        if (entry.role === 'tool' && typeof entry.content === 'string') {
          if (entry.content.includes('Error:') || entry.content.includes('error:')) {
            errors.push({
              timestamp: entry.timestamp,
              type: 'tool_error',
              message: entry.content.slice(0, 200),
              source: file,
            })
          }
        }

        // Check for rate limits (common pattern in nanobot responses)
        if (entry.content && typeof entry.content === 'string' &&
            entry.content.toLowerCase().includes('rate limit')) {
          errors.push({
            timestamp: entry.timestamp,
            type: 'rate_limit',
            message: entry.content.slice(0, 200),
            source: file,
          })
        }
      } catch { continue }
    }
  }

  return errors
}
```

### Error Detection from Error Log Files
```typescript
// src/lib/agent-health.ts
export function detectErrorsFromLog(
  logsDir: string,
  agentName: string,
  since: Date
): AgentError[] {
  const errorLogPath = path.join(logsDir, `${agentName}-error.log`)
  if (!fs.existsSync(errorLogPath)) return []

  const errors: AgentError[] = []
  const lines = readLastLines(errorLogPath, 32768) // last 32KB of error log

  // Look for specific error patterns
  for (const line of lines) {
    // Telegram conflict (channel error)
    if (line.includes('telegram.error.Conflict')) {
      errors.push({
        timestamp: new Date().toISOString(), // error logs may not have timestamps
        type: 'channel_error',
        message: 'Telegram bot conflict -- duplicate instance detected',
        source: `${agentName}-error.log`,
      })
    }
    // Generic Python traceback end
    if (line.match(/^\w+Error:/) || line.match(/^\w+Exception:/)) {
      errors.push({
        timestamp: new Date().toISOString(),
        type: 'crash',
        message: line.slice(0, 200),
        source: `${agentName}-error.log`,
      })
    }
  }

  return errors
}
```

### Minimal Toast Component
```typescript
// src/components/ui/toast.tsx
'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = String(++counterRef.current)
    setToasts(prev => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, toast.duration ?? 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'px-4 py-3 rounded-lg shadow-lg text-sm font-medium fade-in',
              'border backdrop-blur-sm',
              t.type === 'error' && 'bg-destructive/90 text-destructive-foreground border-destructive/50',
              t.type === 'warning' && 'bg-warning/90 text-warning-foreground border-warning/50',
              t.type === 'success' && 'bg-success/90 text-success-foreground border-success/50',
              t.type === 'info' && 'bg-card text-card-foreground border-border',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DB-stored agents from /api/agents | Filesystem-discovered agents from ~/.nanobot/workspace/agents/ | Phase 2 | Agent registry becomes filesystem-first; existing DB agents table serves legacy features |
| Agent status from DB field | Computed composite health from port check + JSONL + error logs | Phase 2 | Status is live, not stale DB rows |
| Single connected/disconnected status | Multi-dimensional green/yellow/red health | Phase 2 | More nuanced monitoring |

**Deprecated/outdated in this transition:**
- The existing `GET /api/agents` route reads from SQLite. Phase 2's discovery route reads from filesystem. These can coexist initially -- the new route is additive.
- The existing `Agent` type in `shared.ts` uses `status: 'offline' | 'idle' | 'busy' | 'error'`. Phase 2 needs a different health type. Define new types rather than modifying the existing `Agent` interface.

## Nanobot Filesystem Reference (from live investigation)

### Agent Directory Layout
```
~/.nanobot/workspace/agents/
  {agent-name}/                  # e.g., "stefany", "cody"
    IDENTITY.md                  # Name, DOB, role, pronouns
    SOUL.md                      # Personality/behavior rules
    HEARTBEAT.md                 # Periodic task config
    SESSION-STATE.md             # Current session state
    USER.md                      # Owner info
    AGENTS.md                    # Awareness of other agents
    TOOLS.md                     # Available tools
    launch-{name}.sh             # Launch script (sets HOME, runs gateway)
    jobs.json                    # Cron job definitions
    sessions/                    # JSONL conversation logs
      telegram_6432548537.jsonl  # Per-channel session files
      cron_daily-summary.jsonl   # Per-cron-job session files
    logs/
      {name}.log                 # Standard output log
      {name}-error.log           # Error log (can be large, 2.9MB+)
    memory/                      # Agent memory system
      MEMORY.md
      SESSION-STATE.md
      episodes/
      graph/
      procedures/
      vault/
    skills/                      # Agent skill definitions
```

### Agent Config Format (from HOME/.nanobot/config.json)
```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/workspace/agents/{name}",
      "model": "anthropic/claude-sonnet-4.6",
      "maxTokens": 8192,
      "temperature": 0.7,
      "memorySystem": "hybrid"
    }
  },
  "channels": {
    "telegram": { "enabled": true, "token": "...", "allowFrom": [...] },
    "discord": { "enabled": false, ... }
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": 18793
  },
  "icon": "brain"          // Optional custom icon field
}
```

### JSONL Session Format
```jsonl
{"_type": "metadata", "key": "telegram:6432548537", "created_at": "...", "updated_at": "...", "last_consolidated": 153}
{"role": "user", "content": "What jobs do you have?", "timestamp": "2026-03-09T09:44:39.564860"}
{"role": "assistant", "content": "Checking now.", "tool_calls": [...], "timestamp": "..."}
{"role": "tool", "tool_call_id": "...", "name": "cron", "content": "...", "timestamp": "..."}
{"role": "assistant", "content": "Here are your jobs: ...", "timestamp": "..."}
```

### Launch Script Format
```bash
#!/bin/bash
export HOME="/Users/designmac/.nanobot-{name}-home"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export BOT_ID={name}
exec /usr/local/bin/nanobot gateway --port {port}
```

### Known Agents (current)
| Agent | Port | HOME | Channels |
|-------|------|------|----------|
| stefany | 18793 | ~/.nanobot-stefany-home | telegram (enabled) |
| cody | 18792 | ~/.nanobot-cody-home | telegram (enabled), discord (disabled), whatsapp (disabled) |

## Open Questions

1. **Gateway HTTP Health Endpoint**
   - What we know: `nanobot gateway` serves on a configurable port. TCP connect confirms it's up.
   - What's unclear: Whether the gateway exposes any HTTP endpoints (e.g., `/health`, `/status`). Gateway was not running during research so this could not be tested.
   - Recommendation: Use TCP port check for Phase 2 (reliable, zero-dependency). If gateway exposes HTTP endpoints, Phase 3 can upgrade to richer health data.

2. **Channel Connection Status (Runtime)**
   - What we know: Config.json shows which channels are enabled. Error logs show channel errors (e.g., Telegram conflict). Gateway log shows "Channels enabled: telegram" on startup.
   - What's unclear: Whether there's a way to query live channel connection status from the gateway at runtime.
   - Recommendation: For Phase 2, infer channel status from: (a) config says enabled + gateway alive = assume connected, (b) recent channel errors in error log = mark degraded. Phase 3 (with gateway HTTP API) can provide real-time channel status.

3. **Process Crash Detection (was-alive-now-dead)**
   - What we know: Port check gives alive/dead. The health monitor tracks previous state.
   - What's unclear: How quickly after a crash the port becomes unreachable (TCP TIME_WAIT etc.).
   - Recommendation: Compare current port check to previous check. If previously alive and now dead, treat as a crash event. The 30-second polling interval is fast enough for monitoring purposes.

4. **Error Log Timestamp Format**
   - What we know: The error log (`stefany-error.log`) contains Python tracebacks without explicit timestamps per entry.
   - What's unclear: Whether all error log entries have timestamps or just raw stderr output.
   - Recommendation: For error counting, use file modification time + last-read-offset tracking. For JSONL session errors, timestamps are reliable. Combine both sources for error count.

5. **Icon Field Location**
   - What we know: CONTEXT.md specifies "Custom icon read from optional `icon` field in agent's config.json". Cody's IDENTITY.md has `Emoji: robot`.
   - What's unclear: Whether the `icon` field exists in any current config.json (it was not found in either Stefany's or Cody's config during investigation).
   - Recommendation: Check config.json for `icon` field at top level. Fallback: check IDENTITY.md for `Emoji:` field. Final fallback: use `AgentAvatar` with initials.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.5 (unit) + playwright 1.51 (e2e) |
| Config file | vitest.config.ts, playwright.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:all` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AREG-01 | Scan ~/.nanobot/workspace/agents/ and return agent list | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "discovers agents"` | Wave 0 |
| AREG-02 | Read agent config from HOME/.nanobot/config.json | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "reads config"` | Wave 0 |
| AREG-03 | Return name, model, port, workspace for each agent | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "agent properties"` | Wave 0 |
| AREG-04 | New agent directory detected without restart | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "detects new agent"` | Wave 0 |
| HLTH-01 | Port liveness check returns alive/dead | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "port check"` | Wave 0 |
| HLTH-02 | Last activity from JSONL session files | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "last activity"` | Wave 0 |
| HLTH-03 | Error detection from JSONL and error logs | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "error detection"` | Wave 0 |
| HLTH-04 | Channel status from config + error log | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "channel status"` | Wave 0 |
| HLTH-05 | Health checks on configurable interval | unit | `pnpm vitest run src/lib/__tests__/health-monitor.test.ts -t "interval"` | Wave 0 |
| HLTH-06 | Composite green/yellow/red status | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "composite health"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (vitest unit tests, ~5 seconds)
- **Per wave merge:** `pnpm test:all` (lint + typecheck + test + build + e2e)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/agent-discovery.test.ts` -- covers AREG-01, AREG-02, AREG-03, AREG-04 (mock filesystem with `vi.mock('node:fs')`)
- [ ] `src/lib/__tests__/agent-health.test.ts` -- covers HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-06 (mock `net.connect`, mock JSONL files)
- [ ] `src/lib/__tests__/health-monitor.test.ts` -- covers HLTH-05 (mock timers, verify eventBus broadcasts)

## Sources

### Primary (HIGH confidence)
- Live filesystem investigation: `~/.nanobot/workspace/agents/stefany/` and `~/.nanobot/workspace/agents/cody/` -- verified directory structure, config format, JSONL format, launch scripts, error logs
- Source code analysis: `src/lib/config.ts`, `src/lib/event-bus.ts`, `src/lib/use-smart-poll.ts`, `src/lib/use-server-events.ts`, `src/store/index.ts`, `src/nav-rail.tsx`, `src/app/api/agents/route.ts`, `src/app/api/events/route.ts`
- Agent configs: `~/.nanobot-stefany-home/.nanobot/config.json`, `~/.nanobot-cody-home/.nanobot/config.json`
- Launch scripts: `launch-stefany.sh`, `launch-cody.sh` -- confirmed HOME isolation pattern
- Session JSONL: `~/.nanobot/workspace/agents/stefany/sessions/telegram_6432548537.jsonl` -- verified format with metadata line, role-based entries, timestamps
- Error logs: `~/.nanobot/workspace/agents/stefany/logs/stefany-error.log` -- confirmed Python traceback format, channel errors

### Secondary (MEDIUM confidence)
- `nanobot gateway --help` output: confirms port flag, minimal gateway interface
- `nanobot --version`: v0.1.4.post3

### Tertiary (LOW confidence)
- Gateway HTTP endpoints: could not test (gateway was not running). TCP port check is assumed to be the only reliable liveness mechanism. Needs validation when gateway is running.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - patterns derived from existing codebase conventions (eventBus, SSE, useSmartPoll)
- Filesystem structure: HIGH - verified by direct investigation of live agent directories
- Pitfalls: HIGH - identified from actual data (2.9MB error log, 87KB session file, HOME isolation pattern)
- Gateway health check: MEDIUM - TCP port check is reliable but HTTP health endpoint status unknown

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- nanobot filesystem conventions unlikely to change)
