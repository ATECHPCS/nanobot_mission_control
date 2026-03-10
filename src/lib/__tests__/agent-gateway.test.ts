import { describe, it, expect, vi, beforeEach } from 'vitest'
import { proxyGatewayRequest, ALLOWED_ENDPOINTS } from '../agent-gateway'

describe('agent-gateway', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  describe('ALLOWED_ENDPOINTS', () => {
    it('includes health and status', () => {
      expect(ALLOWED_ENDPOINTS).toContain('health')
      expect(ALLOWED_ENDPOINTS).toContain('status')
    })
  })

  describe('proxyGatewayRequest', () => {
    it('returns body and status on success', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('{"status":"ok"}'),
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any)

      const result = await proxyGatewayRequest('127.0.0.1', 18793, 'health')

      expect(result).toEqual({
        body: '{"status":"ok"}',
        status: 200,
        contentType: 'application/json',
      })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:18793/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('returns 504 on timeout (AbortError)', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError')
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

      const result = await proxyGatewayRequest('127.0.0.1', 18793, 'health')

      expect(result).toEqual({
        error: 'Gateway timeout',
        details: 'Agent gateway did not respond within 5 seconds',
        status: 504,
      })
    })

    it('returns 502 on connection refused', async () => {
      const connError = new Error('fetch failed')
      ;(connError as any).cause = { code: 'ECONNREFUSED' }
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(connError)

      const result = await proxyGatewayRequest('127.0.0.1', 18793, 'health')

      expect(result).toEqual({
        error: 'Gateway unreachable',
        details: 'Connection refused -- agent may be down',
        status: 502,
      })
    })

    it('returns 502 on other errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await proxyGatewayRequest('127.0.0.1', 18793, 'health')

      expect(result).toEqual({
        error: 'Gateway unreachable',
        details: 'Network error',
        status: 502,
      })
    })

    it('rejects disallowed endpoints', async () => {
      const result = await proxyGatewayRequest('127.0.0.1', 18793, 'admin/secrets')

      expect(result).toEqual({
        error: 'Endpoint not allowed',
        details: 'Only these endpoints are allowed: health, status',
        status: 403,
      })
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })
  })
})
