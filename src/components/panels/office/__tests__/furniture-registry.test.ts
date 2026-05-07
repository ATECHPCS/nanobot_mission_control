// src/components/panels/office/__tests__/furniture-registry.test.ts
import { describe, it, expect } from 'vitest'
import { FURNITURE_COMPONENTS, type FurnitureKind } from '../furniture'

const ALL_KINDS: FurnitureKind[] = [
  'desk', 'whiteboard', 'coffee-machine', 'plant', 'server-rack',
  'bookshelf', 'reading-chair', 'floor-lamp',
  'couch', 'fridge', 'snack-table',
  'conference-table', 'sticky-note-wall', 'poster',
  'phone-booth',
  'bench', 'magazine-table',
  'lab-bench', 'lab-terminal',
  'monitor-stack',
  'filing-cabinet', 'cubicle-divider',
  'plant-tall', 'plant-hanging',
  'wall-clock', 'rug', 'paper',
]

describe('FURNITURE_COMPONENTS registry', () => {
  it('has 27 distinct kinds', () => {
    expect(ALL_KINDS).toHaveLength(27)
    expect(new Set(ALL_KINDS).size).toBe(27)
  })

  it('has a component for every FurnitureKind', () => {
    for (const kind of ALL_KINDS) {
      expect(FURNITURE_COMPONENTS[kind]).toBeDefined()
      expect(typeof FURNITURE_COMPONENTS[kind]).toBe('function')
    }
  })
})
