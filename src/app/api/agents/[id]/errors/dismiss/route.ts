import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { logger } from '@/lib/logger'

/**
 * POST /api/agents/{id}/errors/dismiss
 *
 * Dismisses/acknowledges errors for an agent.
 * Clears the error badge in the health monitor's cached snapshot.
 * Requires operator role (viewers cannot dismiss errors).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { id } = await params
    const dismissed = healthMonitor.dismissErrors(id)

    if (!dismissed) {
      return NextResponse.json(
        { error: `Agent '${id}' not found` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      dismissed: true,
      agentId: id,
    })
  } catch (err) {
    logger.error({ err }, 'Failed to dismiss agent errors')
    return NextResponse.json(
      { error: 'Failed to dismiss agent errors' },
      { status: 500 }
    )
  }
}
