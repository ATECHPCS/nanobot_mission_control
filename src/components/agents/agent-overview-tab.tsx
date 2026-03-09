'use client'

import { cn } from '@/lib/utils'
import { useMissionControl } from '@/store'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { AgentHealthDot } from './agent-health-dot'
import type { AgentHealthSnapshot, HealthLevel } from '@/types/agent-health'

interface AgentOverviewTabProps {
  snapshot: AgentHealthSnapshot
}

const healthLabels: Record<HealthLevel, string> = {
  green: 'Healthy',
  yellow: 'Degraded',
  red: 'Unhealthy',
}

const healthTextColors: Record<HealthLevel, string> = {
  green: 'text-success',
  yellow: 'text-warning',
  red: 'text-destructive',
}

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

export function AgentOverviewTab({ snapshot }: AgentOverviewTabProps) {
  const { currentUser } = useMissionControl()
  const { name, health, lastActivity, agent } = snapshot
  const isViewer = currentUser?.role === 'viewer'

  const processAlive = health.dimensions.process.level !== 'red'

  return (
    <div className="space-y-4">
      {/* Agent identity */}
      <div className="flex items-center gap-3">
        {agent.icon ? (
          <span className="text-2xl shrink-0" role="img" aria-label={`${name} icon`}>
            {agent.icon}
          </span>
        ) : (
          <AgentAvatar name={name} size="md" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">{name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <AgentHealthDot level={health.overall} size="sm" />
            <span className={cn('text-xs font-medium', healthTextColors[health.overall])}>
              {healthLabels[health.overall]}
            </span>
          </div>
        </div>
      </div>

      {/* Status summary */}
      {health.overall !== 'green' && (
        <div className="rounded-md bg-muted/50 p-2.5">
          <p className="text-xs text-muted-foreground">
            {Object.values(health.dimensions)
              .filter((d) => d.level !== 'green')
              .map((d) => d.reason)
              .join('. ')}
          </p>
        </div>
      )}

      {/* Info list */}
      <div className="space-y-3">
        <InfoRow label="Model" value={agent.model || 'Unknown'} />

        <InfoRow
          label="Activity"
          value={lastActivity?.content ?? 'No recent activity'}
          muted={!lastActivity?.content}
        />

        <InfoRow
          label="Last seen"
          value={lastActivity?.timestamp ? relativeTime(lastActivity.timestamp) : 'Never'}
          muted={!lastActivity?.timestamp}
        />

        <InfoRow
          label="Uptime"
          value={processAlive ? 'Running' : 'Down'}
          muted={!processAlive}
        />

        {/* Health dimensions breakdown */}
        <div className="pt-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Health Dimensions
          </span>
          <div className="mt-1.5 space-y-1.5">
            {(Object.entries(health.dimensions) as [string, { level: HealthLevel; reason: string }][]).map(
              ([key, dim]) => (
                <div key={key} className="flex items-center gap-2">
                  <AgentHealthDot level={dim.level} size="sm" />
                  <span className="text-xs text-muted-foreground capitalize w-16">{key}</span>
                  <span className="text-xs text-muted-foreground/70 truncate flex-1">{dim.reason}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* RBAC-gated technical details */}
        {isViewer ? (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground/50 italic">
              Technical details hidden for viewer role
            </p>
          </div>
        ) : (
          <div className="pt-2 border-t border-border space-y-2.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
              Technical Details
            </span>
            <InfoRow label="Gateway port" value={String(agent.gatewayPort)} />
            <InfoRow label="Workspace" value={agent.workspacePath} mono />
            <InfoRow label="Home" value={agent.homePath} mono />
            <InfoRow label="Config" value={agent.configPath} mono />
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  muted = false,
  mono = false,
}: {
  label: string
  value: string
  muted?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/60 font-medium">{label}</span>
      <span
        className={cn(
          'text-xs break-all',
          muted ? 'text-muted-foreground/50 italic' : 'text-foreground',
          mono && 'font-mono text-[11px]',
        )}
      >
        {value}
      </span>
    </div>
  )
}
