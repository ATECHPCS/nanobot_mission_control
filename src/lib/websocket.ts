/**
 * WebSocket stub — the legacy gateway WebSocket was removed.
 * This module provides no-op exports so upstream components that import
 * useWebSocket continue to compile without runtime errors.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

export function useWebSocket() {
  return {
    /** Initiate a WebSocket connection (no-op). */
    connect: (_url: string, _token?: string) => {},
    /** Send a JSON message over the WebSocket (no-op, returns false). */
    sendMessage: (_payload: Record<string, unknown>): boolean => false,
    /** Whether the socket is currently connected. Always false in stub. */
    isConnected: false,
    /** Attempt to reconnect (no-op). */
    reconnect: () => {},
  }
}
