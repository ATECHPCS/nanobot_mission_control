'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useMissionControl } from '@/store'
import type { AgentHealthSnapshot, AgentError } from '@/types/agent-health'

interface AgentErrorsTabProps {
  snapshot: AgentHealthSnapshot
}

const errorTypeColors: Record<AgentError['type'], string> = {
  tool_error: 'bg-orange-500/15 text-orange-400',
  rate_limit: 'bg-yellow-500/15 text-yellow-400',
  channel_error: 'bg-blue-500/15 text-blue-400',
  crash: 'bg-destructive/15 text-destructive',
}

const errorTypeLabels: Record<AgentError['type'], string> = {
  tool_error: 'Tool Error',
  rate_limit: 'Rate Limit',
  channel_error: 'Channel',
  crash: 'Crash',
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

/** Filter errors to last 24 hours, cap at 50 */
function filterRecentErrors(errors: AgentError[]): AgentError[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  return errors
    .filter((e) => new Date(e.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50)
}

export function AgentErrorsTab({ snapshot }: AgentErrorsTabProps) {
  const { currentUser, dismissAgentErrors } = useMissionControl()
  const [dismissing, setDismissing] = useState(false)

  const isViewer = currentUser?.role === 'viewer'
  const recentErrors = filterRecentErrors(snapshot.errors)

  const handleDismiss = useCallback(async () => {
    if (dismissing || isViewer) return
    setDismissing(true)
    try {
      const res = await fetch(`/api/agents/${snapshot.id}/errors/dismiss`, {
        method: 'POST',
      })
      if (res.ok) {
        dismissAgentErrors(snapshot.id)
      }
    } catch {
      // Silently fail -- user can retry
    } finally {
      setDismissing(false)
    }
  }, [dismissing, isViewer, snapshot.id, dismissAgentErrors])

  if (recentErrors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center mb-3">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-success"
          >
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        </div>
        <p className="text-xs text-muted-foreground">No errors in the last 24 hours</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Dismiss button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {recentErrors.length} error{recentErrors.length !== 1 ? 's' : ''} in last 24h
        </span>
        <button
          onClick={handleDismiss}
          disabled={isViewer || dismissing}
          className={cn(
            'text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors',
            isViewer
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-destructive hover:bg-destructive/10',
            dismissing && 'opacity-50',
          )}
          title={isViewer ? 'Requires operator role' : 'Dismiss all errors'}
        >
          {dismissing ? 'Dismissing...' : 'Dismiss All'}
        </button>
      </div>

      {/* Error list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {recentErrors.map((error, i) => (
          <ErrorItem key={`${error.timestamp}-${i}`} error={error} />
        ))}
      </div>
    </div>
  )
}

function ErrorItem({ error }: { error: AgentError }) {
  const [expanded, setExpanded] = useState(false)
  const truncated = error.message.length > 200

  return (
    <div className="rounded-md border border-border bg-card p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Type badge */}
        <span
          className={cn(
            'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
            errorTypeColors[error.type],
          )}
        >
          {errorTypeLabels[error.type]}
        </span>
        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground/60 ml-auto">
          {relativeTime(error.timestamp)}
        </span>
      </div>

      {/* Message */}
      <p
        className={cn(
          'text-xs text-muted-foreground leading-relaxed',
          !expanded && truncated && 'line-clamp-3',
        )}
      >
        {error.message}
      </p>

      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Source */}
      <p className="text-[10px] text-muted-foreground/40 font-mono truncate">
        {error.source}
      </p>
    </div>
  )
}
