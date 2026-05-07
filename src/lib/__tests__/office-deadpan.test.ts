// src/lib/__tests__/office-deadpan.test.ts
import { describe, it, expect, vi } from 'vitest'
import { pickDeadpanLine, DEADPAN_LINES } from '../office-deadpan'

describe('pickDeadpanLine', () => {
  it('returns a string for every kind', () => {
    for (const kind of Object.keys(DEADPAN_LINES) as Array<keyof typeof DEADPAN_LINES>) {
      const line = pickDeadpanLine(kind, undefined, null)
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('substitutes {subject} when present', () => {
    // Force deterministic selection by stubbing Math.random to 0
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const line = pickDeadpanLine('typing', 'foo.ts', null)
    expect(line).toContain('foo.ts')
    vi.restoreAllMocks()
  })

  it('skips lines that contain {subject} when subject is missing', () => {
    // Pick a kind whose first template references {subject}
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const line = pickDeadpanLine('typing', undefined, null)
    expect(line).not.toContain('{subject}')
    vi.restoreAllMocks()
  })

  it('avoids returning the same line twice in a row when alternatives exist', () => {
    const first = pickDeadpanLine('idle', undefined, null)
    for (let i = 0; i < 20; i++) {
      const next = pickDeadpanLine('idle', undefined, first)
      if (DEADPAN_LINES.idle.length > 1) expect(next).not.toBe(first)
    }
  })

  it('truncates long subject substitutions to 40 chars', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const long = 'x'.repeat(100)
    const line = pickDeadpanLine('typing', long, null)
    // Expect no more than ~50 chars of subject substring (40 + literal text)
    expect(line.length).toBeLessThanOrEqual(80)
    vi.restoreAllMocks()
  })

  it('uses per-nanobot personality lines when an agent name matches', () => {
    // Stefany has unique idle lines that don't appear in DEADPAN_LINES.idle.
    const stefanyIdle = ['Tea break.', 'Color-coded inbox zero.', 'Filing complete.']
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) {
      seen.add(pickDeadpanLine('idle', undefined, null, 'Stefany'))
    }
    // Every produced line should be in Stefany's set, not the generic pool.
    for (const line of seen) expect(stefanyIdle).toContain(line)
  })

  it('falls back to generic lines when the agent has no override for the kind', () => {
    // Stefany doesn't define a 'searching' override → generic pool wins.
    const generic = ['Looking for {subject}.', 'Grep harder.', 'It must be somewhere.']
    const result = pickDeadpanLine('searching', 'foo', null, 'Stefany')
    // Should match one of the generic patterns (with subject substituted).
    const expectations = generic.map(t => t.replace('{subject}', 'foo'))
    expect(expectations).toContain(result)
  })
})
