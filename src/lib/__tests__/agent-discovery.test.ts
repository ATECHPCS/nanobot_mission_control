import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}))

// Mock config to control nanobotStateDir
vi.mock('@/lib/config', () => ({
  config: {
    nanobotStateDir: '/home/testuser/.nanobot',
    nanobotGatewayHost: '127.0.0.1',
  },
}))

import fs from 'node:fs'
import { discoverAgents, parseHomeFromLaunchScript, readAgentConfig, findLaunchScript } from '../agent-discovery'

const mockFs = vi.mocked(fs)

// Helper: build a mock Dirent
function dirent(name: string, isDir = true): any {
  return { name, isDirectory: () => isDir, isFile: () => !isDir }
}

// Sample launch script content
const LAUNCH_SCRIPT_QUOTED = `#!/bin/bash
export HOME="/Users/testuser/.nanobot-stefany-home"
exec nanobot gateway --port 18793
`

const LAUNCH_SCRIPT_UNQUOTED = `#!/bin/bash
export HOME=/Users/testuser/.nanobot-cody-home
exec nanobot gateway --port 18792
`

// Sample config.json
const VALID_CONFIG = JSON.stringify({
  agents: { defaults: { model: 'claude-sonnet-4-20250514' } },
  gateway: { port: 18793, host: '127.0.0.1' },
  channels: {
    telegram: { enabled: true, bot_token: 'xxx' },
    discord: { enabled: false },
  },
  icon: 'brain',
})

const CONFIG_MINIMAL = JSON.stringify({
  agents: { defaults: { model: 'claude-haiku-4-5-20251001' } },
  gateway: { port: 18792 },
})

describe('agent-discovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('discoverAgents()', () => {
    it('returns empty array when agents directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = discoverAgents()

      expect(result).toEqual([])
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        '/home/testuser/.nanobot/workspace/agents'
      )
    })

    it('returns agents for valid directories containing launch scripts and config files', () => {
      // agents dir exists
      mockFs.existsSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') return true
        if (path === '/home/testuser/.nanobot/workspace/agents/stefany/launch-stefany.sh') return true
        if (path === '/Users/testuser/.nanobot-stefany-home/.nanobot/config.json') return true
        return false
      })

      mockFs.readdirSync.mockImplementation((p: any, opts?: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('stefany')] as any
        }
        if (path === '/home/testuser/.nanobot/workspace/agents/stefany') {
          return ['launch-stefany.sh', 'IDENTITY.md'] as any
        }
        return [] as any
      })

      mockFs.readFileSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents/stefany/launch-stefany.sh') {
          return LAUNCH_SCRIPT_QUOTED
        }
        if (path === '/Users/testuser/.nanobot-stefany-home/.nanobot/config.json') {
          return VALID_CONFIG
        }
        throw new Error(`Unexpected read: ${path}`)
      })

      const result = discoverAgents()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'stefany',
        name: 'Stefany',
        workspacePath: '/home/testuser/.nanobot/workspace/agents/stefany',
        homePath: '/Users/testuser/.nanobot-stefany-home',
        configPath: '/Users/testuser/.nanobot-stefany-home/.nanobot/config.json',
        model: 'claude-sonnet-4-20250514',
        gatewayPort: 18793,
        gatewayHost: '127.0.0.1',
        channels: { telegram: { enabled: true } },
        icon: 'brain',
      })
    })

    it('skips directories starting with "." (hidden dirs)', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('.hidden'), dirent('stefany')] as any
        }
        // stefany dir
        return ['launch-stefany.sh'] as any
      })

      // Make stefany fail so we only test that .hidden is skipped
      mockFs.existsSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') return true
        return false
      })

      const result = discoverAgents()

      // .hidden should be skipped entirely (no attempt to read launch script)
      expect(result).toEqual([])
    })

    it('skips directories missing launch script or config.json', () => {
      mockFs.existsSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') return true
        // No launch script exists
        return false
      })

      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('incomplete')] as any
        }
        // No launch-* files
        return ['README.md'] as any
      })

      const result = discoverAgents()

      expect(result).toEqual([])
    })

    it('detects new agent when directory is added between calls (AREG-04)', () => {
      // First call: one agent
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('stefany')] as any
        }
        return ['launch-stefany.sh'] as any
      })
      mockFs.readFileSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('launch-stefany.sh')) return LAUNCH_SCRIPT_QUOTED
        if (path.includes('config.json')) return VALID_CONFIG
        throw new Error(`Unexpected: ${path}`)
      })
      mockFs.existsSync.mockImplementation((p: any) => {
        // Exclude root config so discoverRootAgent() doesn't add an extra agent
        if (String(p) === '/home/testuser/.nanobot/config.json') return false
        return true
      })

      const first = discoverAgents()
      expect(first).toHaveLength(1)

      // Second call: two agents
      vi.resetAllMocks()
      mockFs.existsSync.mockImplementation((p: any) => {
        if (String(p) === '/home/testuser/.nanobot/config.json') return false
        return true
      })
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('stefany'), dirent('cody')] as any
        }
        if (path.includes('stefany')) return ['launch-stefany.sh'] as any
        if (path.includes('cody')) return ['launch-cody.sh'] as any
        return [] as any
      })
      mockFs.readFileSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('launch-stefany.sh')) return LAUNCH_SCRIPT_QUOTED
        if (path.includes('launch-cody.sh')) return LAUNCH_SCRIPT_UNQUOTED
        if (path.includes('.nanobot-stefany-home')) return VALID_CONFIG
        if (path.includes('.nanobot-cody-home')) return CONFIG_MINIMAL
        throw new Error(`Unexpected: ${path}`)
      })

      const second = discoverAgents()
      expect(second).toHaveLength(2)
      expect(second.map(a => a.id)).toContain('cody')
    })

    it('each discovered agent includes all required fields', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path === '/home/testuser/.nanobot/workspace/agents') {
          return [dirent('stefany')] as any
        }
        return ['launch-stefany.sh'] as any
      })
      mockFs.readFileSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('launch-stefany.sh')) return LAUNCH_SCRIPT_QUOTED
        if (path.includes('config.json')) return VALID_CONFIG
        throw new Error(`Unexpected: ${path}`)
      })

      const result = discoverAgents()
      const agent = result[0]

      // Verify all required fields exist
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('name')
      expect(agent).toHaveProperty('workspacePath')
      expect(agent).toHaveProperty('homePath')
      expect(agent).toHaveProperty('configPath')
      expect(agent).toHaveProperty('launchScript')
      expect(agent).toHaveProperty('model')
      expect(agent).toHaveProperty('gatewayPort')
      expect(agent).toHaveProperty('gatewayHost')
      expect(agent).toHaveProperty('channels')
      expect(agent).toHaveProperty('icon')
    })
  })

  describe('parseHomeFromLaunchScript()', () => {
    it('extracts HOME path from quoted export', () => {
      mockFs.readFileSync.mockReturnValue(LAUNCH_SCRIPT_QUOTED)

      const home = parseHomeFromLaunchScript('/path/to/launch-stefany.sh')

      expect(home).toBe('/Users/testuser/.nanobot-stefany-home')
    })

    it('extracts HOME path from unquoted export', () => {
      mockFs.readFileSync.mockReturnValue(LAUNCH_SCRIPT_UNQUOTED)

      const home = parseHomeFromLaunchScript('/path/to/launch-cody.sh')

      expect(home).toBe('/Users/testuser/.nanobot-cody-home')
    })

    it('throws when no HOME export found', () => {
      mockFs.readFileSync.mockReturnValue('#!/bin/bash\necho hello\n')

      expect(() => parseHomeFromLaunchScript('/path/to/script.sh')).toThrow(
        /No HOME export found/
      )
    })
  })

  describe('readAgentConfig()', () => {
    it('returns model, gatewayPort, channels, icon from valid config', () => {
      mockFs.readFileSync.mockReturnValue(VALID_CONFIG)

      const result = readAgentConfig('/path/to/config.json')

      expect(result).toEqual({
        model: 'claude-sonnet-4-20250514',
        gatewayPort: 18793,
        gatewayHost: '127.0.0.1',
        channels: { telegram: { enabled: true } },
        icon: 'brain',
      })
    })

    it('returns null for missing or malformed config files', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      expect(readAgentConfig('/nonexistent/config.json')).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('not valid json {{')

      expect(readAgentConfig('/path/to/config.json')).toBeNull()
    })

    it('handles missing optional fields (icon, channels) gracefully', () => {
      mockFs.readFileSync.mockReturnValue(CONFIG_MINIMAL)

      const result = readAgentConfig('/path/to/config.json')

      expect(result).toEqual({
        model: 'claude-haiku-4-5-20251001',
        gatewayPort: 18792,
        gatewayHost: '127.0.0.1',
        channels: {},
        icon: undefined,
      })
    })
  })

  describe('findLaunchScript()', () => {
    it('returns exact match launch-{name}.sh when it exists', () => {
      mockFs.existsSync.mockReturnValue(true)

      const result = findLaunchScript('/workspace/agents/stefany', 'stefany')

      expect(result).toBe('/workspace/agents/stefany/launch-stefany.sh')
    })

    it('falls back to any launch-*.sh file', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.readdirSync.mockReturnValue(['README.md', 'launch-bot.sh', 'IDENTITY.md'] as any)

      const result = findLaunchScript('/workspace/agents/mybot', 'mybot')

      expect(result).toBe('/workspace/agents/mybot/launch-bot.sh')
    })

    it('returns null when no launch script found', () => {
      mockFs.existsSync.mockReturnValue(false)
      mockFs.readdirSync.mockReturnValue(['README.md', 'IDENTITY.md'] as any)

      const result = findLaunchScript('/workspace/agents/nobot', 'nobot')

      expect(result).toBeNull()
    })
  })
})
