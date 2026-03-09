'use client'

import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { AgentHealthDot } from './agent-health-dot'
import type { AgentHealthSnapshot } from '@/types/agent-health'

interface AgentCardProps {
  snapshot: AgentHealthSnapshot
  onClick: () => void
  selected?: boolean
}

/** Format a timestamp into a relative time string like "5m ago" */
function relativeTime(isoTimestamp: string): string {
  const now = Date.now()
  const then = new Date(isoTimestamp).getTime()
  if (isNaN(then)) return 'unknown'

  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays}d ago`
}

export function AgentCard({ snapshot, onClick, selected }: AgentCardProps) {
  const { name, health, lastActivity, errors, channels, agent } = snapshot

  const healthDimensions = Object.values(health.dimensions)

  const activityText = lastActivity?.content
    ? lastActivity.content.length > 80
      ? lastActivity.content.slice(0, 80) + '...'
      : lastActivity.content
    : null

  const lastActiveText = lastActivity?.timestamp
    ? relativeTime(lastActivity.timestamp)
    : null

  return (
    <div
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className={cn(
        'bg-card border border-border rounded-lg p-4 cursor-pointer transition-all',
        'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected && 'ring-2 ring-primary',
        health.overall === 'red' && 'animate-pulse-border',
      )}
    >
      {/* Row 1: Icon + Name + Health Dot */}
      <div className="flex items-center gap-2 mb-2">
        {agent.icon ? (
          <span className="text-lg shrink-0" role="img" aria-label={`${name} icon`}>
            {agent.icon}
          </span>
        ) : (
          <AgentAvatar name={name} size="sm" />
        )}
        <span className="text-sm font-medium text-foreground truncate flex-1">{name}</span>
        <AgentHealthDot level={health.overall} size="md" reasons={healthDimensions} />
        {errors.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
            {errors.length} err
          </span>
        )}
      </div>

      {/* Row 2: Activity text */}
      <p className={cn(
        'text-xs leading-relaxed mb-1 line-clamp-2',
        activityText ? 'text-muted-foreground' : 'text-muted-foreground/50 italic',
      )}>
        {activityText ?? 'No recent activity'}
      </p>

      {/* Row 3: Last active */}
      {lastActiveText && (
        <p className="text-[10px] text-muted-foreground/60 mb-2">
          Last active: {lastActiveText}
        </p>
      )}

      {/* Row 4: Channel labels */}
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {channels.map((ch) => (
            <span
              key={ch.name}
              className={cn(
                'text-[10px]',
                ch.connected ? 'text-success' : 'text-muted-foreground/50',
              )}
            >
              {ch.name}: {ch.connected ? 'connected' : 'disconnected'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
