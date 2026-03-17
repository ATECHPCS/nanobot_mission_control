'use client'

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { MessageBubble } from './message-bubble'
import { useSmartPoll } from '@/lib/use-smart-poll'
import type { NanobotSessionMessage, SessionContentResponse } from '@/types/nanobot-session'

interface ChatViewerProps {
  agentId: string
  sessionFilename: string
  agentIcon?: string
}

const PAGE_SIZE = 100

export function ChatViewer({ agentId, sessionFilename, agentIcon }: ChatViewerProps) {
  const [messages, setMessages] = useState<NanobotSessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // In-session search state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)
  const messageCountRef = useRef(0)

  // Track the known total for polling (how many messages the server had last time)
  const knownTotalRef = useRef(0)

  // Fetch initial messages
  useEffect(() => {
    let cancelled = false
    initialLoadDone.current = false
    setMessages([])
    setLoading(true)
    setSearchQuery('')
    setActiveSearch('')
    messageCountRef.current = 0
    knownTotalRef.current = 0

    fetch(`/api/nanobot-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionFilename)}?offset=0&limit=${PAGE_SIZE}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SessionContentResponse | null) => {
        if (!cancelled && data) {
          setMessages(data.messages)
          setTotal(data.total)
          setHasMore(data.hasMore)
          messageCountRef.current = data.messages.length
          knownTotalRef.current = data.total
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [agentId, sessionFilename])

  // Poll for new messages appended to the session file every 5s
  const pollNewMessages = useCallback(async () => {
    if (loading) return // Don't poll while initial load is in progress
    const currentTotal = knownTotalRef.current
    if (currentTotal === 0) return // Not initialized yet

    try {
      // Fetch from offset=knownTotal — if no new messages, returns empty array
      // The response always includes the up-to-date total count
      const res = await fetch(
        `/api/nanobot-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionFilename)}?offset=${currentTotal}&limit=${PAGE_SIZE}`
      )
      if (!res.ok) return

      const data: SessionContentResponse = await res.json()

      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages])
        messageCountRef.current += data.messages.length
        knownTotalRef.current = currentTotal + data.messages.length
        setTotal(data.total)

        // Auto-scroll to bottom if user was already at the bottom
        if (isAtBottom) {
          requestAnimationFrame(() => {
            const el = scrollRef.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
          })
        }
      } else if (data.total !== currentTotal) {
        // Total changed but no new messages at this offset — update total
        knownTotalRef.current = data.total
        setTotal(data.total)
      }
    } catch {
      // Ignore poll errors
    }
  }, [agentId, sessionFilename, loading, isAtBottom])

  useSmartPoll(pollNewMessages, 5_000)

  // Scroll to bottom after initial load
  useLayoutEffect(() => {
    if (!loading && messages.length > 0 && !initialLoadDone.current) {
      const el = scrollRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight })
      }
      initialLoadDone.current = true
    }
  }, [loading, messages.length])

  // Track scroll position for "at bottom" detection
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
    setIsAtBottom(atBottom)

    // Load more on scroll to top
    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      setLoadingMore(true)
      const oldScrollHeight = el.scrollHeight

      fetch(`/api/nanobot-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionFilename)}?offset=${messageCountRef.current}&limit=${PAGE_SIZE}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: SessionContentResponse | null) => {
          if (data && data.messages.length > 0) {
            setMessages((prev) => [...data.messages, ...prev])
            messageCountRef.current += data.messages.length
            setHasMore(data.hasMore)
            // Preserve scroll position after prepending
            requestAnimationFrame(() => {
              if (el) {
                el.scrollTop = el.scrollHeight - oldScrollHeight
              }
            })
          } else {
            setHasMore(false)
          }
        })
        .catch(() => {})
        .finally(() => {
          setLoadingMore(false)
        })
    }
  }, [agentId, sessionFilename, hasMore, loadingMore])

  // Debounced in-session search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setActiveSearch(value)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  // Scroll to first match when search changes
  useEffect(() => {
    if (!activeSearch) return
    const lowerSearch = activeSearch.toLowerCase()
    const matchIdx = messages.findIndex(
      (m) => m.content.toLowerCase().includes(lowerSearch)
    )
    if (matchIdx >= 0) {
      const el = document.getElementById(`session-msg-${matchIdx}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeSearch, messages])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Build a tool_call_id -> result map for matching tool results to preceding assistant tool_calls
  const toolResultMap = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      toolResultMap.set(msg.tool_call_id, msg.content)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Loading messages...</span>
          </div>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" className="w-10 h-10 mx-auto mb-2 opacity-30">
            <path d="M2 3h12v9H2zM5 12v2M11 12v2M4 14h8" />
          </svg>
          <p className="text-sm">No messages in this session</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* In-session search bar */}
      <div className="px-3 py-2 border-b border-border shrink-0 bg-card">
        <div className="relative max-w-md">
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
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search in conversation..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
        {activeSearch && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Showing first match for &quot;{activeSearch}&quot; ({total} total messages)
          </p>
        )}
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3"
      >
        {/* Loading more indicator */}
        {loadingMore && (
          <div className="flex justify-center py-2 mb-2">
            <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={`${idx}-${msg.timestamp}`}
            id={`session-msg-${idx}`}
            message={msg}
            agentIcon={agentIcon}
            toolResult={
              msg.role === 'assistant' && msg.tool_calls?.[0]?.id
                ? toolResultMap.get(msg.tool_calls[0].id)
                : undefined
            }
            searchHighlight={activeSearch || undefined}
          />
        ))}
      </div>

      {/* Jump to bottom button */}
      {!isAtBottom && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
              <path d="M8 3v10M4 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Jump to bottom
          </button>
        </div>
      )}
    </div>
  )
}
