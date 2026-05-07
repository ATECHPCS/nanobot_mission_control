/**
 * Nanobot Presence Status
 *
 * Scans nanobot session directories on disk to determine each named nanobot
 * agent's current activity status. Used by:
 *   - GET /api/nanobot/status — surfaces the raw status to the panel
 *   - GET /api/agents/activity — synthesizes ActivityState entries for the
 *     office tab so the named nanobots get glyphs and speech bubbles.
 */

import fs from 'fs'
import path from 'path'
import { config } from './config'

const BUSY_THRESHOLD_MS = 2 * 60 * 1000

export interface NanobotAgentDef {
  name: string
  role: string
  /** Absolute path to the directory containing the agent's session JSONL files. */
  sessionDir: string
}

export interface NanobotStatus {
  name: string
  role: string
  status: 'busy' | 'idle' | 'offline'
  /** Unix seconds of the last session-file mtime, or null when no sessions exist. */
  lastActivity: number | null
  /** Filename (sans .jsonl) of the most recently modified session, or null. */
  activeSession: string | null
}

function nanobotAgentDefs(): NanobotAgentDef[] {
  const workspace = path.join(config.nanobotStateDir || '', 'workspace')
  return [
    { name: 'Andy',    role: 'lead-engineer', sessionDir: path.join(workspace, 'sessions') },
    { name: 'Stefany', role: 'bookkeeper',    sessionDir: path.join(workspace, 'agents/stefany/sessions') },
    { name: 'Cody',    role: 'engineer',      sessionDir: path.join(workspace, 'agents/cody/sessions') },
  ]
}

export const NANOBOT_AGENTS: NanobotAgentDef[] = nanobotAgentDefs()

function getLatestSessionActivity(sessionDir: string): { lastModified: number; sessionFile: string | null } {
  try {
    if (!fs.existsSync(sessionDir)) return { lastModified: 0, sessionFile: null }
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'))
    let latest = 0
    let latestFile: string | null = null
    for (const file of files) {
      const stat = fs.statSync(path.join(sessionDir, file))
      if (stat.mtimeMs > latest) {
        latest = stat.mtimeMs
        latestFile = file
      }
    }
    return { lastModified: latest, sessionFile: latestFile }
  } catch {
    return { lastModified: 0, sessionFile: null }
  }
}

export function getNanobotStatuses(now: number = Date.now()): NanobotStatus[] {
  return NANOBOT_AGENTS.map(def => {
    const { lastModified, sessionFile } = getLatestSessionActivity(def.sessionDir)
    const isBusy = lastModified > 0 && (now - lastModified) < BUSY_THRESHOLD_MS
    return {
      name: def.name,
      role: def.role,
      status: isBusy ? 'busy' : lastModified > 0 ? 'idle' : 'offline',
      lastActivity: lastModified > 0 ? Math.floor(lastModified / 1000) : null,
      activeSession: sessionFile?.replace('.jsonl', '') || null,
    }
  })
}
