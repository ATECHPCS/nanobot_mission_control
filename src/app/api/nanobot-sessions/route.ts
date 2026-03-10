import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { syncNanobotSessions } from '@/lib/nanobot-sessions'
import { sessionListQuerySchema } from '@/lib/validation'
import type { SessionListResponse } from '@/types/nanobot-session'

interface SessionRow {
  agent_id: string
  filename: string
  session_key: string
  channel_type: string
  channel_identifier: string
  message_count: number
  first_message_at: string | null
  last_message_at: string | null
  last_user_message: string | null
  file_size_bytes: number
}

/**
 * GET /api/nanobot-sessions - List nanobot sessions from SQLite cache
 * Supports filtering by agent, channel, date range, and search text.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Parse query params
  const url = new URL(request.url)
  const rawParams: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    rawParams[key] = value
  }

  const parsed = sessionListQuerySchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { agent, channel, search, dateRange, limit, offset } = parsed.data
  const db = getDatabase()

  // Build dynamic WHERE clauses
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (agent) {
    conditions.push('agent_id = ?')
    params.push(agent)
  }

  if (channel) {
    conditions.push('channel_type = ?')
    params.push(channel)
  }

  if (search) {
    conditions.push(
      `(session_key LIKE ? OR channel_identifier LIKE ? OR last_user_message LIKE ?)`,
    )
    const searchPattern = `%${search}%`
    params.push(searchPattern, searchPattern, searchPattern)
  }

  if (dateRange !== 'all') {
    const dateMap: Record<string, string> = {
      today: '-1 day',
      '7d': '-7 days',
      '30d': '-30 days',
    }
    const interval = dateMap[dateRange]
    if (interval) {
      conditions.push(`last_message_at >= datetime('now', ?)`)
      params.push(interval)
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    // Get total count
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM nanobot_sessions ${whereClause}`,
    ).get(...params) as { total: number }

    // Get paginated results
    const rows = db.prepare(
      `SELECT agent_id, filename, session_key, channel_type, channel_identifier,
              message_count, first_message_at, last_message_at, last_user_message,
              file_size_bytes
       FROM nanobot_sessions ${whereClause}
       ORDER BY last_message_at DESC
       LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as SessionRow[]

    const response: SessionListResponse = {
      sessions: rows.map(row => ({
        agentId: row.agent_id,
        filename: row.filename,
        sessionKey: row.session_key,
        channelType: row.channel_type,
        channelIdentifier: row.channel_identifier,
        messageCount: row.message_count,
        firstMessageAt: row.first_message_at,
        lastMessageAt: row.last_message_at,
        lastUserMessage: row.last_user_message,
        fileSizeBytes: row.file_size_bytes,
      })),
      total: countRow.total,
    }

    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json({ error: `Query failed: ${err.message}` }, { status: 500 })
  }
}

/**
 * POST /api/nanobot-sessions - Trigger a manual session sync
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const result = await syncNanobotSessions()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
