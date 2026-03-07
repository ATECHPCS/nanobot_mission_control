import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { requireRole } from '@/lib/auth'

interface DiscoveredGateway {
  user: string
  port: number
  bind: string
  mode: string
  active: boolean
  tailscale?: { mode: string }
}

/**
 * GET /api/gateways/discover
 * Scans OS-level users for OpenClaw gateway configs and checks if they're running.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const discovered: DiscoveredGateway[] = []

  // Scan /home/* for openclaw configs
  let homeDirs: string[] = []
  try {
    homeDirs = readdirSync('/home', { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch {
    return NextResponse.json({ gateways: [] })
  }

  for (const user of homeDirs) {
    const configPath = join('/home', user, '.openclaw', 'openclaw.json')
    try {
      const raw = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(raw)
      const gw = config?.gateway
      if (!gw || typeof gw.port !== 'number') continue

      // Check if the gateway is actually listening on its port
      let active = false
      try {
        const result = execFileSync('ss', ['-ltn', `sport = :${gw.port}`], {
          encoding: 'utf-8',
          timeout: 2000,
        })
        active = result.includes('LISTEN')
      } catch {
        active = false
      }

      discovered.push({
        user,
        port: gw.port,
        bind: gw.bind || 'unknown',
        mode: gw.mode || 'unknown',
        active,
        ...(gw.tailscale?.mode ? { tailscale: { mode: gw.tailscale.mode } } : {}),
      })
    } catch {
      // No config or unreadable — skip
    }
  }

  return NextResponse.json({ gateways: discovered })
}
