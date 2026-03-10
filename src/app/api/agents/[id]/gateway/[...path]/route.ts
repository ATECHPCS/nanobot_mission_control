import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { healthMonitor } from '@/lib/health-monitor'
import { proxyGatewayRequest, ALLOWED_ENDPOINTS } from '@/lib/agent-gateway'

/**
 * GET /api/agents/[id]/gateway/[...path]
 *
 * Proxy GET requests to an agent's gateway port.
 * Only allows endpoints in ALLOWED_ENDPOINTS (health, status).
 * Viewer role can query gateway health/status (read-only).
 *
 * The browser never talks directly to agent gateway ports --
 * all gateway communication routes through this MC API route.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  const { id, path } = await params
  const endpoint = path.join('/')

  // Validate endpoint against allowlist
  if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
    return NextResponse.json(
      {
        error: 'Endpoint not allowed',
        details: `Only these endpoints are allowed: ${ALLOWED_ENDPOINTS.join(', ')}`,
      },
      { status: 403 }
    )
  }

  const snapshot = healthMonitor.getAgentSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const { gatewayPort, gatewayHost } = snapshot.agent
  if (!gatewayPort) {
    return NextResponse.json(
      { error: 'Agent has no gateway port configured' },
      { status: 404 }
    )
  }

  // Proxy request to agent gateway
  const result = await proxyGatewayRequest(gatewayHost, gatewayPort, endpoint)

  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status }
    )
  }

  // Return proxied response with matching status and content-type
  return new NextResponse(result.body, {
    status: result.status,
    headers: { 'Content-Type': result.contentType },
  })
}
