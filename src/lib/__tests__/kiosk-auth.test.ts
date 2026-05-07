// src/lib/__tests__/kiosk-auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateKioskToken, isKioskEnabled } from '../kiosk-auth'

describe('kiosk-auth', () => {
  const ORIG = process.env.MC_OFFICE_TV_TOKEN
  beforeEach(() => { delete process.env.MC_OFFICE_TV_TOKEN })
  afterEach(() => { if (ORIG !== undefined) process.env.MC_OFFICE_TV_TOKEN = ORIG; else delete process.env.MC_OFFICE_TV_TOKEN })

  it('isKioskEnabled returns false when env unset', () => {
    expect(isKioskEnabled()).toBe(false)
  })

  it('isKioskEnabled returns false when env empty', () => {
    process.env.MC_OFFICE_TV_TOKEN = ''
    expect(isKioskEnabled()).toBe(false)
  })

  it('isKioskEnabled returns true when env set', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret'
    expect(isKioskEnabled()).toBe(true)
  })

  it('validateKioskToken returns false when env unset', () => {
    expect(validateKioskToken('anything')).toBe(false)
  })

  it('validateKioskToken returns true on exact match', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('secret-token')).toBe(true)
  })

  it('validateKioskToken returns false on length mismatch', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('secret')).toBe(false)
  })

  it('validateKioskToken returns false on content mismatch', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken('wrong-12345!')).toBe(false)
  })

  it('validateKioskToken returns false for null/undefined', () => {
    process.env.MC_OFFICE_TV_TOKEN = 'secret-token'
    expect(validateKioskToken(null)).toBe(false)
    expect(validateKioskToken(undefined)).toBe(false)
  })
})
