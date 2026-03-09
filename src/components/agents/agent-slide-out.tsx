'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useMissionControl } from '@/store'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { AgentHealthDot } from './agent-health-dot'
import { AgentOverviewTab } from './agent-overview-tab'
import { AgentErrorsTab } from './agent-errors-tab'
import { AgentChannelsTab } from './agent-channels-tab'

interface AgentSlideOutProps {
  agentId: string | null
  onClose: () => void
}

type TabId = 'overview' | 'errors' | 'channels'

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'errors', label: 'Errors' },
  { id: 'channels', label: 'Channels' },
]

export function AgentSlideOut({ agentId, onClose }: AgentSlideOutProps) {
  const { discoveredAgents } = useMissionControl()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [mounted, setMounted] = useState(false)

  const snapshot = agentId
    ? discoveredAgents.find((a) => a.id === agentId) ?? null
    : null

  // Slide-in animation: mount then animate
  useEffect(() => {
    if (agentId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setMounted(true))
      })
    } else {
      setMounted(false)
    }
  }, [agentId])

  // Reset tab when switching agents
  useEffect(() => {
    if (agentId) {
      setActiveTab('overview')
    }
  }, [agentId])

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!agentId) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [agentId, handleKeyDown])

  if (!agentId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200',
          mounted ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={snapshot ? `${snapshot.name} details` : 'Agent details'}
        className={cn(
          'fixed right-0 top-0 h-full w-full md:w-[400px] z-50',
          'bg-card border-l border-border shadow-2xl',
          'flex flex-col',
          'transition-transform duration-200 ease-out',
          mounted ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          {snapshot ? (
            <>
              {snapshot.agent.icon ? (
                <span className="text-lg shrink-0" role="img" aria-label={`${snapshot.name} icon`}>
                  {snapshot.agent.icon}
                </span>
              ) : (
                <AgentAvatar name={snapshot.name} size="sm" />
              )}
              <span className="text-sm font-semibold text-foreground truncate flex-1">
                {snapshot.name}
              </span>
              <AgentHealthDot
                level={snapshot.health.overall}
                size="md"
                reasons={Object.values(snapshot.health.dimensions)}
              />
            </>
          ) : (
            <span className="text-sm text-muted-foreground flex-1">Agent not found</span>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
            aria-label="Close panel"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {snapshot ? (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-border shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium text-center transition-colors relative',
                    activeTab === tab.id
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'overview' && <AgentOverviewTab snapshot={snapshot} />}
              {activeTab === 'errors' && <AgentErrorsTab snapshot={snapshot} />}
              {activeTab === 'channels' && <AgentChannelsTab snapshot={snapshot} />}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Agent not found</p>
          </div>
        )}
      </div>
    </>
  )
}
