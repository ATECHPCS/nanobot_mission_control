/**
 * Gateway HTTP proxy for forwarding requests to agent gateway ports.
 *
 * All gateway communication routes through MC API routes -- the browser
 * never talks to agent ports directly. This module handles the server-side
 * HTTP fetch with timeout and error handling.
 */

/** Timeout for gateway HTTP requests (5 seconds) */
export const GATEWAY_TIMEOUT_MS = 5000

/** Endpoints allowed through the gateway proxy */
export const ALLOWED_ENDPOINTS = ['health', 'status']

type ProxySuccess = { body: string; status: number; contentType: string }
type ProxyError = { error: string; details: string; status: number }

/**
 * Proxy an HTTP GET request to an agent's gateway port.
 *
 * @param host - Agent gateway host (e.g., '127.0.0.1')
 * @param port - Agent gateway port (e.g., 18793)
 * @param endpoint - The endpoint to request (e.g., 'health', 'status')
 * @returns Success with body/status/contentType, or error with details/status code
 */
export async function proxyGatewayRequest(
  host: string,
  port: number,
  endpoint: string
): Promise<ProxySuccess | ProxyError> {
  // Validate endpoint against allowlist
  if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
    return {
      error: 'Endpoint not allowed',
      details: `Only these endpoints are allowed: ${ALLOWED_ENDPOINTS.join(', ')}`,
      status: 403,
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)

    const response = await fetch(
      `http://${host}:${port}/${endpoint}`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)

    const body = await response.text()
    return {
      body,
      status: response.status,
      contentType: response.headers.get('Content-Type') || 'application/json',
    }
  } catch (err: any) {
    // Timeout (AbortError)
    if (err.name === 'AbortError') {
      return {
        error: 'Gateway timeout',
        details: 'Agent gateway did not respond within 5 seconds',
        status: 504,
      }
    }

    // Connection refused (check both err.code and err.cause.code)
    const code = err.code || err.cause?.code
    if (code === 'ECONNREFUSED') {
      return {
        error: 'Gateway unreachable',
        details: 'Connection refused -- agent may be down',
        status: 502,
      }
    }

    // Other errors
    return {
      error: 'Gateway unreachable',
      details: err.message,
      status: 502,
    }
  }
}
