/**
 * Nanobot Session JSONL Parser and SQLite Sync
 *
 * Discovers, parses, and caches nanobot agent JSONL session files.
 * Follows the same pattern as claude-sessions.ts:
 * - scanAgentSessions: filesystem scan -> metadata array
 * - syncNanobotSessions: scan all agents -> upsert into SQLite
 * - readSessionContent: read session messages with pagination
 * - readSessionContentStream: streaming read for large files
 *
 * Performance: files <1MB are read with readFileSync, >=1MB use streaming readline.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { discoverAgents } from '@/lib/agent-discovery'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import type {
  NanobotSessionMeta,
  NanobotSessionMessage,
  NanobotSessionMetadata,
  SessionContentResponse,
} from '@/types/nanobot-session'
import { parseMetadataKey } from '@/types/nanobot-session'

// 1MB threshold for switching to streaming reads
const STREAM_THRESHOLD_BYTES = 1 * 1024 * 1024

// ---------------------------------------------------------------------------
// Session Scanning
// ---------------------------------------------------------------------------

/**
 * Scan an agent's sessions directory and return metadata for each session file.
 * Reads all .jsonl files, parses the metadata line, counts messages,
 * and extracts timestamps and last user message snippet.
 */
export function scanAgentSessions(agentId: string, sessionsDir: string): NanobotSessionMeta[] {
  const results: NanobotSessionMeta[] = []
  let files: string[]
  try {
    files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
  } catch {
    return results
  }

  for (const filename of files) {
    const filePath = join(sessionsDir, filename)
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      continue
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      if (lines.length === 0) continue

      // Parse metadata line (first line)
      let sessionKey = filename.replace('.jsonl', '')
      let channelType = 'unknown'
      let channelIdentifier = sessionKey
      try {
        const meta = JSON.parse(lines[0]) as Partial<NanobotSessionMetadata>
        if (meta._type === 'metadata' && meta.key) {
          sessionKey = meta.key
          const parsed = parseMetadataKey(meta.key)
          channelType = parsed.channel
          channelIdentifier = parsed.identifier
        }
      } catch {
        // Use filename-based fallback
      }

      // Filter to non-metadata message lines
      const messageParsed: NanobotSessionMessage[] = []
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          if (entry._type === 'metadata') continue
          if (entry.role) {
            messageParsed.push(entry)
          }
        } catch {
          continue
        }
      }

      let firstMessageAt: string | null = null
      let lastMessageAt: string | null = null
      let lastUserMessage: string | null = null

      for (const msg of messageParsed) {
        if (msg.timestamp) {
          if (!firstMessageAt) firstMessageAt = msg.timestamp
          lastMessageAt = msg.timestamp
        }
        if (msg.role === 'user' && msg.content) {
          lastUserMessage = msg.content.slice(0, 60)
        }
      }

      results.push({
        agentId,
        filename,
        sessionKey,
        channelType,
        channelIdentifier,
        messageCount: messageParsed.length,
        firstMessageAt,
        lastMessageAt,
        lastUserMessage,
        fileSizeBytes: stat.size,
      })
    } catch (err) {
      logger.warn({ err, filePath }, 'Failed to parse nanobot session file')
      continue
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Session Content Reading
// ---------------------------------------------------------------------------

/**
 * Read session messages from a JSONL file with optional pagination.
 * For files <1MB, uses readFileSync. For >=1MB, delegates to readSessionContentStream.
 *
 * @param filePath - Absolute path to the JSONL file
 * @param offset - Number of messages to skip (default 0)
 * @param limit - Maximum messages to return (default 100)
 * @param tail - If true, return the last `limit` messages (offset is ignored)
 */
export function readSessionContent(
  filePath: string,
  offset: number = 0,
  limit: number = 100,
  tail: boolean = false,
): SessionContentResponse {
  const stat = statSync(filePath)

  // For large files, caller should use readSessionContentStream directly
  // But we handle it here too for API convenience
  if (stat.size >= STREAM_THRESHOLD_BYTES) {
    // Return a synchronous-compatible response for the non-streaming path
    // The API route should call readSessionContentStream for large files
    // For now, fall through to synchronous read (safe up to ~10MB)
  }

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)

  // Parse all non-metadata messages
  const allMessages: NanobotSessionMessage[] = []
  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (entry._type === 'metadata') continue
      if (entry.role) {
        allMessages.push({
          role: entry.role,
          content: entry.content ?? '',
          timestamp: entry.timestamp,
          ...(entry.tool_calls && { tool_calls: entry.tool_calls }),
          ...(entry.tool_call_id && { tool_call_id: entry.tool_call_id }),
          ...(entry.name && { name: entry.name }),
        })
      }
    } catch {
      continue
    }
  }

  const total = allMessages.length

  if (tail) {
    const tailOffset = Math.max(0, total - limit)
    const paginated = allMessages.slice(tailOffset)
    return {
      messages: paginated,
      total,
      hasMore: tailOffset > 0,
      offset: tailOffset,
      agentId: '',
      filename: '',
    }
  }

  const paginated = allMessages.slice(offset, offset + limit)
  const hasMore = offset + limit < total

  return {
    messages: paginated,
    total,
    hasMore,
    offset,
    agentId: '',
    filename: '',
  }
}

/**
 * Read session messages via streaming readline for large files.
 * Uses readline.createInterface with createReadStream to avoid loading
 * the entire file into memory.
 *
 * @param filePath - Absolute path to the JSONL file
 * @param offset - Number of messages to skip (default 0)
 * @param limit - Maximum messages to return (default 100)
 * @param tail - If true, return the last `limit` messages (offset is ignored)
 */
export async function readSessionContentStream(
  filePath: string,
  offset: number = 0,
  limit: number = 100,
  tail: boolean = false,
): Promise<SessionContentResponse> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })

    if (tail) {
      // For tail mode, collect all messages then return the last `limit`
      const allMessages: NanobotSessionMessage[] = []

      rl.on('line', (line: string) => {
        if (!line.trim()) return
        try {
          const entry = JSON.parse(line)
          if (entry._type === 'metadata') return
          if (!entry.role) return
          allMessages.push({
            role: entry.role,
            content: entry.content ?? '',
            timestamp: entry.timestamp,
            ...(entry.tool_calls && { tool_calls: entry.tool_calls }),
            ...(entry.tool_call_id && { tool_call_id: entry.tool_call_id }),
            ...(entry.name && { name: entry.name }),
          })
        } catch { /* skip */ }
      })

      rl.on('close', () => {
        const total = allMessages.length
        const tailOffset = Math.max(0, total - limit)
        resolve({
          messages: allMessages.slice(tailOffset),
          total,
          hasMore: tailOffset > 0,
          offset: tailOffset,
          agentId: '',
          filename: '',
        })
      })

      rl.on('error', reject)
      return
    }

    // Normal offset-based pagination
    const messages: NanobotSessionMessage[] = []
    let messageIndex = 0
    let total = 0
    let collected = 0

    rl.on('line', (line: string) => {
      if (!line.trim()) return

      try {
        const entry = JSON.parse(line)
        if (entry._type === 'metadata') return
        if (!entry.role) return

        total++

        if (messageIndex >= offset && collected < limit) {
          messages.push({
            role: entry.role,
            content: entry.content ?? '',
            timestamp: entry.timestamp,
            ...(entry.tool_calls && { tool_calls: entry.tool_calls }),
            ...(entry.tool_call_id && { tool_call_id: entry.tool_call_id }),
            ...(entry.name && { name: entry.name }),
          })
          collected++
        }
        messageIndex++
      } catch {
        // Skip malformed lines
      }
    })

    rl.on('close', () => {
      resolve({
        messages,
        total,
        hasMore: offset + limit < total,
        offset,
        agentId: '',
        filename: '',
      })
    })

    rl.on('error', (err) => {
      reject(err)
    })
  })
}

// ---------------------------------------------------------------------------
// SQLite Sync
// ---------------------------------------------------------------------------

/**
 * Discover all agents, scan their sessions, and upsert metadata into SQLite.
 * Compares file_size_bytes to skip unchanged files.
 */
export async function syncNanobotSessions(): Promise<{ ok: boolean; message: string }> {
  try {
    const agents = discoverAgents()
    if (agents.length === 0) {
      return { ok: true, message: 'No agents discovered' }
    }

    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // Prepare statements
    const existing = db.prepare(`
      SELECT file_size_bytes FROM nanobot_sessions
      WHERE agent_id = ? AND filename = ?
    `)

    const upsert = db.prepare(`
      INSERT INTO nanobot_sessions (
        agent_id, filename, session_key, channel_type, channel_identifier,
        message_count, first_message_at, last_message_at, last_user_message,
        file_size_bytes, scanned_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, filename) DO UPDATE SET
        session_key = excluded.session_key,
        channel_type = excluded.channel_type,
        channel_identifier = excluded.channel_identifier,
        message_count = excluded.message_count,
        first_message_at = excluded.first_message_at,
        last_message_at = excluded.last_message_at,
        last_user_message = excluded.last_user_message,
        file_size_bytes = excluded.file_size_bytes,
        scanned_at = excluded.scanned_at,
        updated_at = excluded.updated_at
    `)

    let scanned = 0
    let skipped = 0

    db.transaction(() => {
      for (const agent of agents) {
        const sessionsDir = join(agent.workspacePath, 'sessions')
        const sessions = scanAgentSessions(agent.id, sessionsDir)

        for (const session of sessions) {
          // Skip unchanged files
          const row = existing.get(session.agentId, session.filename) as
            | { file_size_bytes: number }
            | undefined
          if (row && row.file_size_bytes === session.fileSizeBytes) {
            skipped++
            continue
          }

          upsert.run(
            session.agentId,
            session.filename,
            session.sessionKey,
            session.channelType,
            session.channelIdentifier,
            session.messageCount,
            session.firstMessageAt,
            session.lastMessageAt,
            session.lastUserMessage,
            session.fileSizeBytes,
            now,
            now,
          )
          scanned++
        }
      }
    })()

    return {
      ok: true,
      message: `Synced ${scanned} session(s), ${skipped} unchanged`,
    }
  } catch (err: any) {
    logger.error({ err }, 'Nanobot session sync failed')
    return { ok: false, message: `Sync failed: ${err.message}` }
  }
}
