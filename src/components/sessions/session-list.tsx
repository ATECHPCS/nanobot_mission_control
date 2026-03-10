'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMissionControl } from '@/store'
import { cn } from '@/lib/utils'
import type { NanobotSessionMeta, SessionListResponse } from '@/types/nanobot-session'
import { CHANNEL_ICONS } from '@/types/nanobot-session'

type DateRange = 'today' | '7d' | '30d' | 'all'

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'No activity'
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(isoDate).toLocaleDateString()
}

interface SessionListProps {
  agentId: string
}

export function SessionList({ agentId }: SessionListProps) {
  const { sessionViewerSession, setSessionViewerSession } = useMissionControl()
  const [sessions, setSessions] = useState<NanobotSessionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Fetch sessions when agentId, dateRange, or debouncedSearch changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams({ agent: agentId })
    if (dateRange !== 'all') params.set('dateRange', dateRange)
    if (debouncedSearch) params.set('search', debouncedSearch)

    fetch(`/api/nanobot-sessions?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SessionListResponse | null) => {
        if (!cancelled && data) {
          setSessions(data.sessions)
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [agentId, dateRange, debouncedSearch])

  // Group sessions by channel type
  const grouped = sessions.reduce<Record<string, NanobotSessionMeta[]>>((acc, s) => {
    const ch = s.channelType || 'unknown'
    if (!acc[ch]) acc[ch] = []
    acc[ch].push(s)
    return acc
  }, {})
  const groupKeys = Object.keys(grouped).sort()

  return (
    <div className="flex flex-col h-full border-r border-border bg-card w-[320px] shrink-0">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-border shrink-0">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {/* Date filter */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          className="w-full text-xs bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((key) => (
            <option key={key} value={key}>{DATE_RANGE_LABELS[key]}</option>
          ))}
        </select>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="h-3 w-32 bg-muted rounded" />
                <div className="h-2.5 w-48 bg-muted/60 rounded" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No sessions found
          </div>
        ) : (
          groupKeys.map((channel) => (
            <div key={channel}>
              {/* Channel group header */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/30 text-xs text-muted-foreground font-medium sticky top-0 z-10">
                <span>{CHANNEL_ICONS[channel] || '\u{1F4C1}'}</span>
                <span className="capitalize">{channel}</span>
                <span className="ml-auto text-muted-foreground/60">{grouped[channel].length}</span>
              </div>

              {/* Sessions in group */}
              {grouped[channel].map((session) => {
                const isSelected = sessionViewerSession === session.filename
                return (
                  <button
                    key={session.filename}
                    onClick={() => setSessionViewerSession(session.filename)}
                    className={cn(
                      'w-full text-left px-3 py-2 border-b border-border/50 transition-colors',
                      isSelected
                        ? 'bg-primary/10'
                        : 'hover:bg-secondary/50'
                    )}
                  >
                    {/* Channel badge + identifier */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs">{CHANNEL_ICONS[session.channelType] || '\u{1F4C1}'}</span>
                      <span className="text-sm font-medium text-foreground truncate">
                        {session.channelIdentifier || session.filename}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(session.lastMessageAt)}
                      </span>
                    </div>

                    {/* Last user message snippet */}
                    {session.lastUserMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.lastUserMessage}
                      </p>
                    )}

                    {/* Message count */}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                        {session.messageCount} msgs
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
