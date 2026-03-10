import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { syncClaudeSessions } from '@/lib/claude-sessions'
import { aggregateTokenStats } from '@/lib/token-aggregation'

const VALID_RANGES = new Set(['today', 'week', 'month', 'year'])

/**
 * GET /api/token-stats?range=week
 *
 * Returns unified token stats from claude_sessions, token_usage,
 * and nanobot_sessions tables.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const range = url.searchParams.get('range') ?? 'week'

  if (!VALID_RANGES.has(range)) {
    return NextResponse.json(
      { error: `Invalid range "${range}". Must be one of: today, week, month, year` },
      { status: 400 },
    )
  }

  try {
    // Refresh Claude Code session data (fast -- just re-scans JSONL files)
    await syncClaudeSessions()

    const db = getDatabase()
    const stats = aggregateTokenStats(db, range)

    return NextResponse.json(stats)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Token stats query failed: ${err.message}` },
      { status: 500 },
    )
  }
}
