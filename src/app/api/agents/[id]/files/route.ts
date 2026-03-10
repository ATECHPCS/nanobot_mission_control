import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { scanWorkspace } from '@/lib/memory-files'
import { logger } from '@/lib/logger'

/**
 * GET /api/agents/[id]/files
 *
 * Returns the recursive .md file tree for a discovered agent's workspace.
 * Requires viewer role (any authenticated user can browse).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const resolvedParams = await params
    const agentId = resolvedParams.id

    const snapshot = healthMonitor.getSnapshot()
    const agent = snapshot.find(a => a.id === agentId)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found or not yet discovered' },
        { status: 404 }
      )
    }

    const tree = scanWorkspace(agent.agent.workspacePath)

    return NextResponse.json({ tree, agentId })
  } catch (err) {
    logger.error({ err }, 'GET /api/agents/[id]/files error')
    return NextResponse.json(
      { error: 'Failed to scan workspace files' },
      { status: 500 }
    )
  }
}
