'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MemoryFileNode } from '@/lib/memory-files'

interface MemoryFileTreeProps {
  tree: MemoryFileNode[]
  selectedPath: string | null
  onSelectFile: (path: string) => void
  loading?: boolean
}

function relativeTime(timestampMs: number): string {
  const now = Date.now()
  const diffMs = now - timestampMs
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays}d ago`
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  defaultExpanded,
}: {
  node: MemoryFileNode
  depth: number
  selectedPath: string | null
  onSelectFile: (path: string) => void
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const paddingLeft = depth * 12

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1 py-1 px-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-colors"
          style={{ paddingLeft }}
        >
          {/* Chevron */}
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={cn(
              'w-3 h-3 shrink-0 transition-transform duration-150',
              expanded ? 'rotate-90' : 'rotate-0'
            )}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          {/* Folder icon */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70">
            <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5a1.5 1.5 0 00-1.5-1.5H7.71L6.85 2.15A.5.5 0 006.5 2h-5z" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child, i) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                defaultExpanded={i === 0 && child.type === 'directory'}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node
  const isSelected = selectedPath === node.path

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'w-full flex items-center gap-1 py-1 px-1 text-xs rounded-sm transition-colors',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      style={{ paddingLeft: paddingLeft + 12 }} // extra indent to align with folder names
    >
      {/* Document icon */}
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-60">
        <path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4.5L9.5 0H4zm5.5 1.5v3h3L9.5 1.5z" />
      </svg>
      <span className="truncate flex-1 text-left">{node.name}</span>
      {/* Lock icon for read-only files */}
      {node.readOnly && (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-muted-foreground/50" aria-label="Read-only">
          <path d="M8 1a3 3 0 00-3 3v2H4a1 1 0 00-1 1v7a1 1 0 001 1h8a1 1 0 001-1V7a1 1 0 00-1-1h-1V4a3 3 0 00-3-3zm-1.5 3a1.5 1.5 0 013 0v2h-3V4z" />
        </svg>
      )}
      {/* Timestamp */}
      {node.modified && (
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {relativeTime(node.modified)}
        </span>
      )}
    </button>
  )
}

export function MemoryFileTree({ tree, selectedPath, onSelectFile, loading }: MemoryFileTreeProps) {
  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
        ))}
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="p-2 text-xs text-muted-foreground/60 italic">
        No .md files found
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {tree.map((node, i) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          defaultExpanded={i === 0 && node.type === 'directory'}
        />
      ))}
    </div>
  )
}
