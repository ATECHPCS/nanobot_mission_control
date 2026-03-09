'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { HealthLevel, HealthDimension } from '@/types/agent-health'

interface AgentHealthDotProps {
  level: HealthLevel
  size?: 'sm' | 'md'
  reasons?: HealthDimension[]
  className?: string
}

const dotColors: Record<HealthLevel, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
}

const sizeClasses: Record<'sm' | 'md', string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
}

export function AgentHealthDot({ level, size = 'sm', reasons, className }: AgentHealthDotProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const degradedReasons = reasons?.filter((r) => r.level !== 'green') ?? []
  const hasTooltip = degradedReasons.length > 0

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      onMouseEnter={() => hasTooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={cn(
          'rounded-full',
          sizeClasses[size],
          dotColors[level],
          level === 'red' && 'animate-pulse',
        )}
      />

      {/* Tooltip */}
      {showTooltip && degradedReasons.length > 0 && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-popover text-popover-foreground border border-border rounded-lg shadow-lg whitespace-nowrap z-50">
          {degradedReasons.map((r, i) => (
            <span key={i} className="block">
              <span className={cn(
                'inline-block w-1.5 h-1.5 rounded-full mr-1.5',
                dotColors[r.level],
              )} />
              {r.reason}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
