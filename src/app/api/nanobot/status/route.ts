import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/nanobot/status
 *
 * Scans nanobot session directories to determine agent activity status.
 * An agent is "busy" if any session file was modified within the last 2 minutes.
 */

const BUSY_THRESHOLD_MS = 2 * 60 * 1000

interface NanobotAgentDef {
  name: string
  role: string
  sessionDir: string
}

const HOME = process.env.HOME || '/Users/designmac'

const NANOBOT_AGENTS: NanobotAgentDef[] = [
  {
    name: 'Andy',
    role: 'lead-engineer',
    sessionDir: path.join(HOME, '.nanobot/workspace/sessions'),
  },
  {
    name: 'Stefany',
    role: 'bookkeeper',
    sessionDir: path.join(HOME, '.nanobot/workspace/agents/stefany/sessions'),
  },
  {
    name: 'Cody',
    role: 'engineer',
    sessionDir: path.join(HOME, '.nanobot/workspace/agents/cody/sessions'),
  },
]

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

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  const now = Date.now()
  const agents = NANOBOT_AGENTS.map(def => {
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

  return NextResponse.json({ agents, checkedAt: now })
}

export const dynamic = 'force-dynamic'
