'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMissionControl } from '@/store'
import { MemoryFileTree } from './memory-file-tree'
import { MemoryFileEditor } from './memory-file-editor'
import type { AgentHealthSnapshot } from '@/types/agent-health'
import type { MemoryFileNode } from '@/lib/memory-files'

interface AgentMemoryTabProps {
  snapshot: AgentHealthSnapshot
}

export function AgentMemoryTab({ snapshot }: AgentMemoryTabProps) {
  const { currentUser } = useMissionControl()
  const [tree, setTree] = useState<MemoryFileNode[]>([])
  const [treeLoading, setTreeLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const isViewer = currentUser?.role === 'viewer'
  const isAgentRunning = snapshot.health.dimensions.process.level !== 'red'

  // Fetch file tree on mount
  useEffect(() => {
    setTreeLoading(true)
    fetch(`/api/agents/${snapshot.id}/files`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load files')
        return res.json()
      })
      .then((data: { tree: MemoryFileNode[] }) => {
        setTree(data.tree)
      })
      .catch(() => {
        setTree([])
      })
      .finally(() => setTreeLoading(false))
  }, [snapshot.id])

  // Unsaved changes guard
  const handleSelectFile = useCallback(
    (path: string) => {
      if (isDirty) {
        const discard = window.confirm('You have unsaved changes. Discard?')
        if (!discard) return
      }
      setSelectedFile(path)
    },
    [isDirty]
  )

  return (
    <div className="flex h-full -m-4">
      {/* File tree column */}
      <div className="w-[200px] shrink-0 border-r border-border overflow-y-auto p-2">
        <MemoryFileTree
          tree={tree}
          selectedPath={selectedFile}
          onSelectFile={handleSelectFile}
          loading={treeLoading}
        />
      </div>

      {/* Editor column */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <MemoryFileEditor
          agentId={snapshot.id}
          filePath={selectedFile}
          isViewer={isViewer}
          isAgentRunning={isAgentRunning}
          onDirtyChange={setIsDirty}
        />
      </div>
    </div>
  )
}
