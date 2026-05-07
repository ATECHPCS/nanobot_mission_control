// src/lib/__tests__/agent-activity.test.ts
import { describe, it, expect } from 'vitest'
import { inferActivityState, promoteMeeting } from '../agent-activity'
import type { ActivitySignals, ActivityState } from '../agent-activity'

const NOW = 1_700_000_000  // fixed seconds-since-epoch for deterministic tests
const baseSignals: ActivitySignals = { status: 'busy', lastSeen: NOW }

describe('inferActivityState', () => {
  it('returns error when status is error (highest precedence)', () => {
    const result = inferActivityState({ ...baseSignals, status: 'error' }, NOW)
    expect(result.kind).toBe('error')
  })

  it('returns on-call when comms event is recent', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 10 },
    }, NOW)
    expect(result.kind).toBe('on-call')
    expect(result.subject).toBe('Cody')
  })

  it('ignores stale comms (>60s)', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 120 },
    }, NOW)
    expect(result.kind).not.toBe('on-call')
  })

  it('on-call beats latestTool', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestComms: { peer: 'Cody', createdAt: NOW - 5 },
      latestTool: { toolName: 'Edit', createdAt: NOW - 1, subject: 'foo.ts' },
    }, NOW)
    expect(result.kind).toBe('on-call')
  })

  it('maps Edit/Write/MultiEdit/NotebookEdit to typing', () => {
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5, subject: 'foo.ts' },
      }, NOW)
      expect(result.kind).toBe('typing')
      expect(result.subject).toBe('foo.ts')
    }
  })

  it('maps Read/Grep/Glob to reading', () => {
    for (const tool of ['Read', 'Grep', 'Glob']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5, subject: 'foo.ts' },
      }, NOW)
      expect(result.kind).toBe('reading')
    }
  })

  it('maps WebFetch/WebSearch to searching', () => {
    for (const tool of ['WebFetch', 'WebSearch']) {
      const result = inferActivityState({
        ...baseSignals,
        latestTool: { toolName: tool, createdAt: NOW - 5 },
      }, NOW)
      expect(result.kind).toBe('searching')
    }
  })

  it('maps Bash to bash', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestTool: { toolName: 'Bash', createdAt: NOW - 5, subject: 'pnpm test' },
    }, NOW)
    expect(result.kind).toBe('bash')
    expect(result.subject).toBe('pnpm test')
  })

  it('falls through unknown tools', () => {
    const result = inferActivityState({
      ...baseSignals,
      latestTool: { toolName: 'UnknownTool', createdAt: NOW - 5 },
    }, NOW)
    expect(result.kind).not.toBe('typing')
    expect(result.kind).not.toBe('reading')
  })
})
