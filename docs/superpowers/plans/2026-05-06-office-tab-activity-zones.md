# Office Tab — Activity Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Office panel so it shows what each agent is *doing* — agents migrate between activity zones (Library, Workshop, Lab, Phone Booths, War Room) based on inferred activity from existing telemetry, animate per-kind, and emit short deadpan speech bubbles. Final phase adds a token-gated `/office/tv` kiosk route.

**Architecture:** Pure inference function (`inferActivityState`) reads recent rows from `mcp_call_log`, `messages` (a2a/coord conversations), and `tasks` to map each agent to one of 10 `ActivityKind`s. A new `/api/agents/activity` endpoint runs this per-agent then applies a cross-agent meeting promotion. The panel polls every 5s, animates agents along corridor waypoints to activity-zone seats, and renders glyphs + bubbles. The kiosk route reuses the same panel with a `kiosk` prop and bypasses session auth via `MC_OFFICE_TV_TOKEN`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, better-sqlite3, Vitest, Playwright, Tailwind, Zustand. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-06-office-tab-activity-zones-design.md`

---

## File map

### New files
- `src/lib/agent-activity.ts` — types + pure `inferActivityState()`
- `src/lib/__tests__/agent-activity.test.ts`
- `src/app/api/agents/activity/route.ts` — endpoint (Pass 2 + cache)
- `src/lib/__tests__/agent-activity-route.test.ts` — route handler unit tests
- `src/lib/office-paths.ts` — `pathBetween()` waypoint helper
- `src/lib/__tests__/office-paths.test.ts`
- `src/lib/office-deadpan.ts` — content library + `pickDeadpanLine()`
- `src/lib/__tests__/office-deadpan.test.ts`
- `src/components/panels/office/walking-crewmate.tsx` — multi-leg motion
- `src/components/panels/office/speech-bubble.tsx` — bubble component
- `src/components/panels/office/activity-glyph.tsx` — per-kind glyph SVGs
- `src/lib/kiosk-auth.ts` — `validateKioskToken()`
- `src/lib/__tests__/kiosk-auth.test.ts`
- `src/app/office/tv/page.tsx` — kiosk route entry
- `tests/office-tv.spec.ts` — kiosk Playwright test

### Modified files
- `src/lib/office-layout.ts` — new `RoomId` enum, geometry, doors, `classifyAgentByActivity`
- `src/components/panels/office-panel.tsx` — fetch activities, walking crewmates, glyphs, bubbles, `kiosk` prop, `?demo=1`
- `src/store/index.ts` — `officeActivities` slice + setter
- `src/proxy.ts` — kiosk token bypass for `/office/tv` and `/api/agents/activity`
- `tests/office.spec.ts` (or new) — extended Playwright assertions

---

# PHASE 1 — Data plumbing

After Phase 1, the panel still classifies by status (no visible change). The new endpoint exists and is being called, but the panel ignores its data.

## Task 1.1: Define activity types

**Files:**
- Create: `src/lib/agent-activity.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/agent-activity.ts

export type ActivityKind =
  | 'typing'
  | 'reading'
  | 'searching'
  | 'bash'
  | 'on-call'
  | 'in-meeting'
  | 'thinking'
  | 'blocked'
  | 'idle'
  | 'error'

export interface ActivityState {
  kind: ActivityKind
  subject?: string
  since: number  // unix ms when this state began
}

export interface ActivitySignals {
  status: 'idle' | 'busy' | 'error' | 'offline'
  /** Seconds since unix epoch — last_seen on the agent record */
  lastSeen: number
  /** Latest mcp_call_log row for this agent (last 60s), if any */
  latestTool?: { toolName: string; subject?: string; createdAt: number }
  /** Latest a2a/coord/session/agent_* message for this agent (last 60s), if any */
  latestComms?: { peer: string; createdAt: number }
  /** Title of the agent's task currently in `review`/`quality_review`, if any */
  blockedOnTaskTitle?: string
}

const RECENT_WINDOW_SEC = 60
const IDLE_THRESHOLD_SEC = 5 * 60

export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

const TYPING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob'])
const SEARCHING_TOOLS = new Set(['WebFetch', 'WebSearch'])
const BASH_TOOLS = new Set(['Bash'])

export function classifyTool(toolName: string): ActivityKind | null {
  if (TYPING_TOOLS.has(toolName)) return 'typing'
  if (READING_TOOLS.has(toolName)) return 'reading'
  if (SEARCHING_TOOLS.has(toolName)) return 'searching'
  if (BASH_TOOLS.has(toolName)) return 'bash'
  return null
}

/**
 * Pure per-agent inference. Does not consider other agents.
 * Cross-agent promotion to `in-meeting` happens in the API route.
 */
export function inferActivityState(
  signals: ActivitySignals,
  now: number = nowSec(),
): ActivityState {
  const since = (s: number) => s * 1000

  if (signals.status === 'error') {
    return { kind: 'error', since: since(now) }
  }

  if (signals.latestComms && now - signals.latestComms.createdAt <= RECENT_WINDOW_SEC) {
    return { kind: 'on-call', subject: signals.latestComms.peer, since: since(signals.latestComms.createdAt) }
  }

  if (signals.latestTool && now - signals.latestTool.createdAt <= RECENT_WINDOW_SEC) {
    const kind = classifyTool(signals.latestTool.toolName)
    if (kind) {
      return { kind, subject: signals.latestTool.subject, since: since(signals.latestTool.createdAt) }
    }
  }

  if (signals.blockedOnTaskTitle) {
    return { kind: 'blocked', subject: signals.blockedOnTaskTitle, since: since(now) }
  }

  if (signals.status === 'busy') {
    return { kind: 'thinking', since: since(now) }
  }

  if (signals.status === 'idle' && now - signals.lastSeen > IDLE_THRESHOLD_SEC) {
    return { kind: 'idle', since: since(signals.lastSeen) }
  }

  return { kind: 'idle', since: since(now) }
}

/**
 * Cross-agent post-pass: if N+ agents are in active states, promote them all to in-meeting.
 * Active states for this purpose: thinking/typing/reading/on-call.
 */
export function promoteMeeting(
  states: Map<string, ActivityState>,
  threshold: number,
): Map<string, ActivityState> {
  const ACTIVE: ActivityKind[] = ['thinking', 'typing', 'reading', 'on-call']
  const candidates: string[] = []
  for (const [name, state] of states) {
    if (ACTIVE.includes(state.kind)) candidates.push(name)
  }
  if (candidates.length < threshold) return states

  const peers = candidates.slice(0, 5).join(', ')
  const now = Date.now()
  const result = new Map(states)
  for (const name of candidates) {
    result.set(name, { kind: 'in-meeting', subject: peers, since: now })
  }
  return result
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent-activity.ts
git commit -m "feat(office): activity types and inferActivityState"
```

## Task 1.2: Test inferActivityState — error precedence

**Files:**
- Create: `src/lib/__tests__/agent-activity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/agent-activity.test.ts
import { describe, it, expect } from 'vitest'
import { inferActivityState, promoteMeeting } from '../agent-activity'
import type { ActivitySignals, ActivityState } from '../agent-activity'

const NOW = 1_700_000_000  // fixed seconds-since-epoch for deterministic tests
const baseSignals: ActivitySignals = { status: 'busy', lastSeen: NOW }

describe('inferActivityState', () => {
  it('returns error when status is error (highest precedence)', () => {
    const result = inferActivityState({ ...baseSignals, status: 'error' }, NOW)
    expect(result.kind).toBe('error')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/agent-activity.test.ts`
Expected: 1 test passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/agent-activity.test.ts
git commit -m "test(office): error precedence for inferActivityState"
```

## Task 1.3: Test inferActivityState — comms beats tool, tool maps correctly

- [ ] **Step 1: Append cases to the test file**

```ts
// append to src/lib/__tests__/agent-activity.test.ts inside describe('inferActivityState', () => { ... })

  it('returns on-call when comms event is recent', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 10 },
    }, NOW)
    expect(result.kind).toBe('on-call')
    expect(result.subject).toBe('Cody')
  })

  it('ignores stale comms (>60s)', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 120 },
    }, NOW)
    expect(result.kind).not.toBe('on-call')
  })

  it('on-call beats latestTool', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 5 },
      latestTool: { toolName: 'Edit', createdAt: NOW - 1, subject: 'foo.ts' },
    }, NOW)
    expect(result.kind).toBe('on-call')
  })

  it('maps Edit/Write/MultiEdit/NotebookEdit to typing', () => {
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5, subject: 'foo.ts' },
      }, NOW)
      expect(result.kind).toBe('typing')
      expect(result.subject).toBe('foo.ts')
    }
  })

  it('maps Read/Grep/Glob to reading', () => {
    for (const tool of ['Read', 'Grep', 'Glob']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5, subject: 'foo.ts' },
      }, NOW)
      expect(result.kind).toBe('reading')
    }
  })

  it('maps WebFetch/WebSearch to searching', () => {
    for (const tool of ['WebFetch', 'WebSearch']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5 },
      }, NOW)
      expect(result.kind).toBe('searching')
    }
  })

  it('maps Bash to bash', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestTool: { toolName: 'Bash', createdAt: NOW - 5, subject: 'pnpm test' },
    }, NOW)
    expect(result.kind).toBe('bash')
    expect(result.subject).toBe('pnpm test')
  })

  it('falls through unknown tools', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestTool: { toolName: 'UnknownTool', createdAt: NOW - 5 },
    }, NOW)
    expect(result.kind).not.toBe('typing')
    expect(result.kind).not.toBe('reading')
  })
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/lib/__tests__/agent-activity.test.ts`
Expected: All tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/agent-activity.test.ts
git commit -m "test(office): on-call precedence and tool→kind mapping"
```

## Task 1.4: Test inferActivityState — blocked, thinking, idle, default

- [ ] **Step 1: Append cases**

```ts
// append to src/lib/__tests__/agent-activity.test.ts inside describe('inferActivityState', () => { ... })

  it('returns blocked when assigned task is in review', () => {
    const result = inferActivityState({
      ...baseSignals,
      blockedOnTaskTitle: 'PR-23: refactor auth',
    }, NOW)
    expect(result.kind).toBe('blocked')
    expect(result.subject).toBe('PR-23: refactor auth')
  })

  it('returns thinking when busy with no recent signals', () => {
    const result = inferActivityState(baseSignals, NOW)
    expect(result.kind).toBe('thinking')
  })

  it('returns idle when status idle and last_seen older than 5min', () => {
    const result = inferActivityState({
      status: 'idle',
      lastSeen: NOW - 600,
    }, NOW)
    expect(result.kind).toBe('idle')
  })

  it('returns idle (no subject) by default for fresh idle agent', () => {
    const result = inferActivityState({
      status: 'idle',
      lastSeen: NOW - 10,
    }, NOW)
    expect(result.kind).toBe('idle')
    expect(result.subject).toBeUndefined()
  })
})

describe('promoteMeeting', () => {
  it('does nothing below threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('a')!.kind).toBe('thinking')
    expect(result.get('b')!.kind).toBe('typing')
  })

  it('promotes all active agents to in-meeting at threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
      ['c', { kind: 'reading', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('a')!.kind).toBe('in-meeting')
    expect(result.get('b')!.kind).toBe('in-meeting')
    expect(result.get('c')!.kind).toBe('in-meeting')
  })

  it('does not promote idle/blocked/error agents even at threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
      ['c', { kind: 'reading', since: NOW * 1000 }],
      ['d', { kind: 'idle', since: NOW * 1000 }],
      ['e', { kind: 'blocked', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('d')!.kind).toBe('idle')
    expect(result.get('e')!.kind).toBe('blocked')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/lib/__tests__/agent-activity.test.ts`
Expected: All tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/agent-activity.test.ts
git commit -m "test(office): blocked/thinking/idle/default + meeting promotion"
```

## Task 1.5: Add latest-tool helper to claude-sessions

**Files:**
- Modify: `src/lib/claude-sessions.ts` — add an exported helper that returns the latest `tool_use` per session (so the API route can pull tool signal for local Claude Code sessions, which don't write to `mcp_call_log`).

- [ ] **Step 1: Append helper to claude-sessions.ts**

Add the following exported function near the bottom of `src/lib/claude-sessions.ts` (just below the existing `SessionStats` consumers):

```ts
import { readdirSync as _readdirSync, readFileSync as _readFileSync, statSync as _statSync } from 'fs'

export interface LatestToolUse {
  agentName: string  // matches resolveAgentName conventions; falls back to projectSlug
  toolName: string
  subject?: string  // file path / command / URL when available
  createdAt: number  // unix seconds
}

const TOOL_RECENT_WINDOW_SEC = 60

/**
 * Scans active session JSONL files and returns the latest tool_use per agent
 * (within the last 60s). Used as a fallback signal for local Claude Code
 * sessions that don't log to `mcp_call_log`.
 */
export function getRecentToolUsesByAgent(claudeHome?: string): LatestToolUse[] {
  const home = claudeHome || config.MC_CLAUDE_HOME || `${process.env.HOME}/.claude`
  const projectsDir = `${home}/projects`
  const out = new Map<string, LatestToolUse>()
  const sinceSec = Math.floor(Date.now() / 1000) - TOOL_RECENT_WINDOW_SEC

  let projectDirs: string[] = []
  try { projectDirs = _readdirSync(projectsDir) } catch { return [] }

  for (const proj of projectDirs) {
    let files: string[] = []
    try { files = _readdirSync(`${projectsDir}/${proj}`).filter(f => f.endsWith('.jsonl')) } catch { continue }
    for (const file of files) {
      const path = `${projectsDir}/${proj}/${file}`
      let stat
      try { stat = _statSync(path) } catch { continue }
      if (stat.mtimeMs / 1000 < sinceSec) continue

      let content: string
      try { content = _readFileSync(path, 'utf8') } catch { continue }
      const lines = content.trim().split('\n').slice(-50)

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]
        if (!line) continue
        try {
          const entry = JSON.parse(line)
          const ts = entry?.timestamp ? Math.floor(new Date(entry.timestamp).getTime() / 1000) : 0
          if (!ts || ts < sinceSec) continue
          const content = entry?.message?.content
          if (!Array.isArray(content)) continue
          for (const part of content) {
            if (part?.type === 'tool_use' && typeof part?.name === 'string') {
              const subject =
                typeof part?.input?.file_path === 'string' ? part.input.file_path
                : typeof part?.input?.command === 'string' ? part.input.command
                : typeof part?.input?.url === 'string' ? part.input.url
                : typeof part?.input?.query === 'string' ? part.input.query
                : undefined
              const agentName = proj  // best effort — caller can re-map via resolveAgentName
              const existing = out.get(agentName)
              if (!existing || existing.createdAt < ts) {
                out.set(agentName, { agentName, toolName: part.name, subject, createdAt: ts })
              }
              break  // latest tool found in this entry
            }
          }
        } catch { /* skip bad lines */ }
      }
    }
  }
  return Array.from(out.values())
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude-sessions.ts
git commit -m "feat(office): expose latest tool_use per agent for local sessions"
```

## Task 1.6: Implement /api/agents/activity route

**Files:**
- Create: `src/app/api/agents/activity/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/agents/activity/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  inferActivityState,
  promoteMeeting,
  nowSec,
  type ActivitySignals,
  type ActivityState,
} from '@/lib/agent-activity'
import { getRecentToolUsesByAgent } from '@/lib/claude-sessions'

interface CachedPayload {
  generated_at: number
  body: { agents: Array<{ id: number; name: string; activity: ActivityState }>; generated_at: number }
}

const CACHE_TTL_MS = 2_000
let cache: CachedPayload | null = null

function getMeetingThreshold(): number {
  const raw = process.env.MC_OFFICE_MEETING_THRESHOLD
  const n = raw ? parseInt(raw, 10) : 3
  return Number.isFinite(n) && n >= 2 ? n : 3
}

function deriveSubjectFromTool(toolName: string, errorOrPath: string | null): string | undefined {
  if (!errorOrPath) return undefined
  // mcp_call_log doesn't store the tool input, only error/duration. We fall back
  // to a generic subject if no path-like detail is available.
  if (toolName === 'Bash') return errorOrPath.slice(0, 40)
  return errorOrPath
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const now = Date.now()
  if (cache && now - cache.generated_at < CACHE_TTL_MS) {
    return NextResponse.json(cache.body)
  }

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const nowS = nowSec()
    const recentSince = nowS - 60

    const agents = db.prepare(`
      SELECT id, name, status, last_seen
      FROM agents WHERE workspace_id = ?
    `).all(workspaceId) as Array<{ id: number; name: string; status: string; last_seen: number }>

    const toolStmt = db.prepare(`
      SELECT tool_name, error, created_at
      FROM mcp_call_log
      WHERE agent_name = ? AND created_at >= ? AND workspace_id = ?
      ORDER BY created_at DESC LIMIT 1
    `)

    const commsStmt = db.prepare(`
      SELECT from_agent, to_agent, created_at
      FROM messages
      WHERE created_at >= ?
        AND (from_agent = ? OR to_agent = ?)
        AND (
          conversation_id LIKE 'a2a:%'
          OR conversation_id LIKE 'coord:%'
          OR conversation_id LIKE 'session:%'
          OR conversation_id LIKE 'agent_%'
        )
      ORDER BY created_at DESC LIMIT 1
    `)

    const blockedStmt = db.prepare(`
      SELECT title FROM tasks
      WHERE assigned_to = ?
        AND status IN ('review', 'quality_review')
        AND workspace_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `)

    // JSONL fallback for local Claude Code sessions that don't write to mcp_call_log.
    // Indexed by lowercased agent name for case-insensitive matching against agent records.
    const jsonlTools = new Map<string, { toolName: string; subject?: string; createdAt: number }>()
    try {
      for (const t of getRecentToolUsesByAgent()) {
        jsonlTools.set(t.agentName.toLowerCase(), { toolName: t.toolName, subject: t.subject, createdAt: t.createdAt })
      }
    } catch (e) {
      logger.warn({ err: e }, 'getRecentToolUsesByAgent failed')
    }

    const states = new Map<string, ActivityState>()

    for (const agent of agents) {
      const toolRow = toolStmt.get(agent.name, recentSince, workspaceId) as
        | { tool_name: string; error: string | null; created_at: number }
        | undefined
      const commsRow = commsStmt.get(recentSince, agent.name, agent.name) as
        | { from_agent: string; to_agent: string | null; created_at: number }
        | undefined
      const blockedRow = blockedStmt.get(agent.name, workspaceId) as { title: string } | undefined

      // Prefer DB tool log; fall back to JSONL if no DB row in window.
      let latestTool = toolRow
        ? {
            toolName: toolRow.tool_name,
            subject: deriveSubjectFromTool(toolRow.tool_name, toolRow.error),
            createdAt: toolRow.created_at,
          }
        : undefined
      if (!latestTool) {
        const fallback = jsonlTools.get(agent.name.toLowerCase())
        if (fallback) latestTool = fallback
      }

      const peer = commsRow
        ? (commsRow.from_agent === agent.name ? (commsRow.to_agent || 'someone') : commsRow.from_agent)
        : undefined

      const signals: ActivitySignals = {
        status: agent.status as ActivitySignals['status'],
        lastSeen: agent.last_seen,
        latestTool,
        latestComms: commsRow && peer ? { peer, createdAt: commsRow.created_at } : undefined,
        blockedOnTaskTitle: blockedRow?.title,
      }

      states.set(agent.name, inferActivityState(signals, nowS))
    }

    const promoted = promoteMeeting(states, getMeetingThreshold())

    const body = {
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        activity: promoted.get(a.name)!,
      })),
      generated_at: now,
    }

    cache = { generated_at: now, body }
    return NextResponse.json(body)
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/activity failed')
    if (cache) return NextResponse.json(cache.body)
    return NextResponse.json({ agents: [], generated_at: now }, { status: 200 })
  }
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 3: Smoke-test the route**

Run: `pnpm dev` (then in another terminal) `curl -s http://localhost:3000/api/agents/activity -H "x-api-key: $API_KEY" | jq .`
Expected: `{ "agents": [...], "generated_at": <number> }`. If `agents` is empty because no agents seeded, that's fine — endpoint exists.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/activity/route.ts
git commit -m "feat(office): /api/agents/activity endpoint with 2s cache"
```

## Task 1.7: Add officeActivities store slice

**Files:**
- Modify: `src/store/index.ts` (add fields next to existing `officeSessionAgents` block)

- [ ] **Step 1: Add type to the store interface**

Find the lines around the existing office state declarations (search for `officeSessionAgents: Agent[]`):

```ts
// existing
officeSessionAgents: Agent[]
officeLocalAgents: Agent[]
officeNanobotStatus: Record<string, { status: string; lastActivity: number | null; activeSession: string | null }>
officeDataFetched: boolean
```

Add directly below:

```ts
officeActivities: Record<string, import('@/lib/agent-activity').ActivityState>
setOfficeActivities: (activities: Record<string, import('@/lib/agent-activity').ActivityState>) => void
```

- [ ] **Step 2: Add initial value and setter**

Find the lines around `setOfficeSessionAgents: (agents) => set({ officeSessionAgents: agents })`. Add:

```ts
officeActivities: {},
setOfficeActivities: (activities) => set({ officeActivities: activities }),
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(office): officeActivities store slice"
```

## Task 1.8: Wire panel to fetch activities (no visual change yet)

**Files:**
- Modify: `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Import the activity types and the new store slice**

Near the top of the file, after the existing `useMissionControl` destructure block, add:

```tsx
// near other imports
import type { ActivityState } from '@/lib/agent-activity'
```

Inside `OfficePanel`, extend the `useMissionControl()` destructure:

```tsx
const {
  agents, dashboardMode,
  officeSessionAgents: sessionAgents, setOfficeSessionAgents: setSessionAgents,
  officeLocalAgents: localAgents, setOfficeLocalAgents: setLocalAgents,
  officeNanobotStatus: nanobotStatusObj, setOfficeNanobotStatus: setNanobotStatusObj,
  officeDataFetched, setOfficeDataFetched,
  officeActivities, setOfficeActivities,
} = useMissionControl()
```

- [ ] **Step 2: Add a `fetchActivities` function and 5s interval**

Below the existing `useEffect(() => { fetchAgents() }, [fetchAgents])`, add:

```tsx
const fetchActivities = useCallback(async () => {
  try {
    const res = await fetch('/api/agents/activity')
    if (!res.ok) return
    const json = await res.json()
    if (!Array.isArray(json?.agents)) return
    const map: Record<string, ActivityState> = {}
    for (const row of json.agents) {
      if (row?.name && row?.activity) map[row.name] = row.activity
    }
    setOfficeActivities(map)
  } catch { /* ignore — fall back to status */ }
}, [setOfficeActivities])

useEffect(() => { fetchActivities() }, [fetchActivities])

useEffect(() => {
  const id = setInterval(fetchActivities, 5_000)
  return () => clearInterval(id)
}, [fetchActivities])
```

- [ ] **Step 3: Reference `officeActivities` somewhere harmless to avoid an unused-var lint error**

Append a no-op log inside `useEffect`, or simply comment-reference. Cleaner: silence with explicit `void`:

```tsx
// place once, near the top of the component body
void officeActivities  // wired in Phase 2
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Run: `pnpm dev` and visit `/office`. Open DevTools network — confirm `/api/agents/activity` is hit every 5s.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office-panel.tsx
git commit -m "feat(office): poll /api/agents/activity every 5s"
```

---

# PHASE 2 — Layout & paths

After Phase 2, agents physically migrate between zones based on activity. Default Crewmate styling is unchanged.

## Task 2.1: New RoomId enum and ROOM_DEFS geometry

**Files:**
- Modify: `src/lib/office-layout.ts`

- [ ] **Step 1: Replace the `RoomId` type and `ROOM_DEFS` constant**

Replace lines that currently define `RoomId` and `ROOM_DEFS` with:

```ts
export type RoomId =
  | 'home-main'
  | 'home-gsd'
  | 'home-session'
  | 'library'
  | 'workshop'
  | 'lab'
  | 'phone-booth'
  | 'war-room'
  | 'waiting-bench'
  | 'break-room'

export const ROOM_DEFS: RoomDefinition[] = [
  // home rooms — left/right edges
  { id: 'home-main',    label: 'Main Office',  color: 'border-cyan-500/40 bg-cyan-500/8',     wallColor: '#0c1a2e', x:  2, y:  4, w: 22, h: 44 },
  { id: 'home-session', label: 'Session Pool', color: 'border-violet-500/40 bg-violet-500/8', wallColor: '#140c24', x:  2, y: 52, w: 22, h: 44 },
  { id: 'home-gsd',     label: 'GSD Wing',     color: 'border-emerald-500/40 bg-emerald-500/8', wallColor: '#0c1a14', x: 76, y:  4, w: 22, h: 44 },
  { id: 'break-room',   label: 'Break Room',   color: 'border-slate-500/30 bg-slate-500/6',   wallColor: '#12141a', x: 76, y: 52, w: 22, h: 44 },

  // corridor activity zones — center column
  { id: 'library',      label: 'Library',      color: 'border-amber-500/40 bg-amber-500/8',   wallColor: '#1a1408', x: 28, y:  6, w: 20, h: 22 },
  { id: 'lab',          label: 'Lab',          color: 'border-rose-500/40 bg-rose-500/8',     wallColor: '#1a0c14', x: 52, y:  6, w: 20, h: 22 },
  { id: 'phone-booth',  label: 'Phone Booths', color: 'border-sky-500/40 bg-sky-500/8',       wallColor: '#0c1620', x: 28, y: 32, w: 20, h: 18 },
  { id: 'war-room',     label: 'War Room',     color: 'border-orange-500/40 bg-orange-500/8', wallColor: '#1a1208', x: 52, y: 32, w: 20, h: 18 },
  { id: 'workshop',     label: 'Workshop',     color: 'border-teal-500/40 bg-teal-500/8',     wallColor: '#0c1a18', x: 28, y: 54, w: 44, h: 24 },
  { id: 'waiting-bench',label: 'Waiting Bench',color: 'border-yellow-500/40 bg-yellow-500/6', wallColor: '#1a1808', x: 28, y: 82, w: 44, h: 12 },
]
```

- [ ] **Step 2: Update `HALLWAYS` to match the new geometry**

Replace the existing `HALLWAYS` constant with:

```ts
export const HALLWAYS = [
  // Vertical lane between home rooms and corridor zones (left)
  { x1: 24, y1:  4, x2: 28, y2: 96 },
  // Vertical lane on the right
  { x1: 72, y1:  4, x2: 76, y2: 96 },
  // Horizontal lane through the middle of the activity grid
  { x1: 24, y1: 50, x2: 76, y2: 52 },
]
```

- [ ] **Step 3: Update `assignSeats` for waiting-bench (long thin room)**

`assignSeats` already handles arbitrary aspect ratios; no changes needed unless layout looks wrong at runtime. Skip.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS (other parts of the file may warn about unused old room ids; we'll fix below).

- [ ] **Step 5: Update `classifyAgent` callers — placeholder (rewritten in Task 2.4)**

Find the existing `classifyAgent` function and update it temporarily to return `'home-main'` for all agents so the file compiles:

```ts
function classifyAgent(_agent: Agent): RoomId {
  return 'home-main'
}
```

- [ ] **Step 6: Update `buildOfficeLayout` to handle the new room-id set**

Find the place that hardcodes `'gsd-office'` filter and `'main-office'`/`'conference'` ids. Replace with:

```ts
// inside buildOfficeLayout
const isHomeRoom = (id: RoomId): boolean =>
  id === 'home-main' || id === 'home-gsd' || id === 'home-session'

// hide GSD now means hide the GSD home room
if (hideGsd && roomId === 'home-gsd') continue

// inject virtual nanobot agents into home-main (was main-office)
const roomId: RoomId = isBusy ? 'workshop' : 'home-main'
```

(Search for the existing `gsd-office` / `main-office` / `conference` references in `office-layout.ts` and rename to the new ids: `gsd-office → home-gsd`, `main-office → home-main`, `session-pool → home-session`, `conference → war-room`.)

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm vitest run`
Expected: Existing tests pass; no new failures.

Run: `pnpm dev`. Visit `/office`. Verify rooms render in the new layout. Agents should pile into Main Office (placeholder classifier).

- [ ] **Step 8: Commit**

```bash
git add src/lib/office-layout.ts
git commit -m "feat(office): new RoomId enum and 10-room geometry"
```

## Task 2.2: Define ROOM_DOORS

**Files:**
- Modify: `src/lib/office-layout.ts` (append at bottom of file, before the `export {}` line)

- [ ] **Step 1: Add doors and corridor lane points**

```ts
/* ── Doors and corridor waypoints ─────────────────────────── */

export interface Point { x: number; y: number }

/** Each room's door sits on the wall facing the nearest corridor. */
export const ROOM_DOORS: Record<RoomId, Point> = {
  'home-main':    { x: 24, y: 26 },
  'home-session': { x: 24, y: 74 },
  'home-gsd':     { x: 76, y: 26 },
  'break-room':   { x: 76, y: 74 },
  'library':      { x: 38, y: 28 },
  'lab':          { x: 62, y: 28 },
  'phone-booth':  { x: 38, y: 50 },
  'war-room':     { x: 62, y: 50 },
  'workshop':     { x: 50, y: 54 },
  'waiting-bench':{ x: 50, y: 82 },
}

/** Two main corridor turn points used by pathBetween */
export const CORRIDOR_LEFT: Point = { x: 26, y: 50 }
export const CORRIDOR_RIGHT: Point = { x: 74, y: 50 }
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/office-layout.ts
git commit -m "feat(office): ROOM_DOORS and corridor waypoints"
```

## Task 2.3: Implement and test pathBetween

**Files:**
- Create: `src/lib/office-paths.ts`
- Create: `src/lib/__tests__/office-paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/office-paths.test.ts
import { describe, it, expect } from 'vitest'
import { pathBetween } from '../office-paths'
import { ROOM_DOORS } from '../office-layout'

describe('pathBetween', () => {
  it('returns a single segment when staying in the same room', () => {
    const path = pathBetween(
      { x: 10, y: 20 }, 'home-main',
      { x: 15, y: 22 }, 'home-main',
    )
    expect(path).toHaveLength(2)
    expect(path[0]).toEqual({ x: 10, y: 20 })
    expect(path[1]).toEqual({ x: 15, y: 22 })
  })

  it('routes home-main → library through the left corridor turn', () => {
    const path = pathBetween(
      { x: 10, y: 20 }, 'home-main',
      { x: 38, y: 18 }, 'library',
    )
    expect(path[0]).toEqual({ x: 10, y: 20 })
    expect(path[1]).toEqual(ROOM_DOORS['home-main'])
    expect(path[path.length - 2]).toEqual(ROOM_DOORS['library'])
    expect(path[path.length - 1]).toEqual({ x: 38, y: 18 })
  })

  it('routes home-gsd → workshop through both corridors', () => {
    const path = pathBetween(
      { x: 90, y: 30 }, 'home-gsd',
      { x: 50, y: 65 }, 'workshop',
    )
    expect(path[0]).toEqual({ x: 90, y: 30 })
    expect(path[1]).toEqual(ROOM_DOORS['home-gsd'])
    expect(path[path.length - 2]).toEqual(ROOM_DOORS['workshop'])
    expect(path[path.length - 1]).toEqual({ x: 50, y: 65 })
    expect(path.length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/office-paths.test.ts`
Expected: FAIL — `pathBetween` not exported.

- [ ] **Step 3: Implement pathBetween**

```ts
// src/lib/office-paths.ts
import {
  ROOM_DOORS,
  CORRIDOR_LEFT,
  CORRIDOR_RIGHT,
  type Point,
  type RoomId,
} from './office-layout'

const LEFT_ROOMS: ReadonlySet<RoomId> = new Set([
  'home-main', 'home-session', 'library', 'phone-booth',
])
const RIGHT_ROOMS: ReadonlySet<RoomId> = new Set([
  'home-gsd', 'break-room', 'lab', 'war-room',
])

function corridorTurnFor(room: RoomId): Point | null {
  if (LEFT_ROOMS.has(room)) return CORRIDOR_LEFT
  if (RIGHT_ROOMS.has(room)) return CORRIDOR_RIGHT
  return null  // workshop / waiting-bench sit on the corridor itself
}

/**
 * Returns waypoints for an agent to walk from `from` to `to`.
 * Always begins with `from` and ends with `to`.
 *
 * Same-room moves: 2 points (straight line).
 * Cross-room moves: from → fromDoor → [corridor turns] → toDoor → to.
 */
export function pathBetween(
  from: Point, fromRoom: RoomId,
  to: Point, toRoom: RoomId,
): Point[] {
  if (fromRoom === toRoom) return [from, to]

  const path: Point[] = [from, ROOM_DOORS[fromRoom]]

  const fromTurn = corridorTurnFor(fromRoom)
  const toTurn = corridorTurnFor(toRoom)

  if (fromTurn) path.push(fromTurn)
  if (toTurn && toTurn !== fromTurn) path.push(toTurn)

  path.push(ROOM_DOORS[toRoom], to)
  return path
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/__tests__/office-paths.test.ts`
Expected: All tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/office-paths.ts src/lib/__tests__/office-paths.test.ts
git commit -m "feat(office): pathBetween waypoint routing"
```

## Task 2.4: Activity → room classification

**Files:**
- Modify: `src/lib/office-layout.ts`

- [ ] **Step 1: Replace `classifyAgent` with `classifyAgentByActivity`**

Replace the placeholder `classifyAgent` from Task 2.1 with:

```ts
import type { ActivityKind, ActivityState } from './agent-activity'

/** Agent's *home* room (where they live when not doing anything). */
export function homeRoomFor(agent: Agent): RoomId {
  if (isGsdAgent(agent)) return 'home-gsd'
  if (isLocalSession(agent)) return 'home-session'
  return 'home-main'
}

const ACTIVITY_TO_ROOM: Record<ActivityKind, RoomId | null> = {
  'reading':    'library',
  'searching':  'library',
  'typing':     'workshop',
  'bash':       'lab',
  'on-call':    'phone-booth',
  'in-meeting': 'war-room',
  'blocked':    'waiting-bench',
  'idle':       'break-room',
  'thinking':   null, // stays at home desk
  'error':      null, // stays at home desk with red flash
}

/**
 * Returns the room the agent should currently be standing in,
 * given their activity state. Falls back to home room if the
 * activity has no zone.
 */
export function classifyAgentByActivity(
  agent: Agent,
  state: ActivityState | undefined,
): RoomId {
  if (!state) return homeRoomFor(agent)
  const zone = ACTIVITY_TO_ROOM[state.kind]
  return zone ?? homeRoomFor(agent)
}
```

- [ ] **Step 2: Update `buildOfficeLayout` signature to accept activities**

Find the `buildOfficeLayout` function. Update its signature and body to use the new classifier:

```ts
export function buildOfficeLayout(
  agents: Agent[],
  hideGsd = false,
  nanobotStatus?: Map<string, NanobotAgentStatus>,
  activities?: Record<string, ActivityState>,
): OfficeLayout {
  const buckets = new Map<RoomId, Agent[]>()
  for (const room of ROOM_DEFS) buckets.set(room.id, [])

  let gsdCount = 0
  const seenNanobotNames = new Set<string>()

  for (const rawAgent of agents) {
    let agent = rawAgent
    if (isNamedNanobotAgent(agent)) {
      seenNanobotNames.add((agent.name || '').trim().toLowerCase())
      const nbStatus = nanobotStatus?.get(agent.name.toLowerCase())
      if (nbStatus && nbStatus.status === 'busy' && agent.status !== 'busy') {
        agent = { ...agent, status: 'busy', last_activity: nbStatus.activeSession || agent.last_activity }
      }
    }

    const state = activities?.[agent.name]
    const roomId = classifyAgentByActivity(agent, state)
    if (homeRoomFor(agent) === 'home-gsd') gsdCount++
    if (hideGsd && homeRoomFor(agent) === 'home-gsd') continue
    buckets.get(roomId)!.push(agent)
  }

  // virtual named nanobots — same as before, but use new room ids
  const nowSec = Math.floor(Date.now() / 1000)
  for (const def of NANOBOT_AGENT_DEFS) {
    if (!seenNanobotNames.has(def.name.toLowerCase())) {
      const nbStatus = nanobotStatus?.get(def.name.toLowerCase())
      const isBusy = nbStatus?.status === 'busy'
      const virtual: Agent = {
        id: -9000 - seenNanobotNames.size,
        name: def.name,
        role: def.role,
        status: isBusy ? 'busy' : 'idle',
        last_seen: nbStatus?.lastActivity || nowSec,
        last_activity: isBusy ? (nbStatus?.activeSession || 'Working') : 'At desk',
        created_at: nowSec,
        updated_at: nowSec,
        config: {},
      }
      const state = activities?.[virtual.name]
      const roomId = classifyAgentByActivity(virtual, state)
      buckets.get(roomId)!.push(virtual)
    }
  }

  for (const [, list] of buckets) {
    list.sort((a, b) => {
      if (a.status === 'busy' && b.status !== 'busy') return -1
      if (a.status !== 'busy' && b.status === 'busy') return 1
      return a.name.localeCompare(b.name)
    })
  }

  const seated: SeatedAgent[] = []
  const activeCount = agents.filter(a => a.status === 'busy').length

  for (const room of ROOM_DEFS) {
    const roomAgents = buckets.get(room.id) || []
    seated.push(...assignSeats(roomAgents, room))
  }

  return { rooms: ROOM_DEFS, seated, gsdCount, activeCount }
}
```

- [ ] **Step 3: Update the panel call site**

In `src/components/panels/office-panel.tsx`, find:

```tsx
const layout = useMemo(() => buildOfficeLayout(visibleAgents, hideGsd, nanobotStatus), [visibleAgents, hideGsd, nanobotStatus])
```

Replace with:

```tsx
const layout = useMemo(
  () => buildOfficeLayout(visibleAgents, hideGsd, nanobotStatus, officeActivities),
  [visibleAgents, hideGsd, nanobotStatus, officeActivities]
)
```

Also remove the temporary `void officeActivities` line from Task 1.7.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: PASS

Run: `pnpm dev`. Visit `/office`. With activities returning data, agents should now distribute across rooms by activity. With no activity data they pile into home rooms.

- [ ] **Step 5: Commit**

```bash
git add src/lib/office-layout.ts src/components/panels/office-panel.tsx
git commit -m "feat(office): classify agents by activity into zones"
```

## Task 2.5: Extract WalkingCrewmate into its own component

**Files:**
- Create: `src/components/panels/office/walking-crewmate.tsx`
- Modify: `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/panels/office/walking-crewmate.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { Point, RoomId } from '@/lib/office-layout'
import { pathBetween } from '@/lib/office-paths'

interface WalkingCrewmateProps {
  /** Stable id for keying transitions */
  agentId: string | number
  /** Current resolved seat in absolute % (within map). */
  targetSeat: Point
  /** Current target room id, used to choose corridor lanes. */
  targetRoom: RoomId
  /** Last-known room — first render uses targetRoom. */
  lastRoom?: RoomId
  /** Render the crewmate body. */
  children: React.ReactNode
  /** Total trip duration in ms (defaults 1200ms per leg). */
  legDurationMs?: number
}

/**
 * Animates absolute % position by walking through pathBetween waypoints.
 * Each leg is a CSS transition; we advance through legs with setTimeout.
 */
export function WalkingCrewmate({
  agentId,
  targetSeat,
  targetRoom,
  lastRoom,
  children,
  legDurationMs = 1200,
}: WalkingCrewmateProps) {
  const [pos, setPos] = useState<Point>(targetSeat)
  const lastSeatRef = useRef<Point>(targetSeat)
  const lastRoomRef = useRef<RoomId>(lastRoom ?? targetRoom)
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    const from = lastSeatRef.current
    const fromRoom = lastRoomRef.current
    if (from.x === targetSeat.x && from.y === targetSeat.y && fromRoom === targetRoom) return

    const path = pathBetween(from, fromRoom, targetSeat, targetRoom)
    let cancelled = false
    setWalking(true)

    const advance = (i: number) => {
      if (cancelled || i >= path.length) {
        setWalking(false)
        return
      }
      setPos(path[i])
      window.setTimeout(() => advance(i + 1), legDurationMs)
    }
    advance(1)  // start at index 1 — index 0 is the current position

    lastSeatRef.current = targetSeat
    lastRoomRef.current = targetRoom

    return () => { cancelled = true }
  }, [agentId, targetSeat.x, targetSeat.y, targetRoom, legDurationMs])

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${walking ? 'walking' : ''}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transition: `left ${legDurationMs}ms ease-in-out, top ${legDurationMs}ms ease-in-out`,
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the panel**

In `src/components/panels/office-panel.tsx`, find the `OfficeRoom` component and the inline rendering of `<DriftingCrewmate />`. Replace the wrapper with `<WalkingCrewmate />` keyed on `seated.roomId`. Use the seat's absolute coordinates (not relative to the room).

```tsx
// at top of file
import { WalkingCrewmate } from './office/walking-crewmate'

// inside OfficeRoom component, replace the agents.map block:
{agents.map(seated => (
  <WalkingCrewmate
    key={seated.agent.id}
    agentId={seated.agent.id}
    targetSeat={{ x: seated.seat.x, y: seated.seat.y }}
    targetRoom={seated.roomId}
  >
    <DriftingCrewmate
      seated={seated}
      crewSize={crewSize}
      nameSize={nameSize}
      onAgentClick={onAgentClick}
    />
  </WalkingCrewmate>
))}
```

Note: `WalkingCrewmate` positions absolutely *within the map viewport*, not within `OfficeRoom`. To keep this change minimal, we render `WalkingCrewmate` outside `OfficeRoom` instead — at the map level. Move the loop:

In the map viewport, after `{ROOM_DEFS.map(room => <OfficeRoom ... />)}`, add:

```tsx
{layout.seated.map(seated => {
  const crewSize = clamp(Math.round(38 / mapZoom), 20, 56)
  const nameSize = Math.max(8, Math.round(10 / mapZoom))
  return (
    <WalkingCrewmate
      key={`walk-${seated.agent.id}`}
      agentId={seated.agent.id}
      targetSeat={{ x: seated.seat.x, y: seated.seat.y }}
      targetRoom={seated.roomId}
    >
      <DriftingCrewmate
        seated={seated}
        crewSize={crewSize}
        nameSize={nameSize}
        onAgentClick={setSelectedAgent}
      />
    </WalkingCrewmate>
  )
})}
```

The `clamp` helper is already defined at the top of `office-panel.tsx`. Remove the agents.map block from inside `OfficeRoom`.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Run: `pnpm dev`. Visit `/office`. Agents render at top-level coords. When activities change, they should slide between rooms via the corridor.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/office/walking-crewmate.tsx src/components/panels/office-panel.tsx
git commit -m "feat(office): WalkingCrewmate with pathed motion between rooms"
```

---

# PHASE 3 — Animations & speech bubbles

After Phase 3, agents have per-kind glyphs, in-place motion, and deadpan speech bubbles. The `?demo=1` mode lets designers screenshot every state.

## Task 3.1: Activity glyphs

**Files:**
- Create: `src/components/panels/office/activity-glyph.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/panels/office/activity-glyph.tsx
import type { ActivityKind } from '@/lib/agent-activity'

interface ActivityGlyphProps {
  kind: ActivityKind
  size?: number
}

const GLYPH: Record<ActivityKind, string> = {
  typing:      '⌨️',
  reading:     '📖',
  searching:   '🔍',
  bash:        '>_',
  'on-call':   '☎️',
  'in-meeting':'👥',
  thinking:    '💭',
  blocked:     '⏳',
  idle:        '☕',
  error:       '💢',
}

export function ActivityGlyph({ kind, size = 14 }: ActivityGlyphProps) {
  const isText = kind === 'bash'
  return (
    <div
      className="absolute -translate-x-1/2 pointer-events-none select-none font-mono"
      style={{
        left: '50%',
        top: `-${size + 6}px`,
        fontSize: `${size}px`,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {isText
        ? <span className="text-emerald-400 bg-black/60 px-1 rounded text-[10px]">{GLYPH[kind]}</span>
        : <span>{GLYPH[kind]}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Render glyph in DriftingCrewmate**

In `src/components/panels/office-panel.tsx`, modify `DriftingCrewmate` to take an optional `activityKind` prop and render the glyph above the name tag.

Find `function DriftingCrewmate(...)` and update its props and JSX:

```tsx
import { ActivityGlyph } from './office/activity-glyph'

function DriftingCrewmate({ seated, crewSize, nameSize, onAgentClick, activityKind }: {
  seated: SeatedAgent
  crewSize: number
  nameSize: number
  onAgentClick: (agent: Agent) => void
  activityKind?: ActivityKind
}) {
  // ...existing body...

  return (
    <button /* existing props */>
      {activityKind ? <ActivityGlyph kind={activityKind} size={Math.round(crewSize * 0.45)} /> : null}
      <Crewmate /* existing */ />
      {/* existing name tag */}
    </button>
  )
}
```

Then, where `WalkingCrewmate` wraps `DriftingCrewmate` (added in Task 2.5), pass `activityKind={officeActivities[seated.agent.name]?.kind}`.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Run: `pnpm dev`. Verify glyphs appear above busy agents.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/office/activity-glyph.tsx src/components/panels/office-panel.tsx
git commit -m "feat(office): per-activity glyphs above crewmate"
```

## Task 3.2: Per-kind in-place motion

**Files:**
- Modify: `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Add a CSS keyframe block to the panel**

At the very top of the rendered JSX in `OfficePanel`, just inside the outermost `<div>`, add:

```tsx
<style jsx>{`
  @keyframes typing-jitter { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
  @keyframes reading-bob   { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
  @keyframes blocked-halo  { 0%, 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.5); } 50% { box-shadow: 0 0 12px 4px rgba(250, 204, 21, 0.5); } }
  @keyframes error-flash   { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(330deg) brightness(1.4); } }
  .activity-typing  > svg { animation: typing-jitter 0.25s ease-in-out infinite; }
  .activity-reading > svg { animation: reading-bob 1.6s ease-in-out infinite; }
  .activity-blocked       { animation: blocked-halo 2.4s ease-in-out infinite; border-radius: 50%; }
  .activity-error  > svg  { animation: error-flash 0.8s ease-in-out infinite; }
`}</style>
```

- [ ] **Step 2: Apply class to DriftingCrewmate based on activity**

Inside `DriftingCrewmate`, add `className` to the wrapping `<button>`:

```tsx
<button
  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${activityKind ? `activity-${activityKind}` : ''}`}
  /* ... */
>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm dev`. Inject some test data: open `/office`, then in DevTools console run `fetch('/api/mcp_calls', {method:'POST'...})` — or skip live verification, defer to demo mode in Task 3.5.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/office-panel.tsx
git commit -m "feat(office): per-activity in-place motion classes"
```

## Task 3.3: Deadpan content library

**Files:**
- Create: `src/lib/office-deadpan.ts`
- Create: `src/lib/__tests__/office-deadpan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/office-deadpan.test.ts
import { describe, it, expect, vi } from 'vitest'
import { pickDeadpanLine, DEADPAN_LINES } from '../office-deadpan'

describe('pickDeadpanLine', () => {
  it('returns a string for every kind', () => {
    for (const kind of Object.keys(DEADPAN_LINES) as Array<keyof typeof DEADPAN_LINES>) {
      const line = pickDeadpanLine(kind, undefined, null)
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('substitutes {subject} when present', () => {
    // Force deterministic selection by stubbing Math.random to 0
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const line = pickDeadpanLine('typing', 'foo.ts', null)
    expect(line).toContain('foo.ts')
    vi.restoreAllMocks()
  })

  it('skips lines that contain {subject} when subject is missing', () => {
    // Pick a kind whose first template references {subject}
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const line = pickDeadpanLine('typing', undefined, null)
    expect(line).not.toContain('{subject}')
    vi.restoreAllMocks()
  })

  it('avoids returning the same line twice in a row when alternatives exist', () => {
    const first = pickDeadpanLine('idle', undefined, null)
    for (let i = 0; i < 20; i++) {
      const next = pickDeadpanLine('idle', undefined, first)
      if (DEADPAN_LINES.idle.length > 1) expect(next).not.toBe(first)
    }
  })

  it('truncates long subject substitutions to 40 chars', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const long = 'x'.repeat(100)
    const line = pickDeadpanLine('typing', long, null)
    // Expect no more than ~50 chars of subject substring (40 + literal text)
    expect(line.length).toBeLessThanOrEqual(80)
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/office-deadpan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/office-deadpan.ts
import type { ActivityKind } from './agent-activity'

export const DEADPAN_LINES: Record<ActivityKind, string[]> = {
  typing:    ['Editing {subject}.', 'Writing things.', "It compiles. That's something.", 'Adding a TODO.', 'Probably a bug.'],
  reading:   ['Reading {subject}.', 'This file again.', 'Skimming. Convincingly.', 'Pretending {subject} makes sense.'],
  searching: ['Looking for {subject}.', 'Grep harder.', 'It must be somewhere.'],
  bash:      ['$ {subject}', 'Hoping for green.', 'There is no rollback plan.', 'Will it work this time?'],
  'on-call': ['Talking to {subject}.', '{subject} has a question.', 'Mostly listening.'],
  'in-meeting': ['Meeting.', 'Aligning on alignment.', 'We could just code this.'],
  thinking:  ['Thinking.', 'There are several wrong answers.', '...', 'Considering options.'],
  blocked:   ['Awaiting review.', 'Sent a polite ping.', 'Stuck.'],
  idle:      ['Coffee.', 'Not currently helpful.', 'Existential break.'],
  error:     ['Apologies.', 'As foretold.', 'I have failed.'],
}

const MAX_SUBJECT_LEN = 40

/**
 * Picks a random line for the activity kind.
 * - Templates containing {subject} are excluded if `subject` is undefined.
 * - Subject is truncated to 40 chars before substitution.
 * - If the same line was just used (`lastLine`), retries up to a few times.
 */
export function pickDeadpanLine(
  kind: ActivityKind,
  subject: string | undefined,
  lastLine: string | null,
): string {
  const all = DEADPAN_LINES[kind] || []
  const eligible = subject
    ? all
    : all.filter(t => !t.includes('{subject}'))
  const pool = eligible.length > 0 ? eligible : all

  if (pool.length === 0) return ''

  let template: string = pool[0]
  for (let attempt = 0; attempt < 4; attempt++) {
    template = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length < 2) break
    const trimmed = subject ? template.replace('{subject}', '<S>') : template
    if (trimmed !== lastLine) break
  }

  const safeSubject = subject ? subject.slice(0, MAX_SUBJECT_LEN) : ''
  return template.replace('{subject}', safeSubject)
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/__tests__/office-deadpan.test.ts`
Expected: All tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/office-deadpan.ts src/lib/__tests__/office-deadpan.test.ts
git commit -m "feat(office): deadpan content library and pickDeadpanLine"
```

## Task 3.4: SpeechBubble component

**Files:**
- Create: `src/components/panels/office/speech-bubble.tsx`
- Modify: `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/panels/office/speech-bubble.tsx
'use client'

import { useEffect } from 'react'

interface SpeechBubbleProps {
  text: string
  /** ms before fading out */
  durationMs?: number
  onDismiss: () => void
}

export function SpeechBubble({ text, durationMs = 6000, onDismiss }: SpeechBubbleProps) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(id)
  }, [durationMs, onDismiss])

  return (
    <div
      className="absolute -translate-x-1/2 pointer-events-none whitespace-nowrap"
      style={{
        left: '50%',
        bottom: '120%',
        animation: 'bubble-fade 6s ease-in-out forwards',
      }}
    >
      <div className="font-mono text-[10px] sm:text-[11px] bg-card/95 text-foreground border border-border rounded-md px-2 py-1 shadow-lg">
        {text}
      </div>
      <style jsx>{`
        @keyframes bubble-fade {
          0%   { opacity: 0; transform: translate(-50%, 6px); }
          5%   { opacity: 1; transform: translate(-50%, 0); }
          90%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -4px); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Add bubble scheduler in OfficePanel**

In `src/components/panels/office-panel.tsx`, near the other state:

```tsx
import { SpeechBubble } from './office/speech-bubble'
import { pickDeadpanLine } from '@/lib/office-deadpan'

interface ActiveBubble {
  agentName: string
  text: string
  id: number
}

const [bubbles, setBubbles] = useState<ActiveBubble[]>([])
const lastBubbleByAgent = useRef<Record<string, string>>({})
const lastKindByAgent = useRef<Record<string, ActivityKind>>({})
const bubbleIdRef = useRef(0)
const MAX_BUBBLES = 3

const showBubble = useCallback((agentName: string, kind: ActivityKind, subject?: string) => {
  const text = pickDeadpanLine(kind, subject, lastBubbleByAgent.current[agentName] ?? null)
  if (!text) return
  lastBubbleByAgent.current[agentName] = text
  bubbleIdRef.current += 1
  const id = bubbleIdRef.current
  setBubbles(curr => {
    const next = [...curr, { agentName, text, id }]
    while (next.length > MAX_BUBBLES) next.shift()
    return next
  })
}, [])

// Trigger on activity change + scheduled cadence
useEffect(() => {
  const newKinds: Record<string, ActivityKind> = {}
  for (const [name, state] of Object.entries(officeActivities)) {
    newKinds[name] = state.kind
    if (lastKindByAgent.current[name] !== state.kind) {
      showBubble(name, state.kind, state.subject)
    }
  }
  lastKindByAgent.current = newKinds
}, [officeActivities, showBubble])

useEffect(() => {
  const id = window.setInterval(() => {
    const names = Object.keys(officeActivities)
    if (names.length === 0) return
    const pick = names[Math.floor(Math.random() * names.length)]
    const state = officeActivities[pick]
    if (!state) return
    showBubble(pick, state.kind, state.subject)
  }, 35_000 + Math.floor(Math.random() * 20_000))
  return () => window.clearInterval(id)
}, [officeActivities, showBubble])

const dismissBubble = useCallback((id: number) => {
  setBubbles(curr => curr.filter(b => b.id !== id))
}, [])
```

- [ ] **Step 3: Render bubbles next to crewmates**

Inside the map viewport, after the `WalkingCrewmate` loop, add:

```tsx
{bubbles.map(b => {
  const seated = layout.seated.find(s => s.agent.name === b.agentName)
  if (!seated) return null
  return (
    <div
      key={`bubble-${b.id}`}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
      style={{ left: `${seated.seat.x}%`, top: `${seated.seat.y}%` }}
    >
      <SpeechBubble text={b.text} onDismiss={() => dismissBubble(b.id)} />
    </div>
  )
})}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Run: `pnpm dev`. Visit `/office`. With activities flowing, bubbles should appear on activity changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office/speech-bubble.tsx src/components/panels/office-panel.tsx
git commit -m "feat(office): deadpan speech bubbles on activity change + cadence"
```

## Task 3.5: Demo mode and Playwright extension

**Files:**
- Modify: `src/components/panels/office-panel.tsx`
- Create or modify: `tests/office.spec.ts`

- [ ] **Step 1: Add `?demo=1` activity injector**

In `OfficePanel`, near the top of the component body:

```tsx
import { useSearchParams } from 'next/navigation'
const searchParams = useSearchParams()
const demoMode = searchParams?.get('demo') === '1'

// Below the existing fetchActivities effect, add a demo override
useEffect(() => {
  if (!demoMode) return
  const KINDS: ActivityKind[] = [
    'typing', 'reading', 'searching', 'bash', 'on-call',
    'in-meeting', 'thinking', 'blocked', 'idle', 'error',
  ]
  const id = window.setInterval(() => {
    const map: Record<string, ActivityState> = {}
    visibleAgents.forEach((a, i) => {
      const kind = KINDS[(i + Math.floor(Date.now() / 5000)) % KINDS.length]
      map[a.name] = {
        kind,
        subject: kind === 'typing' ? 'src/foo/bar.ts'
               : kind === 'bash'   ? 'pnpm test --watch'
               : kind === 'reading'? 'README.md'
               : kind === 'on-call'? 'Cody'
               : undefined,
        since: Date.now(),
      }
    })
    setOfficeActivities(map)
  }, 1500)
  return () => window.clearInterval(id)
}, [demoMode, visibleAgents, setOfficeActivities])
```

Important: when `demoMode` is on, skip the real fetch:

```tsx
useEffect(() => { if (!demoMode) fetchActivities() }, [demoMode, fetchActivities])

useEffect(() => {
  if (demoMode) return
  const id = setInterval(fetchActivities, 5_000)
  return () => clearInterval(id)
}, [demoMode, fetchActivities])
```

- [ ] **Step 2: Verify demo mode**

Run: `pnpm dev`. Visit `/office?demo=1`. Agents should rotate through every kind, glyphs and bubbles should fire.

- [ ] **Step 3: Add Playwright assertions**

Check whether `tests/office.spec.ts` exists. If not, create it:

```ts
// tests/office.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Office panel', () => {
  test('renders rooms and processes /api/agents/activity', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

    let activityCalls = 0
    page.on('request', req => { if (req.url().includes('/api/agents/activity')) activityCalls++ })

    await page.goto('/office')
    // wait for at least one room label to render
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 5000 })

    // wait long enough for one polling cycle
    await page.waitForTimeout(6000)

    expect(activityCalls).toBeGreaterThanOrEqual(1)
    expect(consoleErrors.filter(e => !e.includes('Hydration'))).toHaveLength(0)
  })

  test('demo mode populates all activity kinds', async ({ page }) => {
    await page.goto('/office?demo=1')
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 5000 })
    // give demo cycle a chance to run
    await page.waitForTimeout(3000)
    // bubbles or glyphs should appear; assert at least one has rendered
    const glyphs = await page.locator('button.activity-typing, button.activity-reading, button.activity-bash').count()
    expect(glyphs).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 4: Run Playwright**

Run: `pnpm test:e2e tests/office.spec.ts`
Expected: PASS (auth setup may need to mirror existing E2E test setup — refer to `tests/README.md` if auth fails).

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office-panel.tsx tests/office.spec.ts
git commit -m "feat(office): ?demo=1 mode and Playwright coverage"
```

---

# PHASE 4 — TV Dashboard

After Phase 4, `/office/tv?token=XXX` renders a kiosk-styled, always-on view of the office. Setting `MC_OFFICE_TV_TOKEN=` (empty) or unsetting it disables the route (returns 404).

## Task 4.1: Implement and test kiosk-auth

**Files:**
- Create: `src/lib/kiosk-auth.ts`
- Create: `src/lib/__tests__/kiosk-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/kiosk-auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateKioskToken, isKioskEnabled } from '../kiosk-auth'

describe('kiosk-auth', () => {
  const ORIG = process.env.MC_OFFICE_TV_TOKEN
  beforeEach(() => { delete process.env.MC_OFFICE_TV_TOKEN })
  afterEach(() => { if (ORIG !== undefined) process.env.MC_OFFICE_TV_TOKEN = ORIG; else delete process.env.MC_OFFICE_TV_TOKEN })

  it('isKioskEnabled returns false when env unset', () => {
    expect(isKioskEnabled()).toBe(false)
  })

  it('isKioskEnabled returns false when env empty', () => {
    process.env.MC_OFFICE_TV_TOKEN = ''
    expect(isKioskEnabled()).toBe(false)
  })

  it('isKioskEnabled returns true when env set', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret'
    expect(isKioskEnabled()).toBe(true)
  })

  it('validateKioskToken returns false when env unset', () => {
    expect(validateKioskToken('anything')).toBe(false)
  })

  it('validateKioskToken returns true on exact match', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('secret-token')).toBe(true)
  })

  it('validateKioskToken returns false on length mismatch', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('secret')).toBe(false)
  })

  it('validateKioskToken returns false on content mismatch', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('wrong-12345!')).toBe(false)
  })

  it('validateKioskToken returns false for null/undefined', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken(null)).toBe(false)
    expect(validateKioskToken(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/kiosk-auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/kiosk-auth.ts
import crypto from 'node:crypto'

export function isKioskEnabled(): boolean {
  return Boolean(process.env.MC_OFFICE_TV_TOKEN && process.env.MC_OFFICE_TV_TOKEN.length > 0)
}

export function validateKioskToken(provided: string | null | undefined): boolean {
  if (!isKioskEnabled()) return false
  if (typeof provided !== 'string') return false
  const expected = process.env.MC_OFFICE_TV_TOKEN!
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // constant-time false
    crypto.timingSafeEqual(Buffer.alloc(b.length), b)
    return false
  }
  return crypto.timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/__tests__/kiosk-auth.test.ts`
Expected: All tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kiosk-auth.ts src/lib/__tests__/kiosk-auth.test.ts
git commit -m "feat(office): kiosk-auth helpers with constant-time compare"
```

## Task 4.2: Bypass session auth for /office/tv in proxy

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add kiosk bypass logic**

Find the comment `// Allow login page, auth API, and docs without session` (around line 175) and the `if` block immediately following. Add the kiosk bypass *before* the existing public-route check so it short-circuits cleanly:

```ts
  // Kiosk: allow /office/tv and /api/agents/activity with valid ?token= to bypass session auth.
  // Token is read from MC_OFFICE_TV_TOKEN. Compared with constant-time equality.
  const KIOSK_TOKEN = process.env.MC_OFFICE_TV_TOKEN
  if (KIOSK_TOKEN && KIOSK_TOKEN.length > 0) {
    const isKioskPath = pathname === '/office/tv' || pathname === '/api/agents/activity'
    if (isKioskPath) {
      const provided = request.nextUrl.searchParams.get('token') || ''
      if (provided.length === KIOSK_TOKEN.length && safeCompare(provided, KIOSK_TOKEN)) {
        return NextResponse.next()
      }
    }
  } else if (pathname === '/office/tv') {
    // Kiosk feature disabled — return 404 instead of redirecting to login.
    return new NextResponse('Not Found', { status: 404 })
  }
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Manual test:
1. `unset MC_OFFICE_TV_TOKEN && pnpm dev` → visit `http://localhost:3000/office/tv` → 404.
2. `MC_OFFICE_TV_TOKEN=hunter2 pnpm dev` → visit `/office/tv` (no token) → redirected to `/login`. Visit `/office/tv?token=wrong` → redirected to `/login`. Visit `/office/tv?token=hunter2` → loads the route (route doesn't exist yet — will 404, but auth has passed).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(office): kiosk bypass in proxy for /office/tv"
```

## Task 4.3: Add kiosk prop to OfficePanel

**Files:**
- Modify: `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Accept the prop and pass it down**

Update the panel component signature:

```tsx
export function OfficePanel({ kiosk = false }: { kiosk?: boolean } = {}) {
  // ...rest of the component
}
```

- [ ] **Step 2: Hide chrome and disable interactions in kiosk mode**

Inside the component, gate UI bits:

```tsx
// Hide sidebar in kiosk mode
{!kiosk && (
  <div className="void-panel text-foreground p-3 h-fit ...">
    {/* existing sidebar JSX */}
  </div>
)}

// Hide header refresh/hide-GSD bar
{!kiosk && (
  <div className="border-b border-border pb-3 sm:pb-4">
    {/* existing header JSX */}
  </div>
)}

// Disable click-to-detail
const handleAgentClick = (agent: Agent) => {
  if (kiosk) return
  setSelectedAgent(agent)
}
// And replace `onAgentClick={setSelectedAgent}` with `onAgentClick={handleAgentClick}`.
```

When `kiosk` is true, also skip rendering the modal:

```tsx
{!kiosk && selectedAgent && (
  <div className="fixed inset-0 ..."> {/* existing modal */} </div>
)}
```

- [ ] **Step 3: Apply kiosk visual scale**

In the map viewport `<div>`, add a kiosk class:

```tsx
className={`relative rounded-lg border ${kiosk ? 'kiosk-bleed' : 'border-border'} overflow-hidden ...`}
```

Add CSS in the same `<style jsx>` block:

```css
.kiosk-bleed {
  border: none;
  border-radius: 0;
  background-color: #06080d;
}
```

- [ ] **Step 4: Disable polling-pause on hidden tab when kiosk**

The current panel doesn't actually pause on hidden — but if a future change adds it, we want to skip in kiosk. Add a comment marker for now:

```tsx
// kiosk mode: poll regardless of document.visibilityState.
```

- [ ] **Step 5: Pass token through to /api/agents/activity in kiosk mode**

When kiosk, append the `?token=` from the page URL to the activity fetch:

```tsx
const fetchActivities = useCallback(async () => {
  try {
    const tokenParam = kiosk ? `?token=${encodeURIComponent(searchParams?.get('token') || '')}` : ''
    const res = await fetch(`/api/agents/activity${tokenParam}`)
    if (!res.ok) return
    /* ...existing parse... */
  } catch { /* ignore */ }
}, [setOfficeActivities, kiosk, searchParams])
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/office-panel.tsx
git commit -m "feat(office): kiosk prop hides chrome and forwards token"
```

## Task 4.4: Add /office/tv route + Playwright

**Files:**
- Create: `src/app/office/tv/page.tsx`
- Create: `tests/office-tv.spec.ts`

- [ ] **Step 1: Create the kiosk page**

```tsx
// src/app/office/tv/page.tsx
import { notFound } from 'next/navigation'
import { isKioskEnabled } from '@/lib/kiosk-auth'
import { OfficePanel } from '@/components/panels/office-panel'

// Kiosk page is rendered on the server, but the panel is a client component.
// Auth is enforced in proxy.ts before this code runs.

export const dynamic = 'force-dynamic'

export default function OfficeTV() {
  if (!isKioskEnabled()) notFound()
  return (
    <main className="min-h-screen bg-[#06080d] text-foreground overflow-hidden">
      <OfficePanel kiosk />
      {/* Periodic full reload as a memory-leak guard for always-on displays */}
      <script
        dangerouslySetInnerHTML={{
          __html: 'setTimeout(() => window.location.reload(), 6 * 60 * 60 * 1000);',
        }}
      />
    </main>
  )
}
```

- [ ] **Step 2: Create the Playwright spec**

```ts
// tests/office-tv.spec.ts
import { test, expect } from '@playwright/test'

const TOKEN = process.env.MC_OFFICE_TV_TOKEN

test.describe('Office TV kiosk route', () => {
  test('returns 404 when token env unset', async ({ page }) => {
    test.skip(!!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be unset')
    const res = await page.goto('/office/tv')
    expect(res?.status()).toBe(404)
  })

  test('redirects to login without token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    await page.goto('/office/tv')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rejects bad token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    await page.goto('/office/tv?token=wrong-token-xxxxxxxxx')
    await expect(page).toHaveURL(/\/login/)
  })

  test('renders kiosk view with valid token', async ({ page }) => {
    test.skip(!TOKEN, 'requires MC_OFFICE_TV_TOKEN to be set')
    const consoleErrors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

    await page.goto(`/office/tv?token=${encodeURIComponent(TOKEN!)}`)
    // No nav rail or header should be visible
    await expect(page.locator('text=ROSTER')).toHaveCount(0)
    // The map should render (a room label visible)
    await expect(page.getByText('Main Office', { exact: false })).toBeVisible({ timeout: 6000 })

    expect(consoleErrors.filter(e => !e.includes('Hydration'))).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run the tests**

Run (without env): `pnpm test:e2e tests/office-tv.spec.ts`
Expected: 404 test passes; others skipped.

Run (with env): `MC_OFFICE_TV_TOKEN=test-token-123 pnpm test:e2e tests/office-tv.spec.ts`
Expected: All 3 token-required tests pass.

- [ ] **Step 4: Manual verification**

Run: `MC_OFFICE_TV_TOKEN=hunter2 pnpm dev`
Visit: `http://localhost:3000/office/tv?token=hunter2`
Expect: full-bleed office view, no NavRail, agents render, polling fires every 5s.

- [ ] **Step 5: Commit**

```bash
git add src/app/office/tv/page.tsx tests/office-tv.spec.ts
git commit -m "feat(office): /office/tv kiosk route with token gate"
```

---

## Task 4.5: Document new env vars in .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append two lines** to `.env.example`:

```
# Office TV Dashboard — set to enable /office/tv kiosk route. Pass as ?token= on the URL.
MC_OFFICE_TV_TOKEN=

# Office activity panel — promote N+ simultaneously busy agents into the War Room (default 3, min 2)
MC_OFFICE_MEETING_THRESHOLD=3
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document MC_OFFICE_TV_TOKEN and MC_OFFICE_MEETING_THRESHOLD"
```

---

## Final verification

- [ ] Run full test suite: `pnpm test && pnpm test:e2e`
- [ ] Run typecheck: `pnpm typecheck`
- [ ] Run lint: `pnpm lint`
- [ ] Manual smoke: visit `/office`, `/office?demo=1`, `/office/tv?token=...` — all render without console errors.
