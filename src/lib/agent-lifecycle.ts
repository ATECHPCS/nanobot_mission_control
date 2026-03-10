/**
 * Server-side agent process lifecycle management.
 *
 * Provides functions to start, stop, and restart nanobot agent processes.
 * All process management happens server-side -- the browser never
 * spawns processes or talks to agent ports directly.
 *
 * Uses port-based PID lookup (lsof) and process group kill (PGID)
 * to cleanly manage agent process trees without zombies.
 */

import { spawn, execSync } from 'node:child_process'
import type { DiscoveredAgent } from '@/types/agent-health'

// ---------------------------------------------------------------------------
// PID / Port Utilities
// ---------------------------------------------------------------------------

/**
 * Find the PID of the process listening on a given port.
 * Uses `lsof -ti :{port}` which returns one PID per line.
 * Returns the first PID found, or null if no process is on that port.
 */
export function findPidByPort(port: number): number | null {
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim()
    if (!output) return null
    const pid = parseInt(output.split('\n')[0], 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null // No process on that port (lsof exits non-zero)
  }
}

/**
 * Get the process group ID (PGID) for a given PID.
 * Used to kill the entire process tree (agent + all child processes).
 */
export function getProcessGroupId(pid: number): number | null {
  try {
    const output = execSync(`ps -o pgid= -p ${pid}`, { encoding: 'utf-8' }).trim()
    const pgid = parseInt(output, 10)
    return isNaN(pgid) ? null : pgid
  } catch {
    return null
  }
}

/**
 * Check if a port is available (nothing listening on it).
 */
export function isPortAvailable(port: number): boolean {
  return findPidByPort(port) === null
}

/**
 * Find which discovered agent is using a given port.
 * Useful for port conflict error messages.
 */
export function findPortOwnerAgent(
  port: number,
  agents: DiscoveredAgent[]
): DiscoveredAgent | null {
  return agents.find(a => a.gatewayPort === port) ?? null
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Maximum stderr bytes to capture for error diagnosis */
const MAX_STDERR_BYTES = 4096

/**
 * Start an agent by executing its launch script (or inferred command for root agent)
 * as a fully detached process that survives dashboard restart.
 *
 * - Sub-agents: `bash <launchScript>` (script sets HOME, BOT_ID, etc.)
 * - Root agent (launchScript === ''): `nanobot gateway --port <port>` with system HOME
 */
export function startAgent(
  agent: DiscoveredAgent
): { pid: number | null; error?: string } {
  try {
    const isRootAgent = agent.launchScript === ''

    const command = isRootAgent ? 'nanobot' : 'bash'
    const args = isRootAgent
      ? ['gateway', '--port', String(agent.gatewayPort)]
      : [agent.launchScript]

    const child = spawn(command, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // capture stderr only
      env: process.env,
    })

    // Collect stderr for error diagnosis (capped)
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES)
      }
    })

    // Allow dashboard to exit without killing agent
    child.unref()

    return { pid: child.pid ?? null }
  } catch (err: any) {
    return { pid: null, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Stop
// ---------------------------------------------------------------------------

/**
 * Stop an agent by killing its entire process group.
 * Uses port-based PID lookup, then PGID resolution, then process group kill.
 *
 * @param port - The gateway port the agent is listening on
 * @param signal - SIGTERM (graceful) or SIGKILL (force)
 */
export function stopAgent(
  port: number,
  signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
): { killed: boolean; pid: number | null; error?: string } {
  const pid = findPidByPort(port)
  if (!pid) {
    return { killed: false, pid: null, error: 'No process found on port' }
  }

  const pgid = getProcessGroupId(pid)
  if (!pgid) {
    return { killed: false, pid, error: 'Could not determine process group' }
  }

  try {
    // Kill the entire process group (negative PGID)
    process.kill(-pgid, signal)
    return { killed: true, pid }
  } catch (err: any) {
    return { killed: false, pid, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Wait / Restart
// ---------------------------------------------------------------------------

/**
 * Poll until the port is released (no process listening).
 * Returns true if port was released before timeout, false otherwise.
 */
export async function waitForPortRelease(
  port: number,
  timeoutMs = 5000
): Promise<boolean> {
  const start = Date.now()
  const pollMs = 200

  while (Date.now() - start < timeoutMs) {
    if (isPortAvailable(port)) return true
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }

  return isPortAvailable(port)
}

/**
 * Restart an agent: stop, wait for port release, then start.
 * Atomic operation -- the caller sees only the final start result.
 */
export async function restartAgent(
  agent: DiscoveredAgent
): Promise<{ pid: number | null; error?: string }> {
  // Stop the agent
  const stopResult = stopAgent(agent.gatewayPort)
  if (!stopResult.killed && stopResult.error !== 'No process found on port') {
    return { pid: null, error: `Stop failed: ${stopResult.error}` }
  }

  // Wait for port to be released
  if (stopResult.killed) {
    const released = await waitForPortRelease(agent.gatewayPort)
    if (!released) {
      return { pid: null, error: 'Port not released after stop -- try force kill' }
    }
  }

  // Start the agent
  return startAgent(agent)
}
