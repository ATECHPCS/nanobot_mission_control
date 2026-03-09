import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers, Message } from '@/lib/db'
import { eventBus } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const COORDINATOR_AGENT =
  String(process.env.MC_COORDINATOR_AGENT || process.env.NEXT_PUBLIC_COORDINATOR_AGENT || 'coordinator').trim() ||
  'coordinator'

/**
 * GET /api/chat/messages - List messages with filters
 * Query params: conversation_id, from_agent, to_agent, limit, offset, since
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const { searchParams } = new URL(request.url)

    const conversation_id = searchParams.get('conversation_id')
    const from_agent = searchParams.get('from_agent')
    const to_agent = searchParams.get('to_agent')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const since = searchParams.get('since')

    let query = 'SELECT * FROM messages WHERE workspace_id = ?'
    const params: unknown[] = [workspaceId]

    if (conversation_id) {
      query += ' AND conversation_id = ?'
      params.push(conversation_id)
    }

    if (from_agent) {
      query += ' AND from_agent = ?'
      params.push(from_agent)
    }

    if (to_agent) {
      query += ' AND to_agent = ?'
      params.push(to_agent)
    }

    if (since) {
      query += ' AND created_at > ?'
      params.push(parseInt(since))
    }

    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const messages = db.prepare(query).all(...params) as Message[]

    const parsed = messages.map((msg) => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null
    }))

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM messages WHERE workspace_id = ?'
    const countParams: unknown[] = [workspaceId]
    if (conversation_id) {
      countQuery += ' AND conversation_id = ?'
      countParams.push(conversation_id)
    }
    if (from_agent) {
      countQuery += ' AND from_agent = ?'
      countParams.push(from_agent)
    }
    if (to_agent) {
      countQuery += ' AND to_agent = ?'
      countParams.push(to_agent)
    }
    if (since) {
      countQuery += ' AND created_at > ?'
      countParams.push(parseInt(since))
    }
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number }

    return NextResponse.json({ messages: parsed, total: countRow.total, page: Math.floor(offset / limit) + 1, limit })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/chat/messages error')
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

/**
 * POST /api/chat/messages - Send a new message
 * Body: { to, content, message_type, conversation_id, metadata }
 * Sender identity is always resolved server-side from authenticated user.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const from = auth.user.display_name || auth.user.username || 'system'
    const to = body.to ? (body.to as string).trim() : null
    const content = (body.content || '').trim()
    const message_type = body.message_type || 'text'
    const conversation_id = body.conversation_id || `conv_${Date.now()}`
    const metadata = body.metadata || null

    if (!content) {
      return NextResponse.json(
        { error: '"content" is required' },
        { status: 400 }
      )
    }

    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      conversation_id,
      from,
      to,
      content,
      message_type,
      metadata ? JSON.stringify(metadata) : null,
      workspaceId
    )

    const messageId = result.lastInsertRowid as number

    // Log activity
    db_helpers.logActivity(
      'chat_message',
      'message',
      messageId,
      from,
      `Sent ${message_type} message${to ? ` to ${to}` : ' (broadcast)'}`,
      { conversation_id, to, message_type },
      workspaceId
    )

    // Create notification for recipient if specified
    if (to) {
      db_helpers.createNotification(
        to,
        'chat_message',
        `Message from ${from}`,
        content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        'message',
        messageId,
        workspaceId
      )
    }

    const created = db.prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?').get(messageId, workspaceId) as Message
    const parsedMessage = {
      ...created,
      metadata: created.metadata ? JSON.parse(created.metadata) : null
    }

    // Broadcast to SSE clients
    eventBus.broadcast('chat.message', parsedMessage)

    return NextResponse.json({ message: parsedMessage }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/chat/messages error')
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
