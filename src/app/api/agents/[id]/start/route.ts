import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { eventBus } from '@/lib/event-bus'
import { startAgent, isPortAvailable, findPidByPort } from '@/lib/agent-lifecycle'
import { checkPortAlive } from '@/lib/agent-health'

/**
 * POST /api/agents/[id]/start
 *
 * Start an agent by executing its launch script as a detached process.
 * Requires operator+ role. Pre-checks port availability.
 * Starts background gateway verification (15s polling).
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

  const { id } = await params
  const snapshot = healthMonitor.getAgentSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { gatewayPort } = snapshot.agent
  if (!gatewayPort) {
    return NextResponse.json(
      { error: 'Agent has no gateway port configured' },
      { status: 400 }
    )
  }

  // Acquire lifecycle lock
  const lock = healthMonitor.acquireLock(id, 'start', auth.user.username)
  if (!lock.acquired) {
    return NextResponse.json(
      { error: lock.error },
      { status: 409 }
    )
  }

  // Pre-check: is port already in use?
  if (!isPortAvailable(gatewayPort)) {
    const existingPid = findPidByPort(gatewayPort)
    healthMonitor.releaseLock(id)
    return NextResponse.json(
      {
        error: 'Port in use',
        details: `Port ${gatewayPort} is already in use (PID: ${existingPid})`,
        port: gatewayPort,
        pid: existingPid,
      },
      { status: 409 }
    )
  }

  // Broadcast operation started
  eventBus.broadcast('agent.lifecycle', {
    id,
    action: 'start',
    status: 'pending',
    username: auth.user.username,
    timestamp: Date.now(),
  })

  // Start the agent
  const result = startAgent(snapshot.agent)

  if (result.error) {
    eventBus.broadcast('agent.lifecycle', {
      id,
      action: 'start',
      status: 'error',
      error: result.error,
      username: auth.user.username,
      timestamp: Date.now(),
    })
    healthMonitor.releaseLock(id)
    return NextResponse.json(
      { error: 'Failed to start agent', details: result.error },
      { status: 500 }
    )
  }

  // Background verification: poll for gateway to come up (non-blocking)
  const agentId = id
  const port = gatewayPort
  const host = snapshot.agent.gatewayHost
  const username = auth.user.username

  setTimeout(async () => {
    const POLL_INTERVAL_MS = 1000
    const MAX_WAIT_MS = 15_000
    const start = Date.now()

    while (Date.now() - start < MAX_WAIT_MS) {
      const alive = await checkPortAlive(port, host, 2000)
      if (alive) {
        eventBus.broadcast('agent.lifecycle', {
          id: agentId,
          action: 'start',
          status: 'success',
          username,
          timestamp: Date.now(),
        })
        healthMonitor.releaseLock(agentId)
        return
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }

    // Timeout -- gateway did not start
    eventBus.broadcast('agent.lifecycle', {
      id: agentId,
      action: 'start',
      status: 'error',
      error: 'Gateway did not start within 15 seconds',
      username,
      timestamp: Date.now(),
    })
    healthMonitor.releaseLock(agentId)
  }, 0)

  return NextResponse.json({
    success: true,
    agentId: id,
    pid: result.pid,
    status: 'starting',
  })
}
