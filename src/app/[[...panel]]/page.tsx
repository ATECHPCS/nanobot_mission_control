'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { NavRail } from '@/components/layout/nav-rail'
import { HeaderBar } from '@/components/layout/header-bar'
import { OverviewLanding } from '@/components/dashboard/overview-landing'
import { AgentSpawnPanel } from '@/components/panels/agent-spawn-panel'
import { LogViewerPanel } from '@/components/panels/log-viewer-panel'
import { CronManagementPanel } from '@/components/panels/cron-management-panel'
import { MemoryBrowserPanel } from '@/components/panels/memory-browser-panel'
import { TokenDashboardPanel } from '@/components/panels/token-dashboard-panel'
import { AgentCostPanel } from '@/components/panels/agent-cost-panel'
import { SessionDetailsPanel } from '@/components/panels/session-details-panel'
import { TaskBoardPanel } from '@/components/panels/task-board-panel'
import { ActivityFeedPanel } from '@/components/panels/activity-feed-panel'
import { StandupPanel } from '@/components/panels/standup-panel'
import { OrchestrationBar } from '@/components/panels/orchestration-bar'
import { NotificationsPanel } from '@/components/panels/notifications-panel'
import { UserManagementPanel } from '@/components/panels/user-management-panel'
import { AuditTrailPanel } from '@/components/panels/audit-trail-panel'
import { AgentHistoryPanel } from '@/components/panels/agent-history-panel'
import { WebhookPanel } from '@/components/panels/webhook-panel'
import { SettingsPanel } from '@/components/panels/settings-panel'
import { IntegrationsPanel } from '@/components/panels/integrations-panel'
import { AlertRulesPanel } from '@/components/panels/alert-rules-panel'
import { SuperAdminPanel } from '@/components/panels/super-admin-panel'
import { OfficePanel } from '@/components/panels/office-panel'
import { GitHubSyncPanel } from '@/components/panels/github-sync-panel'
import { DocumentsPanel } from '@/components/panels/documents-panel'
import { NanobotSessionPanel } from '@/components/panels/nanobot-session-panel'
import { NanobotTokenPanel } from '@/components/panels/nanobot-token-panel'
import { ChatPanel } from '@/components/chat/chat-panel'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LocalModeBanner } from '@/components/layout/local-mode-banner'
import { UpdateBanner } from '@/components/layout/update-banner'
import { PromoBanner } from '@/components/layout/promo-banner'
import { useServerEvents } from '@/lib/use-server-events'
import { useMissionControl } from '@/store'
import { ToastProvider } from '@/components/ui/toast-provider'

export default function Home() {
  const router = useRouter()
  const { activeTab, setActiveTab, setCurrentUser, setDashboardMode, setGatewayAvailable, setSubscription, setUpdateAvailable } = useMissionControl()

  // Sync URL → Zustand activeTab
  const pathname = usePathname()
  const panelFromUrl = pathname === '/' ? 'overview' : pathname.slice(1)

  useEffect(() => {
    setActiveTab(panelFromUrl)
  }, [panelFromUrl, setActiveTab])

  // Connect to SSE for real-time local DB events (tasks, agents, chat, etc.)
  useServerEvents()
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    // Fetch current user
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.ok) return res.json()
        if (res.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`)
        }
        return null
      })
      .then(data => { if (data?.user) setCurrentUser(data.user) })
      .catch(() => {})

    // Check for available updates
    fetch('/api/releases/check')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.updateAvailable) {
          setUpdateAvailable({
            latestVersion: data.latestVersion,
            releaseUrl: data.releaseUrl,
            releaseNotes: data.releaseNotes,
          })
        }
      })
      .catch(() => {})

    // Check capabilities
    fetch('/api/status?action=capabilities')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.subscription) {
          setSubscription(data.subscription)
        }
        if (data && data.gateway === false) {
          setDashboardMode('local')
          setGatewayAvailable(false)
          return
        }
        if (data && data.gateway === true) {
          setDashboardMode('full')
          setGatewayAvailable(true)
        }
      })
      .catch(() => {})
  }, [pathname, router, setCurrentUser, setDashboardMode, setGatewayAvailable, setSubscription, setUpdateAvailable])

  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">MC</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-muted-foreground">Loading Mission Control...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Skip to main content
        </a>
        {/* Left: Icon rail navigation (hidden on mobile, shown as bottom bar instead) */}
        <NavRail />

        {/* Center: Header + Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <HeaderBar />
          <LocalModeBanner />
          <UpdateBanner />
          <PromoBanner />
          <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0" role="main">
            <div aria-live="polite">
              <ErrorBoundary key={activeTab}>
                <ContentRouter tab={activeTab} />
              </ErrorBoundary>
            </div>
          </main>
        </div>

        {/* Chat panel overlay */}
        <ChatPanel />
      </div>
    </ToastProvider>
  )
}

function ContentRouter({ tab }: { tab: string }) {
  const { dashboardMode } = useMissionControl()
  const isLocal = dashboardMode === 'local'

  // Handle nanobot-sessions deep links: /nanobot-sessions/{agent}/{session}
  if (tab === 'nanobot-sessions' || tab.startsWith('nanobot-sessions/')) {
    return <NanobotSessionPanel />
  }

  // Unified token dashboard (replaces legacy /tokens as default nav target)
  if (tab === 'nanobot-tokens') {
    return <NanobotTokenPanel />
  }

  switch (tab) {
    case 'overview':
    case 'agents':
      return <OverviewLanding />
    case 'tasks':
      return <TaskBoardPanel />
    case 'activity':
      return <ActivityFeedPanel />
    case 'notifications':
      return <NotificationsPanel />
    case 'standup':
      return <StandupPanel />
    case 'spawn':
      return <AgentSpawnPanel />
    case 'sessions':
      return <SessionDetailsPanel />
    case 'logs':
      return <LogViewerPanel />
    case 'cron':
      return <CronManagementPanel />
    case 'memory':
      return <MemoryBrowserPanel />
    case 'tokens':
      return <TokenDashboardPanel />
    case 'agent-costs':
      return <AgentCostPanel />
    case 'users':
      return <UserManagementPanel />
    case 'history':
      return <AgentHistoryPanel />
    case 'audit':
      return <AuditTrailPanel />
    case 'webhooks':
      return <WebhookPanel />
    case 'alerts':
      return <AlertRulesPanel />
    case 'integrations':
      return <IntegrationsPanel />
    case 'settings':
      return <SettingsPanel />
    case 'github':
      return <GitHubSyncPanel />
    case 'office':
      return <OfficePanel />
    case 'documents':
      return <DocumentsPanel />
    case 'super-admin':
      return <SuperAdminPanel />
    case 'workspaces':
      return <SuperAdminPanel />
    default:
      return <OverviewLanding />
  }
}
