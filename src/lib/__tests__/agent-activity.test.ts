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

  it('returns blocked when assigned task is in review', () => {
    const result = inferActivityState({
      ...baseSignals,
      blockedOnTaskTitle: 'PR-23: refactor auth',
    }, NOW)
    expect(result.kind).toBe('blocked')
    expect(result.subject).toBe('PR-23: refactor auth')
  })

  it('returns thinking when busy with no recent signals', () => {
    const result = inferActivityState(baseSignals, NOW)
    expect(result.kind).toBe('thinking')
  })

  it('returns idle when status idle and last_seen older than 5min', () => {
    const result = inferActivityState({
      status: 'idle',
      lastSeen: NOW - 600,
    }, NOW)
    expect(result.kind).toBe('idle')
  })

  it('returns idle (no subject) by default for fresh idle agent', () => {
    const result = inferActivityState({
      status: 'idle',
      lastSeen: NOW - 10,
    }, NOW)
    expect(result.kind).toBe('idle')
    expect(result.subject).toBeUndefined()
  })
})

describe('promoteMeeting', () => {
  it('does nothing below threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('a')!.kind).toBe('thinking')
    expect(result.get('b')!.kind).toBe('typing')
  })

  it('promotes all active agents to in-meeting at threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
      ['c', { kind: 'reading', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('a')!.kind).toBe('in-meeting')
    expect(result.get('b')!.kind).toBe('in-meeting')
    expect(result.get('c')!.kind).toBe('in-meeting')
  })

  it('does not promote idle/blocked/error agents even at threshold', () => {
    const states = new Map<string, ActivityState>([
      ['a', { kind: 'thinking', since: NOW * 1000 }],
      ['b', { kind: 'typing', since: NOW * 1000 }],
      ['c', { kind: 'reading', since: NOW * 1000 }],
      ['d', { kind: 'idle', since: NOW * 1000 }],
      ['e', { kind: 'blocked', since: NOW * 1000 }],
    ])
    const result = promoteMeeting(states, 3)
    expect(result.get('d')!.kind).toBe('idle')
    expect(result.get('e')!.kind).toBe('blocked')
  })
})
