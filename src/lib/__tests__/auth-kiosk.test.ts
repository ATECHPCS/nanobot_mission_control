import { describe, it, expect } from 'vitest'
import { getUserFromRequest } from '../auth'

function makeReq(headers: Record<string, string> = {}, urlPath = '/api/agents'): Request {
  return new Request(`http://localhost${urlPath}`, { headers })
}

describe('getUserFromRequest — kiosk header', () => {
  it('returns null when no auth signals are present', () => {
    expect(getUserFromRequest(makeReq())).toBeNull()
  })

  it('returns a synthetic viewer user when x-mc-kiosk-auth: 1 is present', () => {
    const user = getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '1' }))
    expect(user).not.toBeNull()
    expect(user!.role).toBe('viewer')
    expect(user!.username).toBe('kiosk')
    expect(user!.id).toBe(-1)
  })

  it('ignores any value other than exactly "1"', () => {
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': 'true' }))).toBeNull()
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '' }))).toBeNull()
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '0' }))).toBeNull()
  })
})
