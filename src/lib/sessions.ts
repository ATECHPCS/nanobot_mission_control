import fs from 'node:fs'
import path from 'node:path'
import { discoverAgents } from './agent-discovery'
import { parseMetadataKey } from '@/types/nanobot-session'

export interface GatewaySession {
  /** Session store key, e.g. "telegram:6432548537" */
  key: string
  /** Agent name, e.g. "stefany" */
  agent: string
  sessionId: string
  updatedAt: number
  chatType: string
  channel: string
  model: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  contextTokens: number
  active: boolean
}

interface AgentSessionDir {
  agentName: string
  sessionsDir: string
  model: string
}

/**
 * Discover all agent session directories using the agent discovery system.
 * Returns the sessions dir path, agent name, and model for each agent.
 */
function getAgentSessionDirs(): AgentSessionDir[] {
  const agents = discoverAgents()
  const results: AgentSessionDir[] = []

  for (const agent of agents) {
    const sessionsDir = path.join(agent.workspacePath, 'sessions')
    if (!fs.existsSync(sessionsDir)) continue

    results.push({
      agentName: agent.id,
      sessionsDir,
      model: agent.model || 'unknown',
    })
  }

  return results
}

/**
 * Parse the metadata (first line) of a JSONL session file.
 * Returns null if the file is empty or the first line isn't valid metadata.
 */
function parseJsonlMetadata(filePath: string): {
  key: string
  updatedAt: number
  sessionId: string
  channel: string
  chatType: string
} | null {
  try {
    // Read only the first line for metadata
    const content = fs.readFileSync(filePath, 'utf-8')
    const newlineIdx = content.indexOf('\n')
    const firstLine = newlineIdx >= 0 ? content.slice(0, newlineIdx) : content
    if (!firstLine.trim()) return null

    const meta = JSON.parse(firstLine)
    if (meta._type !== 'metadata' || !meta.key) return null

    const updatedAtStr = meta.updated_at || meta.updatedAt || ''
    const updatedAt = updatedAtStr ? new Date(updatedAtStr).getTime() : 0

    const parsed = parseMetadataKey(meta.key)

    return {
      key: meta.key,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      sessionId: meta.metadata?.sdk_session_id || meta.sessionId || '',
      channel: parsed.channel,
      chatType: parsed.channel || 'unknown',
    }
  } catch {
    return null
  }
}

/**
 * Read all sessions from nanobot agent JSONL session files on disk.
 *
 * Uses discoverAgents() to find agent workspace directories, then scans
 * each agent's sessions/ folder for .jsonl files with metadata headers.
 */
export function getAllGatewaySessions(activeWithinMs = 60 * 60 * 1000): GatewaySession[] {
  const sessions: GatewaySession[] = []
  const now = Date.now()

  for (const { agentName, sessionsDir, model } of getAgentSessionDirs()) {
    let files: string[]
    try {
      files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const filename of files) {
      const filePath = path.join(sessionsDir, filename)
      const meta = parseJsonlMetadata(filePath)
      if (!meta) continue

      sessions.push({
        key: meta.key,
        agent: agentName,
        sessionId: meta.sessionId,
        updatedAt: meta.updatedAt,
        chatType: meta.chatType,
        channel: meta.channel,
        model,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        contextTokens: 0,
        active: meta.updatedAt > 0 && (now - meta.updatedAt) < activeWithinMs,
      })
    }
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return sessions
}

export function countStaleGatewaySessions(retentionDays: number): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  const cutoff = Date.now() - retentionDays * 86400000
  let stale = 0

  for (const { sessionsDir } of getAgentSessionDirs()) {
    let files: string[]
    try {
      files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const filename of files) {
      const meta = parseJsonlMetadata(path.join(sessionsDir, filename))
      if (meta && meta.updatedAt > 0 && meta.updatedAt < cutoff) stale += 1
    }
  }

  return stale
}

export function pruneGatewaySessionsOlderThan(retentionDays: number): { deleted: number; filesTouched: number } {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return { deleted: 0, filesTouched: 0 }
  const cutoff = Date.now() - retentionDays * 86400000
  let deleted = 0
  let filesTouched = 0

  for (const { sessionsDir } of getAgentSessionDirs()) {
    let files: string[]
    try {
      files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const filename of files) {
      const filePath = path.join(sessionsDir, filename)
      const meta = parseJsonlMetadata(filePath)
      if (meta && meta.updatedAt > 0 && meta.updatedAt < cutoff) {
        try {
          fs.unlinkSync(filePath)
          deleted += 1
          filesTouched += 1
        } catch {
          // Ignore unremovable files
        }
      }
    }
  }

  return { deleted, filesTouched }
}

/**
 * Derive agent active/idle/offline status from their sessions.
 * Returns a map of agentName -> { status, lastActivity, channel }
 */
export function getAgentLiveStatuses(): Map<string, {
  status: 'active' | 'idle' | 'offline'
  lastActivity: number
  channel: string
}> {
  const sessions = getAllGatewaySessions()
  const now = Date.now()
  const statuses = new Map<string, { status: 'active' | 'idle' | 'offline'; lastActivity: number; channel: string }>()

  for (const session of sessions) {
    const existing = statuses.get(session.agent)
    // Keep the most recent session per agent
    if (!existing || session.updatedAt > existing.lastActivity) {
      const age = now - session.updatedAt
      let status: 'active' | 'idle' | 'offline'
      if (age < 5 * 60 * 1000) {
        status = 'active'       // Active within 5 minutes
      } else if (age < 60 * 60 * 1000) {
        status = 'idle'         // Active within 1 hour
      } else {
        status = 'offline'
      }
      statuses.set(session.agent, {
        status,
        lastActivity: session.updatedAt,
        channel: session.channel,
      })
    }
  }

  return statuses
}
