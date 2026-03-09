'use client'

import { cn } from '@/lib/utils'
import type { AgentHealthSnapshot } from '@/types/agent-health'

interface AgentChannelsTabProps {
  snapshot: AgentHealthSnapshot
}

export function AgentChannelsTab({ snapshot }: AgentChannelsTabProps) {
  const { channels } = snapshot

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-muted-foreground"
          >
            <path d="M2 3h12v9H2zM5 12v2M11 12v2M4 14h8" />
          </svg>
        </div>
        <p className="text-xs text-muted-foreground">No channels configured</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {channels.map((ch) => (
        <div
          key={ch.name}
          className="rounded-md border border-border bg-card p-3 space-y-1"
        >
          {/* Channel name + status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground capitalize">
              {ch.name}
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                ch.connected ? 'text-success' : 'text-destructive',
              )}
            >
              {ch.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Enabled/disabled note */}
          {!ch.enabled && (
            <p className="text-[10px] text-muted-foreground/50 italic">
              Channel disabled in config
            </p>
          )}

          {/* Last error */}
          {ch.lastError && (
            <p className="text-xs text-destructive/70 mt-1">
              {ch.lastError}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
