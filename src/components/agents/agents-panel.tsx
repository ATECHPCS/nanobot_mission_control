'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { useToast } from '@/components/ui/toast-provider'
import { AgentSummaryBar } from './agent-summary-bar'
import { AgentCardGrid } from './agent-card-grid'
import { AgentSkeletonGrid } from './agent-skeleton'
import { AgentSlideOut } from './agent-slide-out'
import type { AgentHealthSnapshot } from '@/types/agent-health'

export function AgentsPanel() {
  const {
    discoveredAgents,
    discoveredAgentsLoading,
    discoveredAgentsLastChecked,
    selectedDiscoveredAgentId,
    healthCheckInterval,
    setDiscoveredAgents,
    setDiscoveredAgentsLoading,
    setDiscoveredAgentsLastChecked,
    setSelectedDiscoveredAgentId,
  } = useMissionControl()

  const { show } = useToast()
  const prevAgentsRef = useRef<AgentHealthSnapshot[]>([])
  const [lastCheckedText, setLastCheckedText] = useState<string>('')

  // Fetch discovered agents from backend
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/discover')
      if (!res.ok) return
      const data = await res.json()
      const agents: AgentHealthSnapshot[] = data.agents ?? []

      // Detect changes for toast notifications
      const prev = prevAgentsRef.current
      if (prev.length > 0) {
        const prevIds = new Set(prev.map((a) => a.id))
        const newIds = new Set(agents.map((a) => a.id))

        // New agents discovered
        for (const agent of agents) {
          if (!prevIds.has(agent.id)) {
            show({ message: `Agent ${agent.name} discovered`, type: 'info' })
          }
        }

        // Agents removed
        for (const agent of prev) {
          if (!newIds.has(agent.id)) {
            show({ message: `Agent ${agent.name} removed`, type: 'warning' })
          }
        }

        // Red transitions
        for (const agent of agents) {
          const prevAgent = prev.find((a) => a.id === agent.id)
          if (prevAgent && prevAgent.health.overall !== 'red' && agent.health.overall === 'red') {
            const reason = Object.values(agent.health.dimensions)
              .find((d) => d.level === 'red')?.reason ?? 'unhealthy'
            show({ message: `Agent ${agent.name} is unhealthy: ${reason}`, type: 'error' })
          }
        }
      }

      prevAgentsRef.current = agents
      setDiscoveredAgents(agents)
      setDiscoveredAgentsLastChecked(data.checkedAt ?? Date.now())
      setDiscoveredAgentsLoading(false)
    } catch {
      // Silently fail -- next poll will retry
      setDiscoveredAgentsLoading(false)
    }
  }, [setDiscoveredAgents, setDiscoveredAgentsLastChecked, setDiscoveredAgentsLoading, show])

  // Smart poll with configurable interval
  const manualRefresh = useSmartPoll(fetchAgents, healthCheckInterval, {
    pauseWhenSseConnected: false,
  })

  // Update "last checked" relative text every second
  useEffect(() => {
    function updateText() {
      if (!discoveredAgentsLastChecked) {
        setLastCheckedText('')
        return
      }
      const diffSec = Math.floor((Date.now() - discoveredAgentsLastChecked) / 1000)
      if (diffSec < 5) {
        setLastCheckedText('just now')
      } else if (diffSec < 60) {
        setLastCheckedText(`${diffSec}s ago`)
      } else {
        setLastCheckedText(`${Math.floor(diffSec / 60)}m ago`)
      }
    }

    updateText()
    const interval = setInterval(updateText, 1000)
    return () => clearInterval(interval)
  }, [discoveredAgentsLastChecked])

  const handleSelectAgent = useCallback((id: string) => {
    setSelectedDiscoveredAgentId(
      selectedDiscoveredAgentId === id ? null : id
    )
  }, [selectedDiscoveredAgentId, setSelectedDiscoveredAgentId])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Summary bar */}
      {!discoveredAgentsLoading && discoveredAgents.length > 0 && (
        <AgentSummaryBar snapshots={discoveredAgents} />
      )}

      {/* Loading state */}
      {discoveredAgentsLoading && (
        <AgentSkeletonGrid count={3} />
      )}

      {/* Empty state */}
      {!discoveredAgentsLoading && discoveredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">No agents discovered</h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add agent directories to <code className="px-1 py-0.5 bg-muted rounded text-[10px]">~/.nanobot/workspace/agents/</code>. Scanning every {Math.round(healthCheckInterval / 1000)}s...
          </p>
        </div>
      )}

      {/* Agent card grid */}
      {!discoveredAgentsLoading && discoveredAgents.length > 0 && (
        <AgentCardGrid
          snapshots={discoveredAgents}
          selectedId={selectedDiscoveredAgentId}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {/* Slide-out detail panel */}
      <AgentSlideOut
        agentId={selectedDiscoveredAgentId}
        onClose={() => setSelectedDiscoveredAgentId(null)}
      />

      {/* Footer: Last checked + Refresh */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-[11px] text-muted-foreground/60">
          {lastCheckedText ? `Last checked: ${lastCheckedText}` : 'Checking...'}
        </span>
        <button
          onClick={() => manualRefresh()}
          className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Refresh Now
        </button>
      </div>
    </div>
  )
}
