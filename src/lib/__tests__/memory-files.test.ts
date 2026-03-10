import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Import from module under test (does not exist yet -- TDD RED)
import { scanWorkspace, readMemoryFile, writeMemoryFile, READ_ONLY_FILES } from '../memory-files'
import type { MemoryFileNode } from '../memory-files'

let tmpDir: string

beforeAll(() => {
  // Create a temp workspace structure mimicking a nanobot agent workspace
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-files-test-'))

  // Root .md files
  fs.writeFileSync(path.join(tmpDir, 'SOUL.md'), '# Soul\nAgent soul content')
  fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), '# Identity\nAgent identity')
  fs.writeFileSync(path.join(tmpDir, 'HEARTBEAT.md'), '# Heartbeat\nAuto-generated')

  // memory/ subdirectory with .md files
  fs.mkdirSync(path.join(tmpDir, 'memory'))
  fs.writeFileSync(path.join(tmpDir, 'memory', 'MEMORY.md'), '# Memory\nAgent memory')
  fs.writeFileSync(path.join(tmpDir, 'memory', 'HISTORY.md'), '# History\nAgent history')

  // memory/episodes/ subdirectory
  fs.mkdirSync(path.join(tmpDir, 'memory', 'episodes'))
  fs.writeFileSync(path.join(tmpDir, 'memory', 'episodes', 'ep-001.md'), '# Episode 1')

  // memory/graph/entities/ deep nested subdirectory
  fs.mkdirSync(path.join(tmpDir, 'memory', 'graph'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'memory', 'graph', 'entities'))
  fs.writeFileSync(path.join(tmpDir, 'memory', 'graph', 'entities', 'user.md'), '# User entity')

  // scripts/ directory with only non-.md files (should be excluded)
  fs.mkdirSync(path.join(tmpDir, 'scripts'))
  fs.writeFileSync(path.join(tmpDir, 'scripts', 'launch.sh'), '#!/bin/bash\necho hello')

  // .hidden/ dotdir (should be excluded)
  fs.mkdirSync(path.join(tmpDir, '.hidden'))
  fs.writeFileSync(path.join(tmpDir, '.hidden', 'secret.md'), '# Secret')

  // Non-.md file at root (should be excluded)
  fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"key":"value"}')
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('scanWorkspace', () => {
  describe('root files', () => {
    it('returns root .md files', () => {
      const tree = scanWorkspace(tmpDir)
      const rootFiles = tree.filter(n => n.type === 'file')
      const names = rootFiles.map(f => f.name)
      expect(names).toContain('SOUL.md')
      expect(names).toContain('IDENTITY.md')
      expect(names).toContain('HEARTBEAT.md')
    })

    it('marks HEARTBEAT.md as readOnly', () => {
      const tree = scanWorkspace(tmpDir)
      const heartbeat = tree.find(n => n.name === 'HEARTBEAT.md')
      expect(heartbeat).toBeDefined()
      expect(heartbeat!.readOnly).toBe(true)
    })

    it('does not mark SOUL.md as readOnly', () => {
      const tree = scanWorkspace(tmpDir)
      const soul = tree.find(n => n.name === 'SOUL.md')
      expect(soul).toBeDefined()
      expect(soul!.readOnly).toBeFalsy()
    })

    it('includes modified timestamp for files', () => {
      const tree = scanWorkspace(tmpDir)
      const soul = tree.find(n => n.name === 'SOUL.md')
      expect(soul!.modified).toBeTypeOf('number')
      expect(soul!.modified).toBeGreaterThan(0)
    })
  })

  describe('subdirectories', () => {
    it('recurses into memory/ directory', () => {
      const tree = scanWorkspace(tmpDir)
      const memDir = tree.find(n => n.name === 'memory' && n.type === 'directory')
      expect(memDir).toBeDefined()
      expect(memDir!.children).toBeDefined()
      const childNames = memDir!.children!.map(c => c.name)
      expect(childNames).toContain('MEMORY.md')
      expect(childNames).toContain('HISTORY.md')
    })

    it('recurses into memory/episodes/', () => {
      const tree = scanWorkspace(tmpDir)
      const memDir = tree.find(n => n.name === 'memory')!
      const episodesDir = memDir.children!.find(c => c.name === 'episodes')
      expect(episodesDir).toBeDefined()
      expect(episodesDir!.type).toBe('directory')
      expect(episodesDir!.children!.length).toBeGreaterThan(0)
    })

    it('recurses into memory/graph/entities/', () => {
      const tree = scanWorkspace(tmpDir)
      const memDir = tree.find(n => n.name === 'memory')!
      const graphDir = memDir.children!.find(c => c.name === 'graph')
      expect(graphDir).toBeDefined()
      const entitiesDir = graphDir!.children!.find(c => c.name === 'entities')
      expect(entitiesDir).toBeDefined()
      expect(entitiesDir!.children!.some(c => c.name === 'user.md')).toBe(true)
    })
  })

  describe('excludes non-md', () => {
    it('excludes directories with only non-.md files', () => {
      const tree = scanWorkspace(tmpDir)
      const scripts = tree.find(n => n.name === 'scripts')
      expect(scripts).toBeUndefined()
    })

    it('excludes non-.md files at root', () => {
      const tree = scanWorkspace(tmpDir)
      const json = tree.find(n => n.name === 'data.json')
      expect(json).toBeUndefined()
    })

    it('excludes dotdirs', () => {
      const tree = scanWorkspace(tmpDir)
      const hidden = tree.find(n => n.name === '.hidden')
      expect(hidden).toBeUndefined()
    })
  })

  describe('sorting', () => {
    it('sorts directories before files', () => {
      const tree = scanWorkspace(tmpDir)
      const firstDir = tree.findIndex(n => n.type === 'directory')
      const firstFile = tree.findIndex(n => n.type === 'file')
      if (firstDir >= 0 && firstFile >= 0) {
        expect(firstDir).toBeLessThan(firstFile)
      }
    })

    it('sorts alphabetically within same type', () => {
      const tree = scanWorkspace(tmpDir)
      const files = tree.filter(n => n.type === 'file')
      const names = files.map(f => f.name)
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sorted)
    })
  })
})

describe('readMemoryFile', () => {
  describe('read content', () => {
    it('returns content and metadata for a valid file', () => {
      const result = readMemoryFile(tmpDir, 'SOUL.md')
      expect(result).not.toBeNull()
      expect(result!.content).toContain('# Soul')
      expect(result!.modified).toBeTypeOf('number')
      expect(result!.readOnly).toBe(false)
    })

    it('returns readOnly: true for HEARTBEAT.md', () => {
      const result = readMemoryFile(tmpDir, 'HEARTBEAT.md')
      expect(result).not.toBeNull()
      expect(result!.readOnly).toBe(true)
    })

    it('reads nested files', () => {
      const result = readMemoryFile(tmpDir, 'memory/MEMORY.md')
      expect(result).not.toBeNull()
      expect(result!.content).toContain('# Memory')
    })

    it('returns null for non-existent files', () => {
      const result = readMemoryFile(tmpDir, 'NONEXISTENT.md')
      expect(result).toBeNull()
    })
  })

  describe('path traversal', () => {
    it('throws on ../ path traversal attempts', () => {
      expect(() => readMemoryFile(tmpDir, '../../../etc/passwd')).toThrow()
    })

    it('throws on absolute path attempts', () => {
      expect(() => readMemoryFile(tmpDir, '/etc/passwd')).toThrow()
    })
  })
})

describe('writeMemoryFile', () => {
  describe('write content', () => {
    it('writes content to a valid file and returns modified timestamp', () => {
      const result = writeMemoryFile(tmpDir, 'SOUL.md', '# Updated Soul')
      expect(result.modified).toBeTypeOf('number')
      // Verify it actually wrote to disk
      const onDisk = fs.readFileSync(path.join(tmpDir, 'SOUL.md'), 'utf-8')
      expect(onDisk).toBe('# Updated Soul')
    })

    it('creates new files in existing directories', () => {
      const result = writeMemoryFile(tmpDir, 'memory/NEW-NOTE.md', '# New Note')
      expect(result.modified).toBeTypeOf('number')
      const onDisk = fs.readFileSync(path.join(tmpDir, 'memory', 'NEW-NOTE.md'), 'utf-8')
      expect(onDisk).toBe('# New Note')
    })
  })

  describe('read-only', () => {
    it('throws when writing to HEARTBEAT.md', () => {
      expect(() => writeMemoryFile(tmpDir, 'HEARTBEAT.md', 'new content')).toThrow()
    })

    it('throws when writing to SESSION-STATE.md', () => {
      // Create SESSION-STATE.md first
      fs.writeFileSync(path.join(tmpDir, 'SESSION-STATE.md'), 'state')
      expect(() => writeMemoryFile(tmpDir, 'SESSION-STATE.md', 'new content')).toThrow()
    })
  })

  describe('path traversal', () => {
    it('throws on ../ path traversal attempts', () => {
      expect(() => writeMemoryFile(tmpDir, '../../../tmp/evil.md', 'evil')).toThrow()
    })
  })
})

describe('READ_ONLY_FILES', () => {
  it('contains HEARTBEAT.md and SESSION-STATE.md', () => {
    expect(READ_ONLY_FILES.has('HEARTBEAT.md')).toBe(true)
    expect(READ_ONLY_FILES.has('SESSION-STATE.md')).toBe(true)
  })

  it('does not contain other files', () => {
    expect(READ_ONLY_FILES.has('SOUL.md')).toBe(false)
    expect(READ_ONLY_FILES.has('MEMORY.md')).toBe(false)
  })
})

// RBAC: not tested here (tested at API route level)
