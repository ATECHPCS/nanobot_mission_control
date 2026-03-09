'use client'

import { AgentCard } from './agent-card'
import type { AgentHealthSnapshot } from '@/types/agent-health'

interface AgentCardGridProps {
  snapshots: AgentHealthSnapshot[]
  selectedId: string | null
  onSelectAgent: (id: string) => void
}

export function AgentCardGrid({ snapshots, selectedId, onSelectAgent }: AgentCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {snapshots.map((snapshot) => (
        <AgentCard
          key={snapshot.id}
          snapshot={snapshot}
          selected={selectedId === snapshot.id}
          onClick={() => onSelectAgent(snapshot.id)}
        />
      ))}
    </div>
  )
}
