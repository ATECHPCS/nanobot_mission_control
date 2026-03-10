'use client'

import { useMemo, useState } from 'react'
import { useMissionControl } from '@/store'
import type { AgentError } from '@/types/agent-health'

interface AgentErrorGroup {
  agentId: string
  agentName: string
  agentIcon?: string
  errors: AgentError[]
  count: number
}

export function ErrorSummaryPanel() {
  const { discoveredAgents } = useMissionControl()

  const errorGroups = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    const groups: AgentErrorGroup[] = []

    for (const agent of discoveredAgents) {
      const recentErrors = agent.errors.filter(
        (e) => new Date(e.timestamp).getTime() >= dayAgo
      )
      if (recentErrors.length === 0) continue

      // Sort errors newest first
      const sorted = [...recentErrors].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      groups.push({
        agentId: agent.id,
        agentName: agent.name,
        agentIcon: agent.agent.icon,
        errors: sorted,
        count: sorted.length,
      })
    }

    // Sort by error count descending
    groups.sort((a, b) => b.count - a.count)
    return groups
  }, [discoveredAgents])

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <h3 className="text-xs font-semibold text-foreground">Error Summary</h3>
        <span className="text-2xs text-muted-foreground">Last 24h</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto max-h-[400px]">
        {errorGroups.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-success/10 flex items-center justify-center">
              <CheckIcon />
            </div>
            <p className="text-xs text-muted-foreground">No errors in last 24h</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {errorGroups.map((group) => (
              <ErrorGroupItem key={group.agentId} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorGroupItem({ group }: { group: AgentErrorGroup }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      {/* Agent header (click to expand/collapse) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/50 transition-smooth"
      >
        {/* Expand/collapse chevron */}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3 h-3 text-muted-foreground transition-transform duration-150 shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          <polyline points="6,3 11,8 6,13" />
        </svg>

        {/* Agent icon + name */}
        <span className="text-xs font-medium text-foreground truncate flex-1">
          {group.agentIcon ? `${group.agentIcon} ` : ''}{group.agentName}
        </span>

        {/* Count badge */}
        <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-2xs font-semibold shrink-0">
          {group.count}
        </span>
      </button>

      {/* Error list (expandable) */}
      <div
        className={`overflow-hidden transition-all duration-150 ease-in-out ${
          expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pl-9 pr-4 pb-2 space-y-1.5">
          {group.errors.map((err, i) => (
            <ErrorItem key={`${err.timestamp}-${i}`} error={err} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ErrorItem({ error }: { error: AgentError }) {
  const timeStr = formatRelativeTime(new Date(error.timestamp).getTime())

  return (
    <div className="rounded-md bg-destructive/5 border border-destructive/10 px-3 py-2">
      <p className="text-xs text-foreground/90 leading-relaxed break-words">
        {error.message.length > 200 ? error.message.slice(0, 200) + '...' : error.message}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-2xs text-muted-foreground font-mono-tight">{error.type}</span>
        <span className="text-2xs text-muted-foreground/50">from</span>
        <span className="text-2xs text-muted-foreground font-mono-tight">{error.source}</span>
        <span className="text-2xs text-muted-foreground/50">--</span>
        <span className="text-2xs text-muted-foreground">{timeStr}</span>
      </div>
    </div>
  )
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,8 7,11 12,5" />
    </svg>
  )
}
