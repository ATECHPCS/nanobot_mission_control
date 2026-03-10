/**
 * Type definitions for nanobot agent JSONL session data.
 *
 * Nanobot session files are JSONL with a metadata line (first line)
 * followed by message lines. Each message has a role, content, and timestamp.
 * Sessions are identified by channel type + identifier (e.g. telegram:6432548537).
 */

// ---------------------------------------------------------------------------
// JSONL Line Types
// ---------------------------------------------------------------------------

/** The metadata line at the top of every nanobot session JSONL file */
export interface NanobotSessionMetadata {
  _type: 'metadata'
  key: string // "channel:identifier" e.g. "telegram:6432548537"
  created_at: string // ISO datetime
  updated_at: string // ISO datetime
  metadata: Record<string, unknown>
  last_consolidated: number
}

/** A message entry in a nanobot session JSONL file */
export interface NanobotSessionMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string // Present on role: "tool" responses
  name?: string // Tool name on role: "tool" responses
}

// ---------------------------------------------------------------------------
// Cached Metadata (for session list)
// ---------------------------------------------------------------------------

/** Session metadata cached in SQLite for fast listing */
export interface NanobotSessionMeta {
  agentId: string
  filename: string
  sessionKey: string
  channelType: string
  channelIdentifier: string
  messageCount: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  lastUserMessage: string | null
  fileSizeBytes: number
}

// ---------------------------------------------------------------------------
// API Responses
// ---------------------------------------------------------------------------

/** Response for GET /api/nanobot-sessions (session list) */
export interface SessionListResponse {
  sessions: NanobotSessionMeta[]
  total: number
}

/** Response for GET /api/nanobot-sessions/{agent}/{session} (session content) */
export interface SessionContentResponse {
  messages: NanobotSessionMessage[]
  total: number
  hasMore: boolean
  agentId: string
  filename: string
}

// ---------------------------------------------------------------------------
// Channel Icons
// ---------------------------------------------------------------------------

/** Icons for known channel types */
export const CHANNEL_ICONS: Record<string, string> = {
  telegram: '\u{1F4AC}', // speech bubble
  cron: '\u{23F0}', // alarm clock
  paperclip: '\u{1F4CE}', // paperclip
  discord: '\u{1F47E}', // alien
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a session filename to extract channel type and identifier.
 * Filename format: {channel}_{identifier}.jsonl
 * Example: "telegram_6432548537.jsonl" -> { channel: "telegram", identifier: "6432548537" }
 */
export function parseSessionFilename(filename: string): { channel: string; identifier: string } {
  const base = filename.replace('.jsonl', '')
  const underscoreIdx = base.indexOf('_')
  if (underscoreIdx === -1) return { channel: 'unknown', identifier: base }
  return {
    channel: base.slice(0, underscoreIdx),
    identifier: base.slice(underscoreIdx + 1),
  }
}

/**
 * Parse a metadata key to extract channel type and identifier.
 * Key format: "channel:identifier" (colon-separated)
 * Example: "telegram:6432548537" -> { channel: "telegram", identifier: "6432548537" }
 */
export function parseMetadataKey(key: string): { channel: string; identifier: string } {
  const colonIdx = key.indexOf(':')
  if (colonIdx === -1) return { channel: 'unknown', identifier: key }
  return {
    channel: key.slice(0, colonIdx),
    identifier: key.slice(colonIdx + 1),
  }
}
