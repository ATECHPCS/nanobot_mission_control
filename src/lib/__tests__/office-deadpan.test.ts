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
})
