/**
 * WebSocket stub — the legacy gateway WebSocket was removed.
 * This module provides no-op exports so upstream components that import
 * useWebSocket continue to compile without runtime errors.
 *
 * All returned functions are stable singletons so they can safely appear
 * in React dependency arrays without triggering re-renders.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

const noopConnect = (_url: string, _token?: string) => {}
const noopSendMessage = (_payload: Record<string, unknown>): boolean => false
const noopReconnect = () => {}

const STUB = {
  connect: noopConnect,
  sendMessage: noopSendMessage,
  isConnected: false as const,
  reconnect: noopReconnect,
}

export function useWebSocket() {
  return STUB
}
