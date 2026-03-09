// @ts-nocheck -- Vitest mock overloads confuse TypeScript's strict overload resolution
// for node:fs methods (openSync, readSync, statSync, etc.). Tests run correctly.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node:net
vi.mock('node:net', () => {
  const Socket = vi.fn()
  Socket.prototype.setTimeout = vi.fn().mockReturnThis()
  Socket.prototype.once = vi.fn().mockReturnThis()
  Socket.prototype.connect = vi.fn()
  Socket.prototype.destroy = vi.fn()
  return { default: { Socket }, Socket }
})

// Mock node:fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}))

// Mock agent-discovery
vi.mock('@/lib/agent-discovery', () => ({
  discoverAgents: vi.fn(),
}))

// Mock config
vi.mock('@/lib/config', () => ({
  config: {
    nanobotStateDir: '/home/testuser/.nanobot',
    nanobotGatewayHost: '127.0.0.1',
  },
}))

import fs from 'node:fs'
import net from 'node:net'
import {
  checkPortAlive,
  getLatestActivity,
  detectErrors,
  getChannelStatuses,
  computeCompositeHealth,
  checkAgentHealth,
  readLastLines,
} from '../agent-health'
import type { DiscoveredAgent, AgentError } from '@/types/agent-health'

const mockFs = vi.mocked(fs)
const mockNet = vi.mocked(net)

// Helper to create a mock DiscoveredAgent
function mockAgent(overrides: Partial<DiscoveredAgent> = {}): DiscoveredAgent {
  return {
    id: 'stefany',
    name: 'Stefany',
    workspacePath: '/home/testuser/.nanobot/workspace/agents/stefany',
    homePath: '/Users/testuser/.nanobot-stefany-home',
    configPath: '/Users/testuser/.nanobot-stefany-home/.nanobot/config.json',
    launchScript: '/home/testuser/.nanobot/workspace/agents/stefany/launch-stefany.sh',
    model: 'claude-sonnet-4-20250514',
    gatewayPort: 18793,
    gatewayHost: '127.0.0.1',
    channels: { telegram: { enabled: true } },
    icon: 'brain',
    ...overrides,
  }
}

// Helper: create JSONL content
function jsonl(...entries: object[]): string {
  return entries.map(e => JSON.stringify(e)).join('\n') + '\n'
}

describe('agent-health', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('checkPortAlive()', () => {
    it('returns true when port accepts TCP connection', async () => {
      const socketInstance = {
        setTimeout: vi.fn().mockReturnThis(),
        once: vi.fn().mockImplementation(function (this: any, event: string, cb: () => void) {
          if (event === 'connect') setTimeout(cb, 0)
          return this
        }),
        connect: vi.fn(),
        destroy: vi.fn(),
      }
      ;(net.Socket as any).mockImplementation(() => socketInstance)

      const result = await checkPortAlive(18793)
      expect(result).toBe(true)
      expect(socketInstance.connect).toHaveBeenCalledWith(18793, '127.0.0.1')
    })

    it('returns false when port refuses connection', async () => {
      const socketInstance = {
        setTimeout: vi.fn().mockReturnThis(),
        once: vi.fn().mockImplementation(function (this: any, event: string, cb: () => void) {
          if (event === 'error') setTimeout(cb, 0)
          return this
        }),
        connect: vi.fn(),
        destroy: vi.fn(),
      }
      ;(net.Socket as any).mockImplementation(() => socketInstance)

      const result = await checkPortAlive(18793)
      expect(result).toBe(false)
    })

    it('returns false on timeout', async () => {
      const socketInstance = {
        setTimeout: vi.fn().mockReturnThis(),
        once: vi.fn().mockImplementation(function (this: any, event: string, cb: () => void) {
          if (event === 'timeout') setTimeout(cb, 0)
          return this
        }),
        connect: vi.fn(),
        destroy: vi.fn(),
      }
      ;(net.Socket as any).mockImplementation(() => socketInstance)

      const result = await checkPortAlive(18793)
      expect(result).toBe(false)
    })
  })

  describe('readLastLines()', () => {
    it('reads last N bytes and returns lines', () => {
      const content = 'line1\nline2\nline3\n'
      const buf = Buffer.from(content)
      mockFs.statSync.mockReturnValue({ size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const lines = readLastLines('/path/to/file.jsonl', 4096)
      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('drops partial first line when reading from middle of file', () => {
      const content = 'artial line\nline2\nline3\n'
      const buf = Buffer.from(content)
      // File is bigger than maxBytes
      mockFs.statSync.mockReturnValue({ size: 10000 } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any, offset: any, length: any, position: any) => {
        const slice = buf.subarray(0, length)
        slice.copy(buffer)
        return slice.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const lines = readLastLines('/path/to/file.jsonl', buf.length)
      // First line should be dropped because it's partial
      expect(lines).toEqual(['line2', 'line3'])
    })

    it('returns empty array for empty file', () => {
      mockFs.statSync.mockReturnValue({ size: 0 } as any)

      const lines = readLastLines('/path/to/empty.jsonl')
      expect(lines).toEqual([])
    })
  })

  describe('getLatestActivity()', () => {
    it('returns null when sessions directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = getLatestActivity('/nonexistent/sessions')
      expect(result).toBeNull()
    })

    it('returns last assistant message content and timestamp from most recent JSONL', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockReturnValue(['session1.jsonl', 'session2.jsonl'] as any)
      mockFs.statSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('session1')) return { mtimeMs: 100 } as any
        return { mtimeMs: 200 } as any // session2 is more recent
      })

      // Mock readLastLines by mocking the underlying fs calls for session2
      const session2Content = jsonl(
        { _type: 'metadata', key: 'telegram:123', created_at: '2026-03-09' },
        { role: 'user', content: 'Hello', timestamp: '2026-03-09T10:00:00Z' },
        { role: 'assistant', content: 'Processing receipts from your email inbox now. Found 3 new receipts to analyze.', timestamp: '2026-03-09T10:00:05Z' },
        { role: 'tool', content: 'Result: success', timestamp: '2026-03-09T10:00:10Z' }
      )
      const buf = Buffer.from(session2Content)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)
      // statSync for the file read (readLastLines uses it)
      const originalStatSync = mockFs.statSync.getMockImplementation()
      mockFs.statSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('session1')) return { mtimeMs: 100 } as any
        if (path.includes('session2')) return { mtimeMs: 200, size: buf.length } as any
        return { size: buf.length } as any
      })

      const result = getLatestActivity('/sessions')

      expect(result).not.toBeNull()
      expect(result!.role).toBe('assistant')
      expect(result!.timestamp).toBe('2026-03-09T10:00:05Z')
      expect(result!.content).toContain('Processing receipts')
    })

    it('skips metadata lines (_type: "metadata")', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockReturnValue(['session.jsonl'] as any)
      mockFs.statSync.mockReturnValue({ mtimeMs: 100, size: 200 } as any)

      // Only metadata and a user message, no assistant
      const content = jsonl(
        { _type: 'metadata', key: 'telegram:123' },
        { role: 'user', content: 'Hello', timestamp: '2026-03-09T10:00:00Z' }
      )
      const buf = Buffer.from(content)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const result = getLatestActivity('/sessions')

      // Should fall back to the last non-metadata line
      expect(result).not.toBeNull()
      expect(result!.role).toBe('user')
      expect(result!.timestamp).toBe('2026-03-09T10:00:00Z')
    })

    it('falls back to timestamp from last line when no assistant message found', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockReturnValue(['session.jsonl'] as any)

      const content = jsonl(
        { role: 'user', content: 'Test', timestamp: '2026-03-09T10:00:00Z' },
        { role: 'tool', content: 'Result', timestamp: '2026-03-09T10:00:05Z' }
      )
      const buf = Buffer.from(content)
      mockFs.statSync.mockReturnValue({ mtimeMs: 100, size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const result = getLatestActivity('/sessions')

      expect(result).not.toBeNull()
      expect(result!.timestamp).toBe('2026-03-09T10:00:05Z')
      expect(result!.content).toBeNull()
    })
  })

  describe('detectErrors()', () => {
    it('finds tool_error entries from JSONL (role: "tool" with "Error:" in content)', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('sessions')) return ['session.jsonl'] as any
        if (path.includes('logs')) return [] as any
        return [] as any
      })

      const now = new Date()
      const recentTimestamp = new Date(now.getTime() - 3600000).toISOString() // 1h ago

      const content = jsonl(
        { role: 'tool', content: 'Error: Connection refused to database', timestamp: recentTimestamp },
        { role: 'assistant', content: 'I encountered an error.', timestamp: recentTimestamp }
      )
      const buf = Buffer.from(content)
      mockFs.statSync.mockReturnValue({ mtimeMs: now.getTime(), size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const errors = detectErrors('/workspace/stefany', 'stefany', new Date(now.getTime() - 86400000))

      expect(errors.some(e => e.type === 'tool_error')).toBe(true)
    })

    it('finds rate_limit entries from JSONL', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('sessions')) return ['session.jsonl'] as any
        if (path.includes('logs')) return [] as any
        return [] as any
      })

      const now = new Date()
      const recentTimestamp = new Date(now.getTime() - 3600000).toISOString()

      const content = jsonl(
        { role: 'assistant', content: 'Rate limit exceeded, waiting 60 seconds', timestamp: recentTimestamp }
      )
      const buf = Buffer.from(content)
      mockFs.statSync.mockReturnValue({ mtimeMs: now.getTime(), size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const errors = detectErrors('/workspace/stefany', 'stefany', new Date(now.getTime() - 86400000))

      expect(errors.some(e => e.type === 'rate_limit')).toBe(true)
    })

    it('finds crash entries from error log files (Python traceback patterns)', () => {
      mockFs.existsSync.mockImplementation((p: any) => {
        return true
      })
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('sessions')) return [] as any
        return [] as any
      })

      const now = new Date()
      const errorLogContent = [
        'Traceback (most recent call last):',
        '  File "main.py", line 42',
        'ConnectionError: Failed to connect to Telegram API',
      ].join('\n')
      const buf = Buffer.from(errorLogContent)
      mockFs.statSync.mockReturnValue({ mtimeMs: now.getTime(), size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const errors = detectErrors('/workspace/stefany', 'stefany', new Date(now.getTime() - 86400000))

      expect(errors.some(e => e.type === 'crash')).toBe(true)
      expect(errors.some(e => e.message.includes('ConnectionError'))).toBe(true)
    })

    it('finds channel_error entries from error log (telegram.error.Conflict)', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('sessions')) return [] as any
        return [] as any
      })

      const now = new Date()
      const errorLogContent = 'telegram.error.Conflict: Terminated by other getUpdates request\n'
      const buf = Buffer.from(errorLogContent)
      mockFs.statSync.mockReturnValue({ mtimeMs: now.getTime(), size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const errors = detectErrors('/workspace/stefany', 'stefany', new Date(now.getTime() - 86400000))

      expect(errors.some(e => e.type === 'channel_error')).toBe(true)
    })

    it('only returns errors from the last 24 hours (for JSONL entries)', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('sessions')) return ['session.jsonl'] as any
        if (path.includes('logs')) return [] as any
        return [] as any
      })

      const now = new Date()
      const oldTimestamp = new Date(now.getTime() - 2 * 86400000).toISOString() // 2 days ago

      const content = jsonl(
        { role: 'tool', content: 'Error: old error', timestamp: oldTimestamp }
      )
      const buf = Buffer.from(content)
      mockFs.statSync.mockReturnValue({ mtimeMs: now.getTime(), size: buf.length } as any)
      mockFs.openSync.mockReturnValue(42 as any)
      mockFs.readSync.mockImplementation((fd: any, buffer: any) => {
        buf.copy(buffer)
        return buf.length
      })
      mockFs.closeSync.mockReturnValue(undefined)

      const since = new Date(now.getTime() - 86400000) // 24 hours ago
      const errors = detectErrors('/workspace/stefany', 'stefany', since)

      // Old error should be filtered out
      expect(errors.filter(e => e.type === 'tool_error')).toHaveLength(0)
    })
  })

  describe('getChannelStatuses()', () => {
    it('returns connected=true for enabled channels when port is alive', () => {
      const agent = mockAgent({
        channels: { telegram: { enabled: true }, discord: { enabled: true } },
      })

      const result = getChannelStatuses(agent, true, [])

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ name: 'telegram', enabled: true, connected: true, lastError: null })
      expect(result[1]).toMatchObject({ name: 'discord', enabled: true, connected: true, lastError: null })
    })

    it('returns connected=false when port is dead', () => {
      const agent = mockAgent({
        channels: { telegram: { enabled: true } },
      })

      const result = getChannelStatuses(agent, false, [])

      expect(result[0]).toMatchObject({ connected: false })
    })

    it('marks channel as having error when error log contains channel-specific errors', () => {
      const agent = mockAgent({
        channels: { telegram: { enabled: true } },
      })
      const errors: AgentError[] = [
        {
          timestamp: new Date().toISOString(),
          type: 'channel_error',
          message: 'telegram.error.Conflict',
          source: 'stefany-error.log',
        },
      ]

      const result = getChannelStatuses(agent, true, errors)

      expect(result[0]).toMatchObject({
        name: 'telegram',
        connected: true,
        lastError: 'telegram.error.Conflict',
      })
    })
  })

  describe('computeCompositeHealth()', () => {
    it('returns green when all dimensions are healthy', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000, // 5 min ago
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 2,
      })

      expect(result.overall).toBe('green')
      expect(result.dimensions.process.level).toBe('green')
      expect(result.dimensions.activity.level).toBe('green')
      expect(result.dimensions.errors.level).toBe('green')
      expect(result.dimensions.channels.level).toBe('green')
    })

    it('returns yellow when activity is stale (>1 hour)', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 7200000, // 2 hours ago
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 1,
      })

      expect(result.overall).toBe('yellow')
      expect(result.dimensions.activity.level).toBe('yellow')
    })

    it('returns red when port is dead', () => {
      const result = computeCompositeHealth({
        portAlive: false,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 1,
      })

      expect(result.overall).toBe('red')
      expect(result.dimensions.process.level).toBe('red')
    })

    it('returns red when critical errors exist', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 5,
        criticalErrors: true,
        channelsDown: [],
        totalChannels: 1,
      })

      expect(result.overall).toBe('red')
      expect(result.dimensions.errors.level).toBe('red')
    })

    it('uses worst-dimension-wins logic', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: ['telegram'],
        totalChannels: 1, // all channels down = red
      })

      // Process: green, Activity: green, Errors: green, Channels: red (all down)
      expect(result.overall).toBe('red')
    })

    it('returns yellow for non-critical errors', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 3,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 1,
      })

      expect(result.overall).toBe('yellow')
      expect(result.dimensions.errors.level).toBe('yellow')
    })

    it('returns green for no channels configured', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 0,
      })

      expect(result.dimensions.channels.level).toBe('green')
      expect(result.dimensions.channels.reason).toContain('No channels')
    })

    it('returns yellow when no activity data found', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: null,
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: [],
        totalChannels: 1,
      })

      expect(result.dimensions.activity.level).toBe('yellow')
    })

    it('returns yellow when some channels are down but not all', () => {
      const result = computeCompositeHealth({
        portAlive: true,
        lastActivityMs: Date.now() - 300000,
        errorCount24h: 0,
        criticalErrors: false,
        channelsDown: ['discord'],
        totalChannels: 2,
      })

      expect(result.dimensions.channels.level).toBe('yellow')
    })
  })

  describe('checkAgentHealth()', () => {
    it('orchestrates all checks and returns AgentHealthSnapshot', async () => {
      const agent = mockAgent()

      // Mock port check to succeed
      const socketInstance = {
        setTimeout: vi.fn().mockReturnThis(),
        once: vi.fn().mockImplementation(function (this: any, event: string, cb: () => void) {
          if (event === 'connect') setTimeout(cb, 0)
          return this
        }),
        connect: vi.fn(),
        destroy: vi.fn(),
      }
      ;(net.Socket as any).mockImplementation(() => socketInstance)

      // Mock session directory doesn't exist
      mockFs.existsSync.mockReturnValue(false)
      mockFs.readdirSync.mockReturnValue([] as any)

      const snapshot = await checkAgentHealth(agent)

      expect(snapshot).toMatchObject({
        id: 'stefany',
        name: 'Stefany',
        agent,
      })
      expect(snapshot.health).toBeDefined()
      expect(snapshot.health.overall).toBeDefined()
      expect(snapshot.health.dimensions).toBeDefined()
      expect(snapshot.channels).toBeDefined()
      expect(snapshot.checkedAt).toBeGreaterThan(0)
    })
  })
})
