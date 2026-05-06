import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks -- these run before vi.mock factory
const { mockExecSync, mockSpawn } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockSpawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { execSync: mockExecSync, spawn: mockSpawn },
  execSync: mockExecSync,
  spawn: mockSpawn,
}))

import {
  findPidByPort,
  getProcessGroupId,
  isPortAvailable,
  startAgent,
  stopAgent,
  waitForPortRelease,
  restartAgent,
  findPortOwnerAgent,
} from '../agent-lifecycle'
import type { DiscoveredAgent } from '@/types/agent-health'

// Helper to build a mock DiscoveredAgent
function makeAgent(overrides: Partial<DiscoveredAgent> = {}): DiscoveredAgent {
  return {
    id: 'stefany',
    name: 'Stefany',
    workspacePath: '/home/user/.nanobot/workspace/agents/stefany',
    homePath: '/home/user/.nanobot-stefany-home',
    configPath: '/home/user/.nanobot-stefany-home/.nanobot/config.json',
    launchScript: '/home/user/.nanobot/workspace/agents/stefany/launch-stefany.sh',
    model: 'claude-sonnet-4-20250514',
    gatewayPort: 18793,
    gatewayHost: '127.0.0.1',
    channels: { telegram: { enabled: true } },
    ...overrides,
  }
}

describe('agent-lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('findPidByPort', () => {
    it('returns PID when lsof outputs a number', () => {
      mockExecSync.mockReturnValue('12345\n')
      expect(findPidByPort(18793)).toBe(12345)
      expect(mockExecSync).toHaveBeenCalledWith('lsof -ti :18793', { encoding: 'utf-8' })
    })

    it('returns first PID when lsof outputs multiple PIDs', () => {
      mockExecSync.mockReturnValue('12345\n67890\n')
      expect(findPidByPort(18793)).toBe(12345)
    })

    it('returns null when lsof outputs empty string', () => {
      mockExecSync.mockReturnValue('')
      expect(findPidByPort(18793)).toBeNull()
    })

    it('returns null when lsof throws (no process on port)', () => {
      mockExecSync.mockImplementation(() => { throw new Error('exit code 1') })
      expect(findPidByPort(18793)).toBeNull()
    })
  })

  describe('getProcessGroupId', () => {
    it('returns PGID when ps outputs a number', () => {
      mockExecSync.mockReturnValue('  12345\n')
      expect(getProcessGroupId(12345)).toBe(12345)
      expect(mockExecSync).toHaveBeenCalledWith('ps -o pgid= -p 12345', { encoding: 'utf-8' })
    })

    it('returns null when ps throws', () => {
      mockExecSync.mockImplementation(() => { throw new Error('no such process') })
      expect(getProcessGroupId(99999)).toBeNull()
    })
  })

  describe('isPortAvailable', () => {
    it('returns true when no process on port', () => {
      mockExecSync.mockImplementation(() => { throw new Error('exit code 1') })
      expect(isPortAvailable(18793)).toBe(true)
    })

    it('returns false when process found on port', () => {
      mockExecSync.mockReturnValue('12345\n')
      expect(isPortAvailable(18793)).toBe(false)
    })
  })

  describe('startAgent', () => {
    it('calls spawn with bash + launchScript for sub-agent', () => {
      const mockChild = {
        pid: 54321,
        stderr: { on: vi.fn() },
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild)

      const agent = makeAgent()
      const result = startAgent(agent)

      expect(result).toEqual({ pid: 54321 })
      expect(mockSpawn).toHaveBeenCalledWith(
        'bash',
        [agent.launchScript],
        expect.objectContaining({
          detached: true,
          stdio: ['ignore', 'ignore', 'pipe'],
        })
      )
      expect(mockChild.unref).toHaveBeenCalled()
    })

    it('calls spawn with nanobot gateway args for root agent (empty launchScript)', () => {
      const mockChild = {
        pid: 54322,
        stderr: { on: vi.fn() },
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild)

      const agent = makeAgent({ launchScript: '', gatewayPort: 18790 })
      const result = startAgent(agent)

      expect(result).toEqual({ pid: 54322 })
      expect(mockSpawn).toHaveBeenCalledWith(
        'nanobot',
        ['gateway', '--port', '18790'],
        expect.objectContaining({
          detached: true,
          stdio: ['ignore', 'ignore', 'pipe'],
        })
      )
      expect(mockChild.unref).toHaveBeenCalled()
    })

    it('returns error on spawn failure', () => {
      mockSpawn.mockImplementation(() => { throw new Error('ENOENT') })

      const agent = makeAgent()
      const result = startAgent(agent)

      expect(result).toEqual({ pid: null, error: 'ENOENT' })
    })

    it('returns pid: null when child.pid is undefined', () => {
      const mockChild = {
        pid: undefined,
        stderr: { on: vi.fn() },
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild)

      const agent = makeAgent()
      const result = startAgent(agent)

      expect(result).toEqual({ pid: null })
    })
  })

  describe('stopAgent', () => {
    it('kills process group with SIGTERM by default', () => {
      // findPidByPort returns 12345
      mockExecSync.mockReturnValueOnce('12345\n')
      // findLaunchdService — empty launchctl list, no match
      mockExecSync.mockReturnValueOnce('')
      // getProcessGroupId returns 12340
      mockExecSync.mockReturnValueOnce('  12340\n')

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

      const result = stopAgent(18793)

      expect(result).toEqual({ killed: true, pid: 12345 })
      expect(killSpy).toHaveBeenCalledWith(-12340, 'SIGTERM')

      killSpy.mockRestore()
    })

    it('kills process group with SIGKILL when specified', () => {
      mockExecSync.mockReturnValueOnce('12345\n')
      mockExecSync.mockReturnValueOnce('') // findLaunchdService — no match
      mockExecSync.mockReturnValueOnce('  12340\n')

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

      const result = stopAgent(18793, 'SIGKILL')

      expect(result).toEqual({ killed: true, pid: 12345 })
      expect(killSpy).toHaveBeenCalledWith(-12340, 'SIGKILL')

      killSpy.mockRestore()
    })

    it('returns error when no process found on port', () => {
      mockExecSync.mockImplementation(() => { throw new Error('exit code 1') })

      const result = stopAgent(18793)

      expect(result).toEqual({ killed: false, pid: null, error: 'No process found' })
    })

    it('returns error when PGID lookup fails', () => {
      mockExecSync.mockReturnValueOnce('12345\n')
      mockExecSync.mockReturnValueOnce('') // findLaunchdService — no match
      mockExecSync.mockImplementationOnce(() => { throw new Error('no such process') })

      const result = stopAgent(18793)

      expect(result).toEqual({ killed: false, pid: 12345, error: 'Could not determine process group' })
    })

    it('returns error when process.kill throws', () => {
      mockExecSync.mockReturnValueOnce('12345\n')
      mockExecSync.mockReturnValueOnce('') // findLaunchdService — no match
      mockExecSync.mockReturnValueOnce('  12340\n')

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH')
      })

      const result = stopAgent(18793)

      expect(result).toEqual({ killed: false, pid: 12345, error: 'ESRCH' })

      killSpy.mockRestore()
    })
  })

  describe('findPortOwnerAgent', () => {
    it('returns agent that owns the given port', () => {
      const agents = [
        makeAgent({ id: 'stefany', gatewayPort: 18793 }),
        makeAgent({ id: 'cody', gatewayPort: 18792 }),
      ]
      expect(findPortOwnerAgent(18793, agents)).toEqual(agents[0])
    })

    it('returns null when no agent owns the port', () => {
      const agents = [makeAgent({ gatewayPort: 18793 })]
      expect(findPortOwnerAgent(9999, agents)).toBeNull()
    })
  })

  describe('waitForPortRelease', () => {
    it('resolves true when port is released', async () => {
      // First call: port in use, second call: port free
      mockExecSync
        .mockReturnValueOnce('12345\n')
        .mockImplementationOnce(() => { throw new Error('exit code 1') })

      const result = await waitForPortRelease(18793, 2000)
      expect(result).toBe(true)
    })

    it('resolves false when timeout reached', async () => {
      // Port stays in use
      mockExecSync.mockReturnValue('12345\n')

      const result = await waitForPortRelease(18793, 500)
      expect(result).toBe(false)
    }, 10000)
  })

  describe('restartAgent', () => {
    it('stops then starts the agent', async () => {
      // stopAgent: findPidByPort returns PID, findLaunchdService no match, getProcessGroupId returns PGID
      mockExecSync.mockReturnValueOnce('12345\n')
      mockExecSync.mockReturnValueOnce('') // findLaunchdService — no match
      mockExecSync.mockReturnValueOnce('  12340\n')

      // process.kill: returns true on real signals; throws on probe (signal 0)
      // so waitForProcessExit reports the process as gone immediately.
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal: any) => {
        if (signal === 0) throw new Error('ESRCH')
        return true
      }) as any)

      // startAgent: spawn succeeds
      const mockChild = {
        pid: 99999,
        stderr: { on: vi.fn() },
        unref: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild)

      const agent = makeAgent()
      const result = await restartAgent(agent)

      expect(result).toEqual({ pid: 99999 })
      expect(killSpy).toHaveBeenCalledWith(-12340, 'SIGTERM')
      expect(mockSpawn).toHaveBeenCalled()

      killSpy.mockRestore()
    })
  })
})
