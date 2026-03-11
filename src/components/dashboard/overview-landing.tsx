'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { useNavigateToPanel } from '@/lib/navigation'
import { useToast } from '@/components/ui/toast-provider'
import { MetricStrip } from './metric-strip'
import { ActivityFeedInline } from './activity-feed-inline'
import { ErrorSummaryPanel } from './error-summary-panel'
import { AgentCardGrid } from '@/components/agents/agent-card-grid'
import { AgentSkeletonGrid } from '@/components/agents/agent-skeleton'
import { AgentSlideOut } from '@/components/agents/agent-slide-out'
import type { AgentHealthSnapshot } from '@/types/agent-health'

export function OverviewLanding() {
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
  const navigateToPanel = useNavigateToPanel()
  const prevAgentsRef = useRef<AgentHealthSnapshot[]>([])
  const [lastCheckedText, setLastCheckedText] = useState<string>('')

  // Fetch discovered agents from backend (moved from AgentsPanel)
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

        for (const agent of agents) {
          if (!prevIds.has(agent.id)) {
            show({ message: `Agent ${agent.name} discovered`, type: 'info' })
          }
        }

        for (const agent of prev) {
          if (!newIds.has(agent.id)) {
            show({ message: `Agent ${agent.name} removed`, type: 'warning' })
          }
        }

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. Metric strip (full width, top) */}
      <MetricStrip agents={discoveredAgents} />

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-2">
        <QuickActionButton label="Tasks" onClick={() => navigateToPanel('tasks')} icon={<TasksIcon />} />
        <QuickActionButton label="Sessions" onClick={() => navigateToPanel('nanobot-sessions')} icon={<SessionsIcon />} />
        <QuickActionButton label="Tokens" onClick={() => navigateToPanel('nanobot-tokens')} icon={<TokensIcon />} />
        <QuickActionButton label="Settings" onClick={() => navigateToPanel('settings')} icon={<SettingsIcon />} />
      </div>

      {/* 2. Agent card grid (full width, middle) */}
      {discoveredAgentsLoading && (
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

      {!discoveredAgentsLoading && discoveredAgents.length > 0 && (
        <AgentCardGrid
          snapshots={discoveredAgents}
          selectedId={selectedDiscoveredAgentId}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {/* 3. Two-column row: Activity Feed (left ~60%) | Error Summary (right ~40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ActivityFeedInline />
        </div>
        <div className="lg:col-span-2">
          <ErrorSummaryPanel />
        </div>
      </div>

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

      {/* Slide-out detail panel */}
      <AgentSlideOut
        agentId={selectedDiscoveredAgentId}
        onClose={() => setSelectedDiscoveredAgentId(null)}
      />
    </div>
  )
}

// -- Quick Action Button --

function QuickActionButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
    >
      <div className="w-3.5 h-3.5">{icon}</div>
      {label}
    </button>
  )
}

// -- Quick Action Icons (16x16 SVGs) --

function TasksIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="2" y="1" width="12" height="14" rx="1.5" />
      <path d="M5 5h6M5 8h6M5 11h3" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-full h-full">
      <path d="M2 3h12v9H2zM5 12v2M11 12v2M4 14h8" />
    </svg>
  )
}

function TokensIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-full h-full">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v8M5 6h6M5 10h6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" />
    </svg>
  )
}
