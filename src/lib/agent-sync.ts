/**
 * Agent-sync stub — the legacy gateway config sync was removed.
 * These no-op exports keep scheduler.ts and API routes compiling.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/** Sync agents from gateway config file into the DB (no-op stub). */
export async function syncAgentsFromConfig(
  _trigger: string
): Promise<{ created: number; updated: number; synced: number }> {
  return { created: 0, updated: 0, synced: 0 }
}

/** Write an agent entry back to the gateway config file (no-op stub). */
export async function writeAgentToConfig(_payload: Record<string, unknown>): Promise<void> {
  // no-op
}

/** Enrich an agent config object with data read from the workspace (no-op stub). */
export async function enrichAgentConfigFromWorkspace(_config: Record<string, unknown>): Promise<Record<string, unknown>> {
  return _config
}

/** Remove an agent entry from the gateway config file (no-op stub). */
export async function removeAgentFromConfig(_agent: { id: string; name: string }): Promise<void> {
  // no-op
}
