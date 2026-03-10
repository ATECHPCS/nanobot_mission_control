'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useMissionControl } from '@/store'
import { useToast } from '@/components/ui/toast-provider'
import { ConfirmModal } from './confirm-modal'
import type { AgentHealthSnapshot, LifecycleAction } from '@/types/agent-health'

interface AgentLifecycleTabProps {
  snapshot: AgentHealthSnapshot
}

/** Format an epoch-ms timestamp for display */
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Human-readable label for a lifecycle action */
function actionLabel(action: LifecycleAction): string {
  switch (action) {
    case 'start': return 'Started'
    case 'stop': return 'Stopped'
    case 'restart': return 'Restarted'
    case 'force_stop': return 'Force killed'
  }
}

/** In-progress label for a lifecycle action */
function pendingLabel(action: LifecycleAction): string {
  switch (action) {
    case 'start': return 'Starting...'
    case 'stop': return 'Stopping...'
    case 'restart': return 'Restarting...'
    case 'force_stop': return 'Force killing...'
  }
}

/** Smart error hint for common error patterns */
function errorHint(error: string, port: number): string {
  if (error.includes('EADDRINUSE') || error.includes('address already in use')) {
    return `Port ${port} is already in use`
  }
  if (error.includes('not found') || error.includes('ENOENT')) {
    return 'nanobot binary not found in PATH'
  }
  return error
}

export function AgentLifecycleTab({ snapshot }: AgentLifecycleTabProps) {
  const { currentUser, isAgentLocked, lifecycleOperations, getAgentLifecycleHistory } = useMissionControl()
  const { show: showToast } = useToast()

  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null)
  const [forceKillAvailable, setForceKillAvailable] = useState(false)
  const [pendingRestart, setPendingRestart] = useState(false)
  const forceKillTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const prevOperationRef = useRef<string | null>(null)

  const locked = isAgentLocked(snapshot.id)
  const currentOp = lifecycleOperations.get(snapshot.id) ?? null
  const history = getAgentLifecycleHistory(snapshot.id)
  const isAlive = snapshot.health.dimensions.process.level === 'green'
  const username = currentUser?.username ?? 'operator'

  // Force Kill: start 10s timer when a stop operation is pending
  useEffect(() => {
    if (currentOp && (currentOp.action === 'stop' || currentOp.action === 'restart') && currentOp.status === 'pending') {
      forceKillTimerRef.current = setTimeout(() => {
        setForceKillAvailable(true)
      }, 10_000)
    } else {
      setForceKillAvailable(false)
      if (forceKillTimerRef.current) {
        clearTimeout(forceKillTimerRef.current)
        forceKillTimerRef.current = undefined
      }
    }
    return () => {
      if (forceKillTimerRef.current) {
        clearTimeout(forceKillTimerRef.current)
      }
    }
  }, [currentOp])

  // Restart flow: when stop completes successfully and pendingRestart is true, trigger start
  useEffect(() => {
    // Detect when a stop operation transitions from active (locked) to completed
    const prevOp = prevOperationRef.current
    prevOperationRef.current = currentOp ? `${currentOp.action}:${currentOp.status}` : null

    // If we had a stop pending and now it is cleared AND pendingRestart is set
    if (pendingRestart && !locked && prevOp?.startsWith('stop:')) {
      // Check that the stop was successful (most recent history entry)
      const lastEntry = history[0]
      if (lastEntry && lastEntry.action === 'stop' && lastEntry.status === 'success') {
        setPendingRestart(false)
        handleStart()
      } else {
        // Stop failed, cancel the restart
        setPendingRestart(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, pendingRestart, history])

  const handleApiCall = useCallback(async (endpoint: string, label: string) => {
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        showToast({ message: body.error || `${label} failed`, type: 'error' })
      }
    } catch {
      showToast({ message: `${label} failed: network error`, type: 'error' })
    }
  }, [showToast])

  const handleStart = useCallback(() => {
    handleApiCall(`/api/agents/${snapshot.id}/start`, 'Start')
  }, [handleApiCall, snapshot.id])

  const handleStop = useCallback(() => {
    handleApiCall(`/api/agents/${snapshot.id}/stop`, 'Stop')
  }, [handleApiCall, snapshot.id])

  const handleRestart = useCallback(() => {
    setPendingRestart(true)
    handleApiCall(`/api/agents/${snapshot.id}/stop`, 'Restart (stop)')
  }, [handleApiCall, snapshot.id])

  const handleForceStop = useCallback(() => {
    handleApiCall(`/api/agents/${snapshot.id}/force-stop`, 'Force kill')
  }, [handleApiCall, snapshot.id])

  const handleConfirm = useCallback(() => {
    const action = confirmAction
    setConfirmAction(null)
    if (action === 'stop') handleStop()
    if (action === 'restart') handleRestart()
  }, [confirmAction, handleStop, handleRestart])

  // --- Render ---

  // No gateway port: show disabled message
  if (!snapshot.agent.gatewayPort) {
    return (
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Lifecycle</h4>
        <p className="text-xs text-muted-foreground">
          No gateway port configured. Lifecycle controls require a configured gateway port.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Launch command display */}
      <div>
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Launch Command</h4>
        {snapshot.agent.launchScript ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1">Launch script</p>
            <code className="block text-xs bg-secondary/50 border border-border rounded px-2 py-1.5 font-mono text-foreground break-all">
              {snapshot.agent.launchScript}
            </code>
          </>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground mb-1">Inferred from config</p>
            <code className="block text-xs bg-secondary/50 border border-border rounded px-2 py-1.5 font-mono text-foreground">
              nanobot gateway --port {snapshot.agent.gatewayPort}
            </code>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div>
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Controls</h4>

        {locked ? (
          <div className="flex items-center gap-2">
            {/* Spinner */}
            <svg className="w-4 h-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-muted-foreground">
              {currentOp ? pendingLabel(currentOp.action) : 'Processing...'}
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            {isAlive ? (
              <>
                <button
                  onClick={() => setConfirmAction('stop')}
                  className="px-3 py-1.5 text-xs rounded-md font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Stop
                </button>
                <button
                  onClick={() => setConfirmAction('restart')}
                  className="px-3 py-1.5 text-xs rounded-md font-medium border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors"
                >
                  Restart
                </button>
              </>
            ) : (
              <button
                onClick={handleStart}
                className="px-3 py-1.5 text-xs rounded-md font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                Start
              </button>
            )}
          </div>
        )}

        {/* Force Kill escalation */}
        {forceKillAvailable && locked && (
          <button
            onClick={handleForceStop}
            className="mt-2 px-3 py-1.5 text-xs rounded-md font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Force Kill
          </button>
        )}
      </div>

      {/* Operation history */}
      <div>
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Operation History</h4>

        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No operations yet</p>
        ) : (
          <div className="space-y-2">
            {history.map((op, i) => (
              <div key={`${op.timestamp}-${op.action}-${i}`} className="text-xs">
                <div className="flex items-center gap-1.5">
                  {/* Status indicator */}
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      op.status === 'success' && 'bg-green-500',
                      op.status === 'error' && 'bg-red-500',
                      op.status === 'pending' && 'bg-yellow-500',
                    )}
                  />
                  <span className="text-foreground">
                    {actionLabel(op.action)}
                    {op.status === 'error' && ' failed'}
                  </span>
                  <span className="text-muted-foreground">
                    by {op.username} at {formatTimestamp(op.timestamp)}
                  </span>
                </div>
                {op.error && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-3">
                    {errorHint(op.error, snapshot.agent.gatewayPort)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={confirmAction !== null}
        title={
          confirmAction === 'stop'
            ? `Stop ${snapshot.name}?`
            : `Restart ${snapshot.name}?`
        }
        message={
          confirmAction === 'stop'
            ? 'This will interrupt any active sessions. The agent will stop processing messages until restarted.'
            : 'This will briefly interrupt active sessions while the agent restarts.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Agent' : 'Restart Agent'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        destructive
      />
    </div>
  )
}
