'use client'

import { useMemo, useRef, useEffect } from 'react'
import { useMissionControl } from '@/store'

/** Normalized feed item for unified display */
interface FeedItem {
  id: string
  type: 'status' | 'activity' | 'lifecycle' | 'error'
  message: string
  source: string
  timestamp: number
}

const TYPE_COLORS: Record<FeedItem['type'], string> = {
  status: 'bg-blue-500',
  activity: 'bg-blue-400',
  lifecycle: 'bg-green-500',
  error: 'bg-red-500',
}

const TYPE_LABELS: Record<FeedItem['type'], string> = {
  status: 'Status',
  activity: 'Activity',
  lifecycle: 'Lifecycle',
  error: 'Error',
}

const MAX_FEED_ITEMS = 50

export function ActivityFeedInline() {
  const { activities, lifecycleHistory, discoveredAgents } = useMissionControl()
  const scrollRef = useRef<HTMLDivElement>(null)

  const feedItems = useMemo(() => {
    const items: FeedItem[] = []

    // 1. Activities
    for (const act of activities) {
      items.push({
        id: `act-${act.id}`,
        type: 'activity',
        message: act.description,
        source: act.actor,
        timestamp: act.created_at * 1000,
      })
    }

    // 2. Lifecycle history
    for (const op of lifecycleHistory) {
      const agent = discoveredAgents.find((a) => a.id === op.agentId)
      const agentLabel = agent?.agent.icon
        ? `${agent.agent.icon} ${agent.name}`
        : agent?.name ?? op.agentId
      const statusLabel = op.status === 'success'
        ? 'completed'
        : op.status === 'error'
        ? `failed: ${op.error ?? 'unknown'}`
        : 'pending'
      items.push({
        id: `lc-${op.agentId}-${op.timestamp}`,
        type: 'lifecycle',
        message: `${op.action} ${statusLabel}`,
        source: agentLabel,
        timestamp: op.timestamp,
      })
    }

    // 3. Status changes derived from agent health snapshots (most recent check per agent)
    for (const agent of discoveredAgents) {
      const icon = agent.agent.icon ? `${agent.agent.icon} ` : ''
      items.push({
        id: `status-${agent.id}-${agent.checkedAt}`,
        type: 'status',
        message: `${agent.health.overall === 'green' ? 'Healthy' : agent.health.overall === 'yellow' ? 'Degraded' : 'Error'} -- ${agent.health.dimensions.process.reason}`,
        source: `${icon}${agent.name}`,
        timestamp: agent.checkedAt,
      })
    }

    // 4. Error events from agents
    for (const agent of discoveredAgents) {
      for (const err of agent.errors) {
        items.push({
          id: `err-${agent.id}-${err.timestamp}`,
          type: 'error',
          message: err.message,
          source: agent.agent.icon ? `${agent.agent.icon} ${agent.name}` : agent.name,
          timestamp: new Date(err.timestamp).getTime(),
        })
      }
    }

    // Sort by timestamp descending, cap at MAX_FEED_ITEMS
    items.sort((a, b) => b.timestamp - a.timestamp)
    return items.slice(0, MAX_FEED_ITEMS)
  }, [activities, lifecycleHistory, discoveredAgents])

  // Auto-scroll to top on new events
  const prevCountRef = useRef(feedItems.length)
  useEffect(() => {
    if (feedItems.length !== prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    prevCountRef.current = feedItems.length
  }, [feedItems.length])

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
          <h3 className="text-xs font-semibold text-foreground">Activity Feed</h3>
          <span className="text-2xs text-muted-foreground font-mono-tight">{feedItems.length}</span>
        </div>
      </div>

      {/* Feed items */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[400px]">
        {feedItems.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">No activity yet</p>
            <p className="text-2xs text-muted-foreground/60 mt-1">
              Events appear as agents run and change state
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {feedItems.map((item) => (
              <FeedItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedItemRow({ item }: { item: FeedItem }) {
  const dotColor = TYPE_COLORS[item.type]
  const timeStr = formatRelativeTime(item.timestamp)

  return (
    <div className="px-4 py-2 hover:bg-secondary/50 transition-smooth">
      <div className="flex items-start gap-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{item.source}</span>
            <span className="text-2xs text-muted-foreground/50 shrink-0">{TYPE_LABELS[item.type]}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed break-words mt-0.5">
            {item.message.length > 150 ? item.message.slice(0, 150) + '...' : item.message}
          </p>
          <span className="text-2xs text-muted-foreground/60 mt-0.5 block">{timeStr}</span>
        </div>
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
