'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useMissionControl } from '@/store'
import { AgentSidebar } from '@/components/sessions/agent-sidebar'
import { SessionList } from '@/components/sessions/session-list'
import { ChatViewer } from '@/components/sessions/chat-viewer'

export function NanobotSessionPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    sessionViewerAgent,
    sessionViewerSession,
    discoveredAgents,
    setSessionViewerAgent,
    setSessionViewerSession,
    setSessionViewerAgentSidebar,
  } = useMissionControl()

  // Parse deep-link URL on mount: /nanobot-sessions/{agentId}/{sessionFilename}
  useEffect(() => {
    const segments = pathname.replace(/^\//, '').split('/')
    // segments: ["nanobot-sessions"] or ["nanobot-sessions", agentId] or ["nanobot-sessions", agentId, sessionFilename]
    if (segments[0] === 'nanobot-sessions') {
      if (segments[1] && segments[1] !== sessionViewerAgent) {
        setSessionViewerAgent(segments[1])
        setSessionViewerAgentSidebar(false) // auto-collapse on deep link
      }
      if (segments[2] && segments[2] !== sessionViewerSession) {
        setSessionViewerSession(segments[2])
      }
    }
    // Only run on initial mount / pathname change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Sync Zustand state changes to URL
  useEffect(() => {
    if (!sessionViewerAgent) return

    const targetPath = sessionViewerSession
      ? `/nanobot-sessions/${sessionViewerAgent}/${sessionViewerSession}`
      : `/nanobot-sessions/${sessionViewerAgent}`

    if (pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath)
    }
  }, [sessionViewerAgent, sessionViewerSession, pathname])

  // Find agent icon for chat viewer
  const selectedAgentSnapshot = discoveredAgents.find((a) => a.id === sessionViewerAgent)
  const agentIcon = selectedAgentSnapshot?.agent?.icon

  return (
    <div className="flex h-[calc(100dvh-3rem)] overflow-hidden relative">
      {/* Left: Agent sidebar */}
      <AgentSidebar />

      {/* Center + Right */}
      {!sessionViewerAgent ? (
        /* No agent selected */
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" className="w-12 h-12 mx-auto mb-3 opacity-30">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
            <p className="text-sm font-medium">Select an agent to browse sessions</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Choose an agent from the sidebar to view conversation history
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Center: Session list */}
          <SessionList agentId={sessionViewerAgent} />

          {/* Right: Chat viewer */}
          {sessionViewerSession ? (
            <ChatViewer
              agentId={sessionViewerAgent}
              sessionFilename={sessionViewerSession}
              agentIcon={agentIcon}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" className="w-10 h-10 mx-auto mb-2 opacity-30">
                  <path d="M2 3h12v9H2zM5 12v2M11 12v2M4 14h8" />
                </svg>
                <p className="text-sm">Select a session to view messages</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
