import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { join } from 'path'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { discoverAgents } from '@/lib/agent-discovery'
import { readSessionContent, readSessionContentStream } from '@/lib/nanobot-sessions'
import { sessionContentQuerySchema } from '@/lib/validation'
import type { SessionContentResponse } from '@/types/nanobot-session'

interface SessionRow {
  filename: string
  agent_id: string
  file_size_bytes: number
}

/**
 * GET /api/nanobot-sessions/{agent}/{session} - Read session messages with pagination
 *
 * Route params:
 * - agent: agent ID (e.g. "stefany")
 * - session: session filename without extension (e.g. "telegram_6432548537")
 *
 * Query params:
 * - offset: number of messages to skip (default 0)
 * - limit: max messages to return (default 100, max 500)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agent: string; session: string }> },
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { agent: agentId, session: sessionSlug } = await params

  // Parse query params
  const url = new URL(request.url)
  const rawParams: Record<string, string> = {}
  for (const [key, value] of url.searchParams.entries()) {
    rawParams[key] = value
  }

  const parsed = sessionContentQuerySchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { offset, limit } = parsed.data
  const filename = `${sessionSlug}.jsonl`

  // Look up session in DB
  const db = getDatabase()
  const sessionRow = db.prepare(
    `SELECT filename, agent_id, file_size_bytes FROM nanobot_sessions
     WHERE agent_id = ? AND filename = ?`,
  ).get(agentId, filename) as SessionRow | undefined

  if (!sessionRow) {
    return NextResponse.json(
      { error: `Session not found: ${agentId}/${filename}` },
      { status: 404 },
    )
  }

  // Discover agent to get homePath for file access
  const agents = discoverAgents()
  const agent = agents.find(a => a.id === agentId)

  if (!agent) {
    return NextResponse.json(
      { error: `Agent not found: ${agentId}` },
      { status: 404 },
    )
  }

  const filePath = join(agent.homePath, '.nanobot', 'sessions', filename)

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `Session file not found on disk: ${filename}` },
      { status: 404 },
    )
  }

  try {
    // Use streaming for large files (>=1MB)
    const STREAM_THRESHOLD = 1 * 1024 * 1024
    let result: SessionContentResponse

    if (sessionRow.file_size_bytes >= STREAM_THRESHOLD) {
      result = await readSessionContentStream(filePath, offset, limit)
    } else {
      result = readSessionContent(filePath, offset, limit)
    }

    // Populate agentId and filename on the response
    result.agentId = agentId
    result.filename = filename

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to read session: ${err.message}` },
      { status: 500 },
    )
  }
}
