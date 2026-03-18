'use client'

import { useCallback } from 'react'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { AgentCardGrid } from './agent-card-grid'
import { AgentSkeletonGrid } from './agent-skeleton'
import { AgentSlideOut } from './agent-slide-out'
import type { AgentHealthSnapshot } from '@/types/agent-health'

/**
 * Dedicated agents view — focused on the agent card grid + detail slide-out.
 * Differs from OverviewLanding by omitting metric strip, quick actions,
 * activity feed, and error summary.
 */
export function AgentsPanel() {
  const {
    discoveredAgents,
    discoveredAgentsLoading,
    selectedDiscoveredAgentId,
    setSelectedDiscoveredAgentId,
    setDiscoveredAgents,
    setDiscoveredAgentsLoading,
    setDiscoveredAgentsLastChecked,
    healthCheckInterval,
  } = useMissionControl()

  // Fetch discovered agents — mirrors overview-landing but without toast notifications
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/discover')
      if (!res.ok) return
      const data = await res.json()
      const agents: AgentHealthSnapshot[] = data.agents ?? []
      setDiscoveredAgents(agents)
      setDiscoveredAgentsLastChecked(data.checkedAt ?? Date.now())
      setDiscoveredAgentsLoading(false)
    } catch {
      setDiscoveredAgentsLoading(false)
    }
  }, [setDiscoveredAgents, setDiscoveredAgentsLastChecked, setDiscoveredAgentsLoading])

  useSmartPoll(fetchAgents, healthCheckInterval, {
    pauseWhenSseConnected: false,
  })

  const handleSelectAgent = useCallback((id: string) => {
    setSelectedDiscoveredAgentId(
      selectedDiscoveredAgentId === id ? null : id
    )
  }, [selectedDiscoveredAgentId, setSelectedDiscoveredAgentId])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Agents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {discoveredAgents.length} discovered agent{discoveredAgents.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Agent grid */}
      {discoveredAgentsLoading && discoveredAgents.length === 0 && (
        <AgentSkeletonGrid count={3} />
      )}

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

      {discoveredAgents.length > 0 && (
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
    </div>
  )
}
