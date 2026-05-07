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
import { getNanobotStatuses, NANOBOT_AGENTS } from '@/lib/nanobot-status'

interface CachedPayload {
  generated_at: number
  body: { agents: Array<{ id: number; name: string; activity: ActivityState }>; generated_at: number }
}

const CACHE_TTL_MS = 2_000
const cacheByWorkspace = new Map<number, CachedPayload>()

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
  const workspaceId = auth.user.workspace_id ?? 1

  const cached = cacheByWorkspace.get(workspaceId)
  if (cached && now - cached.generated_at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body)
  }

  try {
    const db = getDatabase()
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
        AND workspace_id = ?
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
    // NOTE: spec said "local mode only" but the server has no concept of dashboardMode
    // (that's a client-side store value). Running unconditionally is safe — the data
    // is filesystem-derived and only readable by the same auth'd user. To restrict,
    // gate by an env flag like MC_OFFICE_JSONL_FALLBACK if it ever becomes a concern.
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
      const commsRow = commsStmt.get(recentSince, agent.name, agent.name, workspaceId) as
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
        if (fallback) latestTool = { toolName: fallback.toolName, subject: fallback.subject, createdAt: fallback.createdAt }
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

    // Synthesize states for the named nanobot agents (Andy/Stefany/Cody),
    // which are not backed by DB rows. A DB row with the same name wins if
    // present. Offline nanobots are skipped so they don't render at all.
    let nanobotStatuses: ReturnType<typeof getNanobotStatuses> = []
    try {
      nanobotStatuses = getNanobotStatuses()
      for (const nb of nanobotStatuses) {
        if (states.has(nb.name)) continue
        if (nb.status === 'offline') continue
        const isBusy = nb.status === 'busy'
        states.set(nb.name, {
          kind: isBusy ? 'thinking' : 'idle',
          subject: isBusy ? (nb.activeSession ?? undefined) : undefined,
          since: nb.lastActivity ? nb.lastActivity * 1000 : Date.now(),
        })
      }
    } catch (e) {
      logger.warn({ err: e }, 'getNanobotStatuses failed in activity route')
    }

    const promoted = promoteMeeting(states, getMeetingThreshold())

    const dbAgentNames = new Set(agents.map(a => a.name))
    const nanobotResponseRows = NANOBOT_AGENTS
      .filter(def => states.has(def.name) && !dbAgentNames.has(def.name))
      .map((def, i) => ({
        id: -9000 - i,  // stable synthetic id per nanobot index
        name: def.name,
        activity: promoted.get(def.name)!,
      }))

    const body = {
      agents: [
        ...agents.map(a => ({
          id: a.id,
          name: a.name,
          activity: promoted.get(a.name)!,
        })),
        ...nanobotResponseRows,
      ],
      generated_at: now,
    }

    cacheByWorkspace.set(workspaceId, { generated_at: now, body })
    return NextResponse.json(body)
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/activity failed')
    const lastGood = cacheByWorkspace.get(workspaceId)
    if (lastGood) return NextResponse.json(lastGood.body)
    return NextResponse.json({ agents: [], generated_at: now }, { status: 200 })
  }
}
