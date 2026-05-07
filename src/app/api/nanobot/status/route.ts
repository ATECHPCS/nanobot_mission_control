import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { getNanobotStatuses } from '@/lib/nanobot-status'

/**
 * GET /api/nanobot/status
 *
 * Returns each named nanobot agent's current activity status by scanning
 * their session directories on disk. An agent is "busy" if any session
 * file was modified within the last 2 minutes.
 *
 * The actual scan logic lives in `src/lib/nanobot-status.ts` so the
 * /api/agents/activity route can reuse it.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  const now = Date.now()
  const agents = getNanobotStatuses(now)

  return NextResponse.json({ agents, checkedAt: now })
}

export const dynamic = 'force-dynamic'
