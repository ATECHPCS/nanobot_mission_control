'use client'

import { useMemo } from 'react'
import type { AgentHealthSnapshot, HealthLevel } from '@/types/agent-health'

interface MetricStripProps {
  agents: AgentHealthSnapshot[]
}

interface MetricCardData {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: string
}

const healthOrder: HealthLevel[] = ['green', 'yellow', 'red']

export function MetricStrip({ agents }: MetricStripProps) {
  const metrics = useMemo(() => computeMetrics(agents), [agents])

  return (
    <div className="flex flex-wrap gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm min-w-[160px] flex-1"
        >
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
            {m.icon}
          </div>
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium">
              {m.label}
            </p>
            <p className={`text-lg font-semibold leading-tight ${m.color ?? 'text-foreground'}`}>
              {m.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function computeMetrics(agents: AgentHealthSnapshot[]): MetricCardData[] {
  const total = agents.length

  const counts: Record<HealthLevel, number> = { green: 0, yellow: 0, red: 0 }
  for (const a of agents) {
    counts[a.health.overall]++
  }

  // Status breakdown string
  const statusParts = healthOrder
    .filter((l) => counts[l] > 0)
    .map((l) => `${counts[l]} ${l === 'green' ? 'ok' : l === 'yellow' ? 'warn' : 'err'}`)
  const statusBreakdown = statusParts.join(' / ') || 'none'

  // Total errors in last 24h
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000
  let totalErrors = 0
  for (const a of agents) {
    for (const err of a.errors) {
      if (new Date(err.timestamp).getTime() >= dayAgo) {
        totalErrors++
      }
    }
  }

  // Active sessions (process dimension green = alive)
  const activeSessions = agents.filter(
    (a) => a.health.dimensions.process.level === 'green'
  ).length

  return [
    {
      label: 'Agents',
      value: total,
      icon: <AgentsMetricIcon />,
    },
    {
      label: 'Status',
      value: statusBreakdown,
      icon: <StatusMetricIcon />,
      color:
        counts.red > 0
          ? 'text-destructive'
          : counts.yellow > 0
          ? 'text-warning'
          : 'text-success',
    },
    {
      label: 'Errors (24h)',
      value: totalErrors,
      icon: <ErrorMetricIcon />,
      color: totalErrors > 0 ? 'text-destructive' : 'text-success',
    },
    {
      label: 'Active',
      value: `${activeSessions}/${total}`,
      icon: <ActiveMetricIcon />,
      color: activeSessions === total ? 'text-success' : 'text-foreground',
    },
  ]
}

// -- Metric Icons (16x16 SVGs) --

function AgentsMetricIcon() {
  return (
    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  )
}

function StatusMetricIcon() {
  return (
    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,8 4,8 6,3 8,13 10,6 12,8 15,8" />
    </svg>
  )
}

function ErrorMetricIcon() {
  return (
    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L1 13.5h14L8 1.5z" />
      <path d="M8 6v4" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ActiveMetricIcon() {
  return (
    <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6 8l2 2 3-3" />
    </svg>
  )
}
