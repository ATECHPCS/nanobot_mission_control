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
