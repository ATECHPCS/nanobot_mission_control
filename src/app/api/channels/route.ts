import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { getDetectedGatewayToken } from '@/lib/gateway-runtime'

const gatewayInternalUrl = `http://${config.gatewayHost}:${config.gatewayPort}`

function gatewayHeaders(): Record<string, string> {
  const token = getDetectedGatewayToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

interface ChannelAccount {
  id: string
  platform: string
  label: string
  status: 'connected' | 'disconnected' | 'degraded' | 'pending'
  lastActivity?: number
  errorMessage?: string
}

interface ChannelsSnapshot {
  channels: ChannelAccount[]
  connected: boolean
  updatedAt?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformGatewayChannels(data: any): ChannelsSnapshot {
  const channels: ChannelAccount[] = []
  const channelLabels = data.channelLabels || {}
  const rawChannels = data.channels || {}
  const rawAccounts = data.channelAccounts || {}
  const order: string[] = data.channelOrder || Object.keys(rawChannels)

  for (const key of order) {
    const chData = rawChannels[key]
    if (!chData) continue
    const accounts = rawAccounts[key] || {}
    const accountEntries = Object.values(accounts) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any

    if (accountEntries.length === 0) {
      channels.push({
        id: key,
        platform: key,
        label: channelLabels[key] || key,
        status: chData.configured ? 'pending' : 'disconnected',
      })
    } else {
      for (const acct of accountEntries) {
        channels.push({
          id: `${key}:${acct.accountId || 'default'}`,
          platform: key,
          label: channelLabels[key] || key,
          status: acct.connected === true ? 'connected'
            : acct.running ? 'degraded'
            : acct.enabled === false ? 'disconnected'
            : 'pending',
          lastActivity: acct.lastInboundAt || acct.lastOutboundAt || undefined,
          errorMessage: acct.lastError || undefined,
        })
      }
    }
  }

  return { channels, connected: true, updatedAt: data.ts }
}

async function isGatewayReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${gatewayInternalUrl}/api/health`, {
      headers: gatewayHeaders(),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

/**
 * GET /api/channels - Fetch channel status from the gateway
 * Supports ?action=probe&channel=<name> to probe a specific channel
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // Probe a specific channel
  if (action === 'probe') {
    const channel = searchParams.get('channel')
    if (!channel) {
      return NextResponse.json({ error: 'channel parameter required' }, { status: 400 })
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`${gatewayInternalUrl}/api/channels/probe`, {
        method: 'POST',
        headers: gatewayHeaders(),
        body: JSON.stringify({ channel }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      logger.warn({ err, channel }, 'Channel probe failed')
      return NextResponse.json(
        { ok: false, error: 'Gateway unreachable' },
        { status: 502 },
      )
    }
  }

  // Default: fetch all channel statuses
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${gatewayInternalUrl}/api/channels/status`, {
      headers: gatewayHeaders(),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json()
    return NextResponse.json(transformGatewayChannels(data))
  } catch (err) {
    logger.warn({ err }, 'Gateway unreachable for channel status')
    // Channel status endpoint failed — check if gateway is still reachable
    const reachable = await isGatewayReachable()
    return NextResponse.json({ channels: [], connected: reachable } satisfies ChannelsSnapshot)
  }
}
