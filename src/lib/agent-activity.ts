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

/** Returns the current unix epoch in seconds (integer). */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

const TYPING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob'])
const SEARCHING_TOOLS = new Set(['WebFetch', 'WebSearch'])
const BASH_TOOLS = new Set(['Bash'])

/** Returns the activity kind for a known tool name, or null if not classified. */
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
 *
 * The `subject` field carries the joined names of the meeting participants,
 * truncated to the first 5 to keep speech-bubble copy readable.
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
