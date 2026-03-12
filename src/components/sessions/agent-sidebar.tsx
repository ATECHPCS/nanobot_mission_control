'use client'

import { useEffect } from 'react'
import { useMissionControl } from '@/store'
import { cn } from '@/lib/utils'
import type { AgentHealthSnapshot } from '@/types/agent-health'

const healthDotColor: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
}

export function AgentSidebar() {
  const {
    discoveredAgents,
    discoveredAgentsLoading,
    sessionViewerAgent,
    sessionViewerAgentSidebarOpen,
    setDiscoveredAgents,
    setDiscoveredAgentsLoading,
    setSessionViewerAgent,
    toggleSessionViewerAgentSidebar,
  } = useMissionControl()

  // Fetch agents on mount and poll every 30s for fresh data
  useEffect(() => {
    let cancelled = false
    const fetchAgents = async () => {
      try {
        if (discoveredAgents.length === 0) setDiscoveredAgentsLoading(true)
        const res = await fetch('/api/agents/discover?refresh=true')
        if (!res.ok || cancelled) return
        const data: { agents: AgentHealthSnapshot[] } | null = await res.json()
        if (!cancelled && data?.agents) {
          setDiscoveredAgents(data.agents)
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setDiscoveredAgentsLoading(false) }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDiscoveredAgents, setDiscoveredAgentsLoading])

  const isOpen = sessionViewerAgentSidebarOpen

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border bg-card shrink-0 transition-all duration-200 ease-in-out overflow-hidden',
        isOpen ? 'w-[200px]' : 'w-12'
      )}
    >
      {/* Toggle button */}
      <div className={cn('flex items-center shrink-0 border-b border-border', isOpen ? 'px-3 py-2 justify-between' : 'justify-center py-2')}>
        {isOpen && (
          <span className="text-xs font-semibold text-muted-foreground tracking-wide">AGENTS</span>
        )}
        <button
          onClick={toggleSessionViewerAgentSidebar}
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          title={isOpen ? 'Collapse agent sidebar' : 'Expand agent sidebar'}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            {isOpen ? (
              <polyline points="10,3 5,8 10,13" />
            ) : (
              <polyline points="6,3 11,8 6,13" />
            )}
          </svg>
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-1">
        {discoveredAgents.length === 0 ? (
          <div className={cn('text-xs text-muted-foreground', isOpen ? 'px-3 py-4 text-center' : 'px-1 py-4 text-center')}>
            {discoveredAgentsLoading
              ? (isOpen ? 'Discovering agents...' : '')
              : (isOpen ? 'No agents discovered' : '')}
          </div>
        ) : (
          discoveredAgents.map((agent) => {
            const isSelected = sessionViewerAgent === agent.id
            const icon = agent.agent?.icon
            return (
              <button
                key={agent.id}
                onClick={() => setSessionViewerAgent(agent.id)}
                title={isOpen ? undefined : agent.name}
                className={cn(
                  'w-full flex items-center gap-2 transition-colors',
                  isOpen ? 'px-3 py-2' : 'justify-center px-1 py-2',
                  isSelected
                    ? 'bg-primary/15 text-primary'
                    : 'text-foreground hover:bg-secondary'
                )}
              >
                {/* Agent icon */}
                <div className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-sm shrink-0 relative">
                  {icon || (
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                      <circle cx="8" cy="5" r="3" />
                      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                    </svg>
                  )}
                  {/* Health dot */}
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                      healthDotColor[agent.health.overall] || 'bg-gray-400'
                    )}
                  />
                </div>
                {isOpen && (
                  <span className="text-sm truncate">{agent.name}</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
