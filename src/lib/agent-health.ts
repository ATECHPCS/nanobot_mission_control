/**
 * Server-side agent health checking service.
 *
 * Checks four health dimensions for each agent:
 * 1. Process liveness (TCP port check)
 * 2. Activity recency (JSONL session file timestamps)
 * 3. Error state (JSONL tool errors + error log parsing)
 * 4. Channel status (config + error analysis)
 *
 * Performance: reads only last N bytes of files (not entire files).
 */

import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { execSync } from 'node:child_process'
import type {
  DiscoveredAgent,
  HealthLevel,
  HealthDimension,
  CompositeHealth,
  SessionActivity,
  AgentError,
  ChannelStatus,
  AgentHealthSnapshot,
} from '@/types/agent-health'

// ---------------------------------------------------------------------------
// Port Liveness
// ---------------------------------------------------------------------------

/**
 * Check if a TCP port is accepting connections.
 * Uses net.Socket with a timeout. Does not validate the service identity.
 */
export function checkPortAlive(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

// ---------------------------------------------------------------------------
// Process Liveness (by command pattern)
// ---------------------------------------------------------------------------

/**
 * Check if a nanobot gateway process is running for the given port.
 * Falls back from exact --port match to any gateway without --port flag
 * (covers the default-port case where nanobot reads port from config).
 */
export function checkProcessRunning(port: number): boolean {
  try {
    execSync(`pgrep -f "nanobot gateway.*--port ${port}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    // No exact port match
  }

  try {
    // Check for nanobot gateway without --port flag (uses default from config)
    const output = execSync(
      'ps -eo command | grep "[n]anobot gateway" | grep -v -- "--port"',
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    if (output.length > 0) return true
  } catch {
    // No match
  }

  return false
}

// ---------------------------------------------------------------------------
// Efficient File Tail Reading
// ---------------------------------------------------------------------------

/**
 * Read the last N bytes of a file and return non-empty lines.
 * Drops the first line if reading from middle of file (may be partial).
 * This avoids reading entire JSONL files which can be 87KB+.
 */
export function readLastLines(filePath: string, maxBytes = 4096): string[] {
  const stat = fs.statSync(filePath)
  if (stat.size === 0) return []

  const bytesToRead = Math.min(maxBytes, stat.size)
  const buffer = Buffer.alloc(bytesToRead)
  const fd = fs.openSync(filePath, 'r')

  try {
    fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead)
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    // Drop potentially partial first line if we didn't start at file beginning
    if (stat.size > bytesToRead && lines.length > 0) {
      lines.shift()
    }
    return lines
  } finally {
    fs.closeSync(fd)
  }
}

// ---------------------------------------------------------------------------
// Session Activity
// ---------------------------------------------------------------------------

/**
 * Get the latest activity from an agent's JSONL session files.
 * Reads only the last few KB of the most recently modified file.
 * Walks backward to find the last assistant message for activity text.
 * Skips _type: "metadata" lines.
 */
export function getLatestActivity(sessionsDir: string): SessionActivity | null {
  if (!fs.existsSync(sessionsDir)) return null

  const files = fs
    .readdirSync(sessionsDir)
    .filter((f: string) => f.endsWith('.jsonl'))
    .map((f: string) => ({
      name: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  if (files.length === 0) return null

  const filePath = path.join(sessionsDir, files[0].name)
  const lines = readLastLines(filePath, 4096)

  // Walk backward to find last assistant message for activity text
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i])
      // Skip metadata lines
      if (entry._type === 'metadata') continue
      if (entry.role === 'assistant' && entry.content) {
        return {
          timestamp: entry.timestamp,
          content: typeof entry.content === 'string' ? entry.content.slice(0, 100) : null,
          role: entry.role,
        }
      }
    } catch {
      continue
    }
  }

  // Fallback: use timestamp from last non-metadata line regardless of role
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i])
      if (entry._type === 'metadata') continue
      return {
        timestamp: entry.timestamp,
        content: null,
        role: entry.role || 'unknown',
      }
    } catch {
      continue
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Error Detection
// ---------------------------------------------------------------------------

/**
 * Detect errors from both JSONL session files and error log files.
 *
 * JSONL errors: tool errors (role: "tool" with "Error:" in content),
 *               rate limits (content contains "rate limit").
 * Error log errors: Python tracebacks, channel-specific errors.
 *
 * Only returns errors after the `since` timestamp for JSONL entries.
 * Error log entries are approximate (logs may lack timestamps).
 */
export function detectErrors(
  workspacePath: string,
  agentName: string,
  since: Date
): AgentError[] {
  const errors: AgentError[] = []
  const sinceMs = since.getTime()

  // Source 1: JSONL session files
  const sessionsDir = path.join(workspacePath, 'sessions')
  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs
      .readdirSync(sessionsDir)
      .filter((f: string) => f.endsWith('.jsonl'))

    for (const file of sessionFiles) {
      const filePath = path.join(sessionsDir, file)
      try {
        const lines = readLastLines(filePath, 16384) // last 16KB

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (!entry.timestamp) continue
            const ts = new Date(entry.timestamp).getTime()
            if (ts < sinceMs) continue

            // Tool errors
            if (entry.role === 'tool' && typeof entry.content === 'string') {
              if (entry.content.includes('Error:') || entry.content.includes('error:')) {
                errors.push({
                  timestamp: entry.timestamp,
                  type: 'tool_error',
                  message: entry.content.slice(0, 200),
                  source: file,
                })
              }
            }

            // Rate limits
            if (entry.content && typeof entry.content === 'string' &&
                entry.content.toLowerCase().includes('rate limit')) {
              errors.push({
                timestamp: entry.timestamp,
                type: 'rate_limit',
                message: entry.content.slice(0, 200),
                source: file,
              })
            }
          } catch {
            continue
          }
        }
      } catch {
        continue
      }
    }
  }

  // Source 2: Error log files
  const logsDir = path.join(workspacePath, 'logs')
  const errorLogPath = path.join(logsDir, `${agentName}-error.log`)
  if (fs.existsSync(errorLogPath)) {
    try {
      const lines = readLastLines(errorLogPath, 32768) // last 32KB

      for (const line of lines) {
        // Telegram conflict (channel error)
        if (line.includes('telegram.error.Conflict')) {
          errors.push({
            timestamp: new Date().toISOString(),
            type: 'channel_error',
            message: 'Telegram bot conflict -- duplicate instance detected',
            source: `${agentName}-error.log`,
          })
        }

        // Generic Python traceback end patterns
        if (/^\w+Error:/.test(line) || /^\w+Exception:/.test(line)) {
          errors.push({
            timestamp: new Date().toISOString(),
            type: 'crash',
            message: line.slice(0, 200),
            source: `${agentName}-error.log`,
          })
        }
      }
    } catch {
      // Error reading log file -- skip silently
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Channel Status
// ---------------------------------------------------------------------------

/**
 * Determine channel statuses from agent config, process liveness, and errors.
 * Gateway process running implies channels are running (they're part of the gateway process).
 */
export function getChannelStatuses(
  agent: DiscoveredAgent,
  processAlive: boolean,
  errors: AgentError[]
): ChannelStatus[] {
  return Object.entries(agent.channels).map(([name, { enabled }]) => {
    // Find the most recent channel error for this channel
    const channelError = errors.find(
      e => e.type === 'channel_error' && e.message.toLowerCase().includes(name.toLowerCase())
    )

    return {
      name,
      enabled,
      connected: processAlive,
      lastError: channelError ? channelError.message : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Composite Health Score
// ---------------------------------------------------------------------------

/**
 * Compute a composite health score across four dimensions.
 * Uses worst-dimension-wins logic for overall status.
 */
export function computeCompositeHealth(data: {
  processAlive: boolean
  lastActivityMs: number | null
  errorCount24h: number
  criticalErrors: boolean
  channelsDown: string[]
  totalChannels: number
}): CompositeHealth {
  const now = Date.now()
  const ONE_HOUR = 60 * 60 * 1000

  const process: HealthDimension = data.processAlive
    ? { level: 'green', reason: 'Gateway process is running' }
    : { level: 'red', reason: 'Gateway process is not responding' }

  const activity: HealthDimension = (() => {
    if (data.lastActivityMs === null) return { level: 'yellow', reason: 'No activity data found' }
    const elapsed = now - data.lastActivityMs
    if (elapsed < ONE_HOUR) return { level: 'green', reason: `Active ${Math.round(elapsed / 60000)}m ago` }
    return { level: 'yellow', reason: `No activity for ${Math.round(elapsed / 3600000)}h` }
  })()

  const errors: HealthDimension = (() => {
    if (data.criticalErrors) return { level: 'red', reason: 'Critical errors detected' }
    if (data.errorCount24h > 0) return { level: 'yellow', reason: `${data.errorCount24h} errors in last 24h` }
    return { level: 'green', reason: 'No errors' }
  })()

  const channels: HealthDimension = (() => {
    if (data.totalChannels === 0) return { level: 'green', reason: 'No channels configured' }
    if (data.channelsDown.length === 0) return { level: 'green', reason: 'All channels connected' }
    if (data.channelsDown.length === data.totalChannels) return { level: 'red', reason: 'All channels down' }
    return { level: 'yellow', reason: `${data.channelsDown.join(', ')} disconnected` }
  })()

  // Worst dimension wins
  const levels: HealthLevel[] = [process.level, activity.level, errors.level, channels.level]
  const overall: HealthLevel = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green'

  return { overall, dimensions: { process, activity, errors, channels } }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all health checks for a single agent and return a complete snapshot.
 */
export async function checkAgentHealth(agent: DiscoveredAgent): Promise<AgentHealthSnapshot> {
  const portAlive = await checkPortAlive(agent.gatewayPort, agent.gatewayHost)
  // Process is alive if the HTTP port responds OR the gateway process is running
  const processAlive = portAlive || (agent.gatewayPort > 0 && checkProcessRunning(agent.gatewayPort))

  const sessionsDir = path.join(agent.workspacePath, 'sessions')
  const lastActivity = getLatestActivity(sessionsDir)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24 hours
  const errors = detectErrors(agent.workspacePath, agent.id, since)

  const channels = getChannelStatuses(agent, processAlive, errors)

  // Determine channels that are down
  const channelsDown = channels
    .filter(c => c.enabled && !c.connected)
    .map(c => c.name)

  // Determine if there are critical errors (process dead or all channels down)
  const criticalErrors = errors.some(e => e.type === 'crash') ||
    (channels.length > 0 && channelsDown.length === channels.length)

  const lastActivityMs = lastActivity
    ? new Date(lastActivity.timestamp).getTime()
    : null

  const health = computeCompositeHealth({
    processAlive,
    lastActivityMs,
    errorCount24h: errors.length,
    criticalErrors,
    channelsDown,
    totalChannels: channels.length,
  })

  return {
    id: agent.id,
    name: agent.name,
    agent,
    health,
    lastActivity,
    errors,
    channels,
    checkedAt: Date.now(),
  }
}
