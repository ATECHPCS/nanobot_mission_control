/**
 * Health monitor singleton.
 *
 * Runs periodic health checks on discovered agents and broadcasts
 * status changes via eventBus for SSE consumption.
 *
 * Stored on globalThis to survive Next.js HMR in development.
 */

import { eventBus } from '@/lib/event-bus'
import { discoverAgents } from '@/lib/agent-discovery'
import { checkAgentHealth } from '@/lib/agent-health'
import type { AgentHealthSnapshot } from '@/types/agent-health'

class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastSnapshot: Map<string, AgentHealthSnapshot> = new Map()
  private intervalMs = 30_000
  private ticking = false

  /**
   * Start the health check loop. Idempotent -- no-op if already running.
   * Runs an immediate check, then repeats on the configured interval.
   */
  start(): void {
    if (this.intervalId) return
    this.tick()
    this.intervalId = setInterval(() => this.tick(), this.intervalMs)
  }

  /**
   * Stop the health check loop.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Change the polling interval. Restarts the loop if currently running.
   */
  setInterval(ms: number): void {
    this.intervalMs = ms
    if (this.intervalId) {
      this.stop()
      this.start()
    }
  }

  /**
   * Run a single health check tick.
   * Discovers agents, checks health, detects changes, broadcasts events.
   */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true

    try {
      const agents = discoverAgents()
      const snapshots: AgentHealthSnapshot[] = []

      for (const agent of agents) {
        const snapshot = await checkAgentHealth(agent)
        snapshots.push(snapshot)
      }

      // Detect new agents
      const currentIds = new Set(snapshots.map(s => s.id))
      const previousIds = new Set(this.lastSnapshot.keys())

      for (const snapshot of snapshots) {
        if (!previousIds.has(snapshot.id)) {
          // New agent discovered
          eventBus.broadcast('agent.created', {
            id: snapshot.id,
            name: snapshot.name,
            status: snapshot.health.overall,
            health: snapshot.health,
          })
        } else {
          // Check for status changes
          const prev = this.lastSnapshot.get(snapshot.id)
          if (prev && prev.health.overall !== snapshot.health.overall) {
            eventBus.broadcast('agent.status_changed', {
              id: snapshot.id,
              name: snapshot.name,
              status: snapshot.health.overall,
              previousStatus: prev.health.overall,
              health: snapshot.health,
            })
          }
        }
      }

      // Detect removed agents
      for (const id of previousIds) {
        if (!currentIds.has(id)) {
          eventBus.broadcast('agent.deleted', { id })
        }
      }

      // Preserve dismissed state from previous snapshot
      for (const snapshot of snapshots) {
        const prev = this.lastSnapshot.get(snapshot.id)
        if (prev?.errorsDismissed) {
          snapshot.errorsDismissed = true
        }
      }

      // Update cache
      this.lastSnapshot.clear()
      for (const s of snapshots) {
        this.lastSnapshot.set(s.id, s)
      }
    } finally {
      this.ticking = false
    }
  }

  /**
   * Get all cached agent health snapshots.
   */
  getSnapshot(): AgentHealthSnapshot[] {
    return Array.from(this.lastSnapshot.values())
  }

  /**
   * Get a single agent's health snapshot by ID.
   */
  getAgentSnapshot(id: string): AgentHealthSnapshot | undefined {
    return this.lastSnapshot.get(id)
  }

  /**
   * Dismiss errors for an agent. Clears the error badge in the cached snapshot.
   * Broadcasts agent.status_changed so UI updates.
   */
  dismissErrors(id: string): boolean {
    const snapshot = this.lastSnapshot.get(id)
    if (!snapshot) return false

    snapshot.errorsDismissed = true
    snapshot.errors = []

    eventBus.broadcast('agent.status_changed', {
      id: snapshot.id,
      name: snapshot.name,
      status: snapshot.health.overall,
      health: snapshot.health,
      errorsDismissed: true,
    })

    return true
  }
}

// Survive HMR in development via globalThis
const g = globalThis as typeof globalThis & { __healthMonitor?: HealthMonitor }
export const healthMonitor = g.__healthMonitor ?? new HealthMonitor()
g.__healthMonitor = healthMonitor
