'use client'

import { cn } from '@/lib/utils'
import type { AgentHealthSnapshot, HealthLevel } from '@/types/agent-health'

interface AgentSummaryBarProps {
  snapshots: AgentHealthSnapshot[]
}

const dotColors: Record<HealthLevel, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
}

const labelMap: Record<HealthLevel, string> = {
  green: 'healthy',
  yellow: 'degraded',
  red: 'error',
}

export function AgentSummaryBar({ snapshots }: AgentSummaryBarProps) {
  const total = snapshots.length
  if (total === 0) return null

  const counts: Record<HealthLevel, number> = { green: 0, yellow: 0, red: 0 }
  for (const s of snapshots) {
    counts[s.health.overall]++
  }

  const segments: { level: HealthLevel; count: number }[] = []
  for (const level of ['green', 'yellow', 'red'] as HealthLevel[]) {
    if (counts[level] > 0) {
      segments.push({ level, count: counts[level] })
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{total} agent{total !== 1 ? 's' : ''}:</span>
      {segments.map(({ level, count }, i) => (
        <span key={level} className="flex items-center gap-1">
          {i > 0 && <span className="mx-0.5">{' '}</span>}
          <span className={cn('w-2 h-2 rounded-full inline-block', dotColors[level])} />
          <span>{count} {labelMap[level]}</span>
        </span>
      ))}
    </div>
  )
}
