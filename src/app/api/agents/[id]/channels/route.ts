import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { logger } from '@/lib/logger'

/**
 * GET /api/agents/{id}/channels
 *
 * Returns channel statuses for a specific agent from the cached health snapshot.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { id } = await params
    const snapshot = healthMonitor.getAgentSnapshot(id)

    if (!snapshot) {
      return NextResponse.json(
        { error: `Agent '${id}' not found` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      channels: snapshot.channels,
      count: snapshot.channels.length,
    })
  } catch (err) {
    logger.error({ err }, 'Failed to get agent channels')
    return NextResponse.json(
      { error: 'Failed to get agent channels' },
      { status: 500 }
    )
  }
}
