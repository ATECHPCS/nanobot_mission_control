// src/lib/kiosk-auth.ts
import crypto from 'node:crypto'

export function isKioskEnabled(): boolean {
  return Boolean(process.env.MC_OFFICE_TV_TOKEN && process.env.MC_OFFICE_TV_TOKEN.length > 0)
}

export function validateKioskToken(provided: string | null | undefined): boolean {
  if (!isKioskEnabled()) return false
  if (typeof provided !== 'string') return false
  const expected = process.env.MC_OFFICE_TV_TOKEN!
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // constant-time false
    crypto.timingSafeEqual(Buffer.alloc(b.length), b)
    return false
  }
  return crypto.timingSafeEqual(a, b)
}
