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
})
