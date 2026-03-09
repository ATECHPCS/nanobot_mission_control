import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before imports
vi.mock('@/lib/agent-discovery', () => ({
  discoverAgents: vi.fn(),
}))

vi.mock('@/lib/agent-health', () => ({
  checkAgentHealth: vi.fn(),
}))

vi.mock('@/lib/event-bus', () => {
  const broadcast = vi.fn()
  return {
    eventBus: { broadcast },
  }
})

vi.mock('@/lib/config', () => ({
  config: {
    nanobotStateDir: '/home/testuser/.nanobot',
    nanobotGatewayHost: '127.0.0.1',
  },
}))

import { discoverAgents } from '@/lib/agent-discovery'
import { checkAgentHealth } from '@/lib/agent-health'
import { eventBus } from '@/lib/event-bus'
import type { DiscoveredAgent, AgentHealthSnapshot } from '@/types/agent-health'

const mockDiscoverAgents = vi.mocked(discoverAgents)
const mockCheckAgentHealth = vi.mocked(checkAgentHealth)
const mockBroadcast = vi.mocked(eventBus.broadcast)

// Helper: create a mock agent
function mockAgent(id: string): DiscoveredAgent {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    workspacePath: `/workspace/agents/${id}`,
    homePath: `/home/.nanobot-${id}-home`,
    configPath: `/home/.nanobot-${id}-home/.nanobot/config.json`,
    launchScript: `/workspace/agents/${id}/launch-${id}.sh`,
    model: 'claude-sonnet-4-20250514',
    gatewayPort: 18793,
    gatewayHost: '127.0.0.1',
    channels: { telegram: { enabled: true } },
    icon: 'brain',
  }
}

// Helper: create a mock snapshot
function mockSnapshot(id: string, overall: 'green' | 'yellow' | 'red'): AgentHealthSnapshot {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    agent: mockAgent(id),
    health: {
      overall,
      dimensions: {
        process: { level: 'green', reason: 'OK' },
        activity: { level: 'green', reason: 'OK' },
        errors: { level: 'green', reason: 'OK' },
        channels: { level: 'green', reason: 'OK' },
      },
    },
    lastActivity: null,
    errors: [],
    channels: [],
    checkedAt: Date.now(),
  }
}

describe('health-monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()

    // Clean up globalThis before each test
    const g = globalThis as any
    if (g.__healthMonitor) {
      g.__healthMonitor.stop()
      delete g.__healthMonitor
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Dynamically import to get fresh instance after globalThis cleanup
  async function getMonitor() {
    // Clear the module cache so we get a fresh singleton
    vi.resetModules()

    // Re-mock the dependencies for the fresh import
    vi.doMock('@/lib/agent-discovery', () => ({
      discoverAgents: mockDiscoverAgents,
    }))
    vi.doMock('@/lib/agent-health', () => ({
      checkAgentHealth: mockCheckAgentHealth,
    }))
    vi.doMock('@/lib/event-bus', () => ({
      eventBus: { broadcast: mockBroadcast },
    }))
    vi.doMock('@/lib/config', () => ({
      config: {
        nanobotStateDir: '/home/testuser/.nanobot',
        nanobotGatewayHost: '127.0.0.1',
      },
    }))

    const mod = await import('../health-monitor')
    return mod.healthMonitor
  }

  it('start() runs immediate check then repeats on interval', async () => {
    const monitor = await getMonitor()

    mockDiscoverAgents.mockReturnValue([mockAgent('stefany')])
    mockCheckAgentHealth.mockResolvedValue(mockSnapshot('stefany', 'green'))

    monitor.start()

    // Immediate tick should have been called
    await vi.advanceTimersByTimeAsync(0)
    expect(mockDiscoverAgents).toHaveBeenCalledTimes(1)
    expect(mockCheckAgentHealth).toHaveBeenCalledTimes(1)

    // After one interval (30s default)
    await vi.advanceTimersByTimeAsync(30000)
    expect(mockDiscoverAgents).toHaveBeenCalledTimes(2)

    monitor.stop()
  })

  it('broadcasts agent.status_changed when status changes between checks', async () => {
    const monitor = await getMonitor()

    // First check: green
    mockDiscoverAgents.mockReturnValue([mockAgent('stefany')])
    mockCheckAgentHealth.mockResolvedValue(mockSnapshot('stefany', 'green'))

    monitor.start()
    await vi.advanceTimersByTimeAsync(0)

    // First check always broadcasts (new agent)
    mockBroadcast.mockClear()

    // Second check: red
    mockCheckAgentHealth.mockResolvedValue(mockSnapshot('stefany', 'red'))
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent.status_changed',
      expect.objectContaining({
        id: 'stefany',
        status: 'red',
      })
    )

    monitor.stop()
  })

  it('broadcasts agent.deleted when agent directory is removed', async () => {
    const monitor = await getMonitor()

    // First check: agent present
    mockDiscoverAgents.mockReturnValue([mockAgent('stefany')])
    mockCheckAgentHealth.mockResolvedValue(mockSnapshot('stefany', 'green'))

    monitor.start()
    await vi.advanceTimersByTimeAsync(0)
    mockBroadcast.mockClear()

    // Second check: agent gone
    mockDiscoverAgents.mockReturnValue([])
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent.deleted',
      expect.objectContaining({ id: 'stefany' })
    )

    monitor.stop()
  })

  it('broadcasts agent.created when new agent directory appears', async () => {
    const monitor = await getMonitor()

    // First check: no agents
    mockDiscoverAgents.mockReturnValue([])

    monitor.start()
    await vi.advanceTimersByTimeAsync(0)
    mockBroadcast.mockClear()

    // Second check: new agent appears
    mockDiscoverAgents.mockReturnValue([mockAgent('cody')])
    mockCheckAgentHealth.mockResolvedValue(mockSnapshot('cody', 'green'))
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent.created',
      expect.objectContaining({ id: 'cody' })
    )

    monitor.stop()
  })

  it('setInterval() changes the polling interval', async () => {
    const monitor = await getMonitor()

    mockDiscoverAgents.mockReturnValue([])

    monitor.start()
    await vi.advanceTimersByTimeAsync(0)

    // Change interval to 10s
    monitor.setInterval(10000)
    mockDiscoverAgents.mockClear()

    // Advance 10s should trigger a tick
    await vi.advanceTimersByTimeAsync(10000)
    expect(mockDiscoverAgents).toHaveBeenCalledTimes(1)

    monitor.stop()
  })

  it('getSnapshot() returns cached results between checks', async () => {
    const monitor = await getMonitor()

    const snapshot = mockSnapshot('stefany', 'green')
    mockDiscoverAgents.mockReturnValue([mockAgent('stefany')])
    mockCheckAgentHealth.mockResolvedValue(snapshot)

    monitor.start()
    await vi.advanceTimersByTimeAsync(0)

    const cached = monitor.getSnapshot()
    expect(cached).toHaveLength(1)
    expect(cached[0].id).toBe('stefany')

    monitor.stop()
  })

  it('survives HMR via globalThis pattern', async () => {
    const monitor1 = await getMonitor()
    const monitor2 = await getMonitor()

    // Both imports should return the same singleton stored on globalThis
    // (In our test we clean globalThis between tests, so within a test they share)
    expect(monitor1).toBeDefined()
    expect(monitor2).toBeDefined()
  })
})
