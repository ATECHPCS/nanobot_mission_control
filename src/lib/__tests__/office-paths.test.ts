// src/lib/__tests__/office-paths.test.ts
import { describe, it, expect } from 'vitest'
import { pathBetween } from '../office-paths'
import { ROOM_DOORS } from '../office-layout'

describe('pathBetween', () => {
  it('returns a single segment when staying in the same room', () => {
    const path = pathBetween(
      { x: 10, y: 20 }, 'home-main',
      { x: 15, y: 22 }, 'home-main',
    )
    expect(path).toHaveLength(2)
    expect(path[0]).toEqual({ x: 10, y: 20 })
    expect(path[1]).toEqual({ x: 15, y: 22 })
  })

  it('routes home-main → library through the left corridor turn', () => {
    const path = pathBetween(
      { x: 10, y: 20 }, 'home-main',
      { x: 38, y: 18 }, 'library',
    )
    expect(path[0]).toEqual({ x: 10, y: 20 })
    expect(path[1]).toEqual(ROOM_DOORS['home-main'])
    expect(path[path.length - 2]).toEqual(ROOM_DOORS['library'])
    expect(path[path.length - 1]).toEqual({ x: 38, y: 18 })
  })

  it('routes home-gsd → workshop through both corridors', () => {
    const path = pathBetween(
      { x: 90, y: 30 }, 'home-gsd',
      { x: 50, y: 65 }, 'workshop',
    )
    expect(path[0]).toEqual({ x: 90, y: 30 })
    expect(path[1]).toEqual(ROOM_DOORS['home-gsd'])
    expect(path[path.length - 2]).toEqual(ROOM_DOORS['workshop'])
    expect(path[path.length - 1]).toEqual({ x: 50, y: 65 })
    expect(path.length).toBeGreaterThanOrEqual(4)
  })
})
