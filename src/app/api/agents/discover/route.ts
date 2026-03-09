import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { logger } from '@/lib/logger'

/**
 * GET /api/agents/discover
 *
 * Returns all discovered agents with health snapshots.
 * Starts the health monitor if not already running.
 * Accepts ?refresh=true to force an immediate re-check.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    // Start monitor on first request (idempotent)
    healthMonitor.start()

    // Force refresh if requested
    const refresh = request.nextUrl.searchParams.get('refresh')
    if (refresh === 'true') {
      await healthMonitor.tick()
    }

    const agents = healthMonitor.getSnapshot()

    return NextResponse.json({
      agents,
      checkedAt: agents.length > 0 ? agents[0].checkedAt : Date.now(),
      count: agents.length,
    })
  } catch (err) {
    logger.error({ err }, 'Failed to discover agents')
    return NextResponse.json(
      { error: 'Failed to discover agents' },
      { status: 500 }
    )
  }
}
