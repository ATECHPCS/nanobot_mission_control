/**
 * Server-side agent discovery service.
 *
 * Scans ~/.nanobot/workspace/agents/ for nanobot agent directories,
 * reads their launch scripts to find HOME paths, and parses config.json
 * to build a list of discovered agents.
 *
 * Filesystem is source of truth -- no DB caching.
 * Synchronous reads are acceptable for <10 agents on server side.
 */

import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/lib/config'
import type { DiscoveredAgent } from '@/types/agent-health'

/**
 * Scan the agents workspace directory and return all valid discovered agents.
 * Skips hidden directories and directories missing required files.
 * Safe to call repeatedly -- each call rescans the filesystem.
 */
export function discoverAgents(): DiscoveredAgent[] {
  const agentsDir = path.join(config.nanobotStateDir, 'workspace', 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true })

  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => buildAgentFromDirectory(agentsDir, e.name))
    .filter((a): a is DiscoveredAgent => a !== null)
}

/**
 * Build a DiscoveredAgent from a workspace directory.
 * Returns null if required files are missing or malformed.
 */
function buildAgentFromDirectory(agentsDir: string, name: string): DiscoveredAgent | null {
  const workspacePath = path.join(agentsDir, name)

  // Find launch script
  const launchScript = findLaunchScript(workspacePath, name)
  if (!launchScript) return null

  // Parse HOME from launch script
  let homePath: string
  try {
    homePath = parseHomeFromLaunchScript(launchScript)
  } catch {
    return null
  }

  // Read config from agent's HOME
  const configPath = path.join(homePath, '.nanobot', 'config.json')
  if (!fs.existsSync(configPath)) return null

  const agentConfig = readAgentConfig(configPath)
  if (!agentConfig) return null

  // Try to read icon from IDENTITY.md if not in config
  let icon = agentConfig.icon
  if (!icon) {
    icon = readIconFromIdentity(workspacePath)
  }

  return {
    id: name,
    name: titleCase(name),
    workspacePath,
    homePath,
    configPath,
    launchScript,
    model: agentConfig.model,
    gatewayPort: agentConfig.gatewayPort,
    gatewayHost: agentConfig.gatewayHost,
    channels: agentConfig.channels,
    icon,
  }
}

/**
 * Find the launch script for an agent.
 * Looks for launch-{name}.sh first, then any launch-*.sh as fallback.
 */
export function findLaunchScript(workspacePath: string, agentName: string): string | null {
  const exactPath = path.join(workspacePath, `launch-${agentName}.sh`)
  if (fs.existsSync(exactPath)) return exactPath

  // Fallback: look for any launch-*.sh
  try {
    const entries = fs.readdirSync(workspacePath)
    const launchFile = entries.find(
      (e: string) => e.startsWith('launch-') && e.endsWith('.sh')
    )
    return launchFile ? path.join(workspacePath, launchFile) : null
  } catch {
    return null
  }
}

/**
 * Parse the HOME path from an agent's launch script.
 * Matches: export HOME="/path/to/home" or export HOME=/path/to/home
 * Throws if no HOME export is found.
 */
export function parseHomeFromLaunchScript(scriptPath: string): string {
  const content = fs.readFileSync(scriptPath, 'utf-8')
  // Match: export HOME="/path" or export HOME=/path (with or without quotes)
  const match = content.match(/export\s+HOME\s*=\s*"?([^"\n]+)"?/)
  if (!match) {
    throw new Error(`No HOME export found in ${scriptPath}`)
  }
  return match[1].trim()
}

interface AgentConfig {
  model: string
  gatewayPort: number
  gatewayHost: string
  channels: Record<string, { enabled: boolean }>
  icon?: string
}

/**
 * Read and parse an agent's config.json file.
 * Returns null on parse error or missing file.
 */
export function readAgentConfig(configPath: string): AgentConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      model: raw?.agents?.defaults?.model || 'unknown',
      gatewayPort: raw?.gateway?.port || 0,
      gatewayHost: raw?.gateway?.host || '127.0.0.1',
      channels: extractEnabledChannels(raw?.channels),
      icon: raw?.icon,
    }
  } catch {
    return null
  }
}

/**
 * Extract enabled channels from the config channels section.
 * Only includes channels where enabled is true.
 */
function extractEnabledChannels(
  channels: Record<string, any> | undefined
): Record<string, { enabled: boolean }> {
  if (!channels || typeof channels !== 'object') return {}

  const result: Record<string, { enabled: boolean }> = {}
  for (const [key, value] of Object.entries(channels)) {
    if (value && typeof value === 'object' && value.enabled) {
      result[key] = { enabled: true }
    }
  }
  return result
}

/**
 * Try to read an icon/emoji from the agent's IDENTITY.md file.
 * Looks for a line like "Emoji: brain" or "Icon: brain".
 */
function readIconFromIdentity(workspacePath: string): string | undefined {
  try {
    const identityPath = path.join(workspacePath, 'IDENTITY.md')
    if (!fs.existsSync(identityPath)) return undefined
    const content = fs.readFileSync(identityPath, 'utf-8')
    const match = content.match(/(?:Emoji|Icon)\s*:\s*(.+)/i)
    return match ? match[1].trim() : undefined
  } catch {
    return undefined
  }
}

/** Capitalize the first letter of a string */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
