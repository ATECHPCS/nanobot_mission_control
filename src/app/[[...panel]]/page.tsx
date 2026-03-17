'use client'

import { createElement, lazy, Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { NavRail } from '@/components/layout/nav-rail'
import { HeaderBar } from '@/components/layout/header-bar'
import { OverviewLanding } from '@/components/dashboard/overview-landing'
import { getPluginPanel } from '@/lib/plugins'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LocalModeBanner } from '@/components/layout/local-mode-banner'
import { UpdateBanner } from '@/components/layout/update-banner'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { Loader } from '@/components/ui/loader'
import { ProjectManagerModal } from '@/components/modals/project-manager-modal'
import { ExecApprovalOverlay } from '@/components/modals/exec-approval-overlay'
import { useWebSocket } from '@/lib/websocket'
import { useServerEvents } from '@/lib/use-server-events'
import { completeNavigationTiming } from '@/lib/navigation-metrics'
import { panelHref, useNavigateToPanel } from '@/lib/navigation'
import { clearOnboardingDismissedThisSession, clearOnboardingReplayFromStart, getOnboardingSessionDecision, markOnboardingReplayFromStart, readOnboardingDismissedThisSession } from '@/lib/onboarding-session'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'
import { ToastProvider } from '@/components/ui/toast-provider'

// ---------------------------------------------------------------------------
// Lazy-loaded panels — each chunk only downloads when the panel is visited.
// ---------------------------------------------------------------------------
const LogViewerPanel = lazy(() => import('@/components/panels/log-viewer-panel').then(m => ({ default: m.LogViewerPanel })))
const CronManagementPanel = lazy(() => import('@/components/panels/cron-management-panel').then(m => ({ default: m.CronManagementPanel })))
const MemoryBrowserPanel = lazy(() => import('@/components/panels/memory-browser-panel').then(m => ({ default: m.MemoryBrowserPanel })))
const CostTrackerPanel = lazy(() => import('@/components/panels/cost-tracker-panel').then(m => ({ default: m.CostTrackerPanel })))
const TaskBoardPanel = lazy(() => import('@/components/panels/task-board-panel').then(m => ({ default: m.TaskBoardPanel })))
const ActivityFeedPanel = lazy(() => import('@/components/panels/activity-feed-panel').then(m => ({ default: m.ActivityFeedPanel })))
const StandupPanel = lazy(() => import('@/components/panels/standup-panel').then(m => ({ default: m.StandupPanel })))
const OrchestrationBar = lazy(() => import('@/components/panels/orchestration-bar').then(m => ({ default: m.OrchestrationBar })))
const NotificationsPanel = lazy(() => import('@/components/panels/notifications-panel').then(m => ({ default: m.NotificationsPanel })))
const UserManagementPanel = lazy(() => import('@/components/panels/user-management-panel').then(m => ({ default: m.UserManagementPanel })))
const AuditTrailPanel = lazy(() => import('@/components/panels/audit-trail-panel').then(m => ({ default: m.AuditTrailPanel })))
const WebhookPanel = lazy(() => import('@/components/panels/webhook-panel').then(m => ({ default: m.WebhookPanel })))
const SettingsPanel = lazy(() => import('@/components/panels/settings-panel').then(m => ({ default: m.SettingsPanel })))
const IntegrationsPanel = lazy(() => import('@/components/panels/integrations-panel').then(m => ({ default: m.IntegrationsPanel })))
const AlertRulesPanel = lazy(() => import('@/components/panels/alert-rules-panel').then(m => ({ default: m.AlertRulesPanel })))
const SuperAdminPanel = lazy(() => import('@/components/panels/super-admin-panel').then(m => ({ default: m.SuperAdminPanel })))
const OfficePanel = lazy(() => import('@/components/panels/office-panel').then(m => ({ default: m.OfficePanel })))
const GitHubSyncPanel = lazy(() => import('@/components/panels/github-sync-panel').then(m => ({ default: m.GitHubSyncPanel })))
const DocumentsPanel = lazy(() => import('@/components/panels/documents-panel').then(m => ({ default: m.DocumentsPanel })))
const NanobotSessionPanel = lazy(() => import('@/components/panels/nanobot-session-panel').then(m => ({ default: m.NanobotSessionPanel })))
const NanobotTokenPanel = lazy(() => import('@/components/panels/nanobot-token-panel').then(m => ({ default: m.NanobotTokenPanel })))
const SkillsPanel = lazy(() => import('@/components/panels/skills-panel').then(m => ({ default: m.SkillsPanel })))
const LocalAgentsDocPanel = lazy(() => import('@/components/panels/local-agents-doc-panel').then(m => ({ default: m.LocalAgentsDocPanel })))
const ChannelsPanel = lazy(() => import('@/components/panels/channels-panel').then(m => ({ default: m.ChannelsPanel })))
const DebugPanel = lazy(() => import('@/components/panels/debug-panel').then(m => ({ default: m.DebugPanel })))
const SecurityAuditPanel = lazy(() => import('@/components/panels/security-audit-panel').then(m => ({ default: m.SecurityAuditPanel })))
const NodesPanel = lazy(() => import('@/components/panels/nodes-panel').then(m => ({ default: m.NodesPanel })))
const ExecApprovalPanel = lazy(() => import('@/components/panels/exec-approval-panel').then(m => ({ default: m.ExecApprovalPanel })))
const ChatPagePanel = lazy(() => import('@/components/panels/chat-page-panel').then(m => ({ default: m.ChatPagePanel })))
const ChatPanel = lazy(() => import('@/components/chat/chat-panel').then(m => ({ default: m.ChatPanel })))
const AgentsPanel = lazy(() => import('@/components/agents/agents-panel').then(m => ({ default: m.AgentsPanel })))

/** Lightweight spinner shown while a lazy panel chunk is loading */
function PanelFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex items-center gap-3 text-muted-foreground">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-sm">Loading panel...</span>
      </div>
    </div>
  )
}

interface GatewaySummary {
  id: number
  is_primary: number
}

function renderPluginPanel(panelId: string) {
  const pluginPanel = getPluginPanel(panelId)
  return pluginPanel ? createElement(pluginPanel) : <OverviewLanding />
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export default function Home() {
  const router = useRouter()
  const { connect } = useWebSocket()

  // Subscribe only to state values used in render — setters accessed via getState() in effects
  const activeTab = useMissionControl(s => s.activeTab)
  const showOnboarding = useMissionControl(s => s.showOnboarding)
  const liveFeedOpen = useMissionControl(s => s.liveFeedOpen)
  const showProjectManagerModal = useMissionControl(s => s.showProjectManagerModal)
  const bootComplete = useMissionControl(s => s.bootComplete)
  const { setActiveTab, setChatPanelOpen, toggleLiveFeed, setShowOnboarding, setShowProjectManagerModal, fetchProjects, setBootComplete } = useMissionControl()

  // Sync URL → Zustand activeTab
  const pathname = usePathname()
  const panelFromUrl = pathname === '/' ? 'overview' : pathname.slice(1)
  const normalizedPanel = panelFromUrl === 'sessions' ? 'chat' : panelFromUrl

  useEffect(() => {
    completeNavigationTiming(pathname)
  }, [pathname])

  useEffect(() => {
    completeNavigationTiming(panelHref(activeTab))
  }, [activeTab])

  useEffect(() => {
    setActiveTab(normalizedPanel)
    if (normalizedPanel === 'chat') {
      setChatPanelOpen(false)
    }
    if (panelFromUrl === 'sessions') {
      router.replace('/chat')
    }
  }, [panelFromUrl, normalizedPanel, router, setActiveTab, setChatPanelOpen])

  // Connect to SSE for real-time local DB events (tasks, agents, chat, etc.)
  useServerEvents()
  const [isClient, setIsClient] = useState(false)
  const [initSteps, setInitSteps] = useState<Array<{ key: string; label: string; status: 'pending' | 'done' }>>([
    { key: 'auth',         label: 'Authenticating operator',    status: 'pending' },
    { key: 'capabilities', label: 'Detecting station mode',     status: 'pending' },
    { key: 'config',       label: 'Loading control config',     status: 'pending' },
    { key: 'connect',      label: 'Connecting runtime links',   status: 'pending' },
    { key: 'agents',       label: 'Syncing agent registry',     status: 'pending' },
    { key: 'sessions',     label: 'Loading active sessions',    status: 'pending' },
    { key: 'projects',     label: 'Hydrating workspace board',  status: 'pending' },
    { key: 'memory',       label: 'Mapping memory graph',       status: 'pending' },
    { key: 'skills',       label: 'Indexing skill catalog',     status: 'pending' },
  ])

  const markStep = (key: string) => {
    setInitSteps(prev => prev.map(s => s.key === key ? { ...s, status: 'done' } : s))
  }

  useEffect(() => {
    if (!bootComplete && initSteps.every(s => s.status === 'done')) {
      const t = setTimeout(() => setBootComplete(), 400)
      return () => clearTimeout(t)
    }
  }, [initSteps, bootComplete, setBootComplete])

  // Boot timeout — force-complete after 5s so the dashboard always renders
  useEffect(() => {
    if (bootComplete) return
    const t = setTimeout(() => {
      if (!bootComplete) setBootComplete()
    }, 5000)
    return () => clearTimeout(t)
  }, [bootComplete, setBootComplete])

  // Security console warning (anti-self-XSS)
  useEffect(() => {
    if (!bootComplete) return
    if (typeof window === 'undefined') return
    const key = 'mc-console-warning'
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    console.log(
      '%c  Stop!  ',
      'color: #fff; background: #e53e3e; font-size: 40px; font-weight: bold; padding: 4px 16px; border-radius: 4px;'
    )
    console.log(
      '%cThis is a browser feature intended for developers.\n\nIf someone told you to copy-paste something here to enable a feature or "hack" an account, it is a scam and will give them access to your account.',
      'font-size: 14px; color: #e2e8f0; padding: 8px 0;'
    )
    console.log(
      '%cLearn more: https://en.wikipedia.org/wiki/Self-XSS',
      'font-size: 12px; color: #718096;'
    )
  }, [bootComplete])

  useEffect(() => {
    setIsClient(true)

    // Access boot-only setters via getState() to avoid subscribing to them
    const store = useMissionControl.getState()

    // Mission Control device identity requires a secure browser context.
    // Redirect remote HTTP sessions to HTTPS automatically to avoid handshake failures.
    if (window.location.protocol === 'http:' && !isLocalHost(window.location.hostname)) {
      const secureUrl = new URL(window.location.href)
      secureUrl.protocol = 'https:'
      window.location.replace(secureUrl.toString())
      return
    }

    const connectWithEnvFallback = () => {
      const explicitWsUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || ''
      const gatewayPort = process.env.NEXT_PUBLIC_GATEWAY_PORT || '18789'
      const gatewayHost = process.env.NEXT_PUBLIC_GATEWAY_HOST || window.location.hostname
      const gatewayProto =
        process.env.NEXT_PUBLIC_GATEWAY_PROTOCOL ||
        (window.location.protocol === 'https:' ? 'wss' : 'ws')
      const wsUrl = explicitWsUrl || `${gatewayProto}://${gatewayHost}:${gatewayPort}`
      connect(wsUrl)
    }

    const connectWithPrimaryGateway = async (): Promise<{ attempted: boolean; connected: boolean }> => {
      try {
        const gatewaysRes = await fetch('/api/gateways')
        if (!gatewaysRes.ok) return { attempted: false, connected: false }
        const gatewaysJson = await gatewaysRes.json().catch(() => ({}))
        const gateways = Array.isArray(gatewaysJson?.gateways) ? gatewaysJson.gateways as GatewaySummary[] : []
        if (gateways.length === 0) return { attempted: false, connected: false }

        const primaryGateway = gateways.find(gw => Number(gw?.is_primary) === 1) || gateways[0]
        if (!primaryGateway?.id) return { attempted: true, connected: false }

        const connectRes = await fetch('/api/gateways/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: primaryGateway.id }),
        })
        if (!connectRes.ok) return { attempted: true, connected: false }

        const payload = await connectRes.json().catch(() => ({}))
        const wsUrl = typeof payload?.ws_url === 'string' ? payload.ws_url : ''
        const wsToken = typeof payload?.token === 'string' ? payload.token : ''
        if (!wsUrl) return { attempted: true, connected: false }

        connect(wsUrl, wsToken)
        return { attempted: true, connected: true }
      } catch {
        return { attempted: false, connected: false }
      }
    }

    // Fetch current user
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.ok) return res.json()
        if (res.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`)
        }
        return null
      })
      .then(data => { if (data?.user) store.setCurrentUser(data.user); markStep('auth') })
      .catch(() => { markStep('auth') })

    // Check for available updates
    fetch('/api/releases/check')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.updateAvailable) {
          store.setUpdateAvailable({
            latestVersion: data.latestVersion,
            releaseUrl: data.releaseUrl,
            releaseNotes: data.releaseNotes,
          })
        }
      })
      .catch(() => {})

    // Check capabilities, then conditionally connect to gateway
    fetch('/api/status?action=capabilities')
      .then(res => res.ok ? res.json() : null)
      .then(async data => {
        if (data?.subscription) {
          store.setSubscription(data.subscription)
        }
        if (data?.processUser) {
          store.setDefaultOrgName(data.processUser)
        }
        if (data?.interfaceMode === 'essential' || data?.interfaceMode === 'full') {
          store.setInterfaceMode(data.interfaceMode)
        }
        if (data && data.gateway === false) {
          store.setDashboardMode('local')
          store.setGatewayAvailable(false)
          store.setCapabilitiesChecked(true)
          markStep('capabilities')
          markStep('connect')
          return
        }
        if (data && data.gateway === true) {
          store.setDashboardMode('full')
          store.setGatewayAvailable(true)
        }
        store.setCapabilitiesChecked(true)
        markStep('capabilities')

        const primaryConnect = await connectWithPrimaryGateway()
        if (!primaryConnect.connected && !primaryConnect.attempted) {
          connectWithEnvFallback()
        }
        markStep('connect')
      })
      .catch(() => {
        store.setCapabilitiesChecked(true)
        markStep('capabilities')
        markStep('connect')
        connectWithEnvFallback()
      })

    // Check onboarding state
    fetch('/api/onboarding')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const decision = getOnboardingSessionDecision({
          isAdmin: data?.isAdmin === true,
          serverShowOnboarding: data?.showOnboarding === true,
          completed: data?.completed === true,
          skipped: data?.skipped === true,
          dismissedThisSession: readOnboardingDismissedThisSession(),
        })

        if (decision.shouldOpen) {
          clearOnboardingDismissedThisSession()
          if (decision.replayFromStart) {
            markOnboardingReplayFromStart()
          } else {
            clearOnboardingReplayFromStart()
          }
          setShowOnboarding(true)
        }
        markStep('config')
      })
      .catch(() => { markStep('config') })
    // Preload workspace data in parallel
    Promise.allSettled([
      fetch('/api/agents')
        .then(r => r.ok ? r.json() : null)
        .then((agentsData) => {
          if (agentsData?.agents) store.setAgents(agentsData.agents)
        })
        .finally(() => { markStep('agents') }),
      fetch('/api/sessions')
        .then(r => r.ok ? r.json() : null)
        .then((sessionsData) => {
          if (sessionsData?.sessions) store.setSessions(sessionsData.sessions)
        })
        .finally(() => { markStep('sessions') }),
      fetch('/api/projects')
        .then(r => r.ok ? r.json() : null)
        .then((projectsData) => {
          if (projectsData?.projects) store.setProjects(projectsData.projects)
        })
        .finally(() => { markStep('projects') }),
      fetch('/api/memory/graph?agent=all')
        .then(r => r.ok ? r.json() : null)
        .then((graphData) => {
          if (graphData?.agents) store.setMemoryGraphAgents(graphData.agents)
        })
        .finally(() => { markStep('memory') }),
      fetch('/api/skills')
        .then(r => r.ok ? r.json() : null)
        .then((skillsData) => {
          if (skillsData?.skills) store.setSkillsData(skillsData.skills, skillsData.groups || [], skillsData.total || 0)
        })
        .finally(() => { markStep('skills') }),
    ]).catch(() => { /* panels will lazy-load as fallback */ })

  // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once on mount
  }, [])

  if (!isClient) {
    return <Loader variant="page" />
  }

  return (
    <ToastProvider>
    {/* Loader overlay — fades out when boot completes */}
    {!bootComplete && (
      <div className="fixed inset-0 z-50">
        <Loader variant="page" steps={initSteps} />
      </div>
    )}
    <div className={`flex bg-background overflow-hidden transition-opacity duration-500 safe-area-shell ${bootComplete ? 'opacity-100' : 'opacity-0'}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Left: Icon rail navigation (hidden on mobile, shown as bottom bar instead) */}
      {!showOnboarding && <NavRail />}

      {/* Center: Header + Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!showOnboarding && (
          <>
            <HeaderBar />
            <LocalModeBanner />
            <UpdateBanner />
          </>
        )}
        <main
          id="main-content"
          className={`flex-1 overflow-auto pb-16 md:pb-0 ${showOnboarding ? 'pointer-events-none select-none blur-[2px] opacity-30' : ''}`}
          role="main"
          aria-hidden={showOnboarding}
        >
          <div aria-live="polite" className="flex flex-col min-h-full">
            <ErrorBoundary key={activeTab}>
              <Suspense fallback={<PanelFallback />}>
                <ContentRouter tab={activeTab} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Right: Live feed placeholder (component removed) */}
      {!showOnboarding && liveFeedOpen && (
        <div className="hidden lg:flex h-full">
          {/* LiveFeed removed */}
        </div>
      )}

      {/* Floating button to reopen LiveFeed when closed */}
      {!showOnboarding && !liveFeedOpen && (
        <button
          onClick={toggleLiveFeed}
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 w-6 h-12 items-center justify-center bg-card border border-r-0 border-border rounded-l-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
          title="Show live feed"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Chat panel overlay */}
      {!showOnboarding && <Suspense fallback={null}><ChatPanel /></Suspense>}

      {/* Global exec approval overlay (shown regardless of active panel) */}
      {!showOnboarding && <ExecApprovalOverlay />}

      {/* Global Project Manager Modal */}
      {!showOnboarding && showProjectManagerModal && (
        <ProjectManagerModal
          onClose={() => setShowProjectManagerModal(false)}
          onChanged={async () => { await fetchProjects() }}
        />
      )}

      <OnboardingWizard />
    </div>
    </ToastProvider>
  )
}

const ESSENTIAL_PANELS = new Set([
  'overview', 'agents', 'tasks', 'chat', 'activity', 'logs', 'settings',
])

function ContentRouter({ tab }: { tab: string }) {
  const { dashboardMode, interfaceMode, setInterfaceMode } = useMissionControl()
  const navigateToPanel = useNavigateToPanel()
  const isLocal = dashboardMode === 'local'

  // Handle nanobot-sessions deep links: /nanobot-sessions/{agent}/{session}
  if (tab === 'nanobot-sessions' || tab.startsWith('nanobot-sessions/')) {
    return <NanobotSessionPanel />
  }

  // Unified token dashboard (replaces legacy /tokens as default nav target)
  if (tab === 'nanobot-tokens') {
    return <NanobotTokenPanel />
  }

  // Guard: show nudge for non-essential panels in essential mode
  if (interfaceMode === 'essential' && !ESSENTIAL_PANELS.has(tab)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground capitalize">{tab.replace(/-/g, ' ')}</span> is available in Full mode.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setInterfaceMode('full')
              try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { 'general.interface_mode': 'full' } }) }) } catch {}
            }}
          >
            Switch to Full
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateToPanel('overview')}
          >
            Go to Overview
          </Button>
        </div>
      </div>
    )
  }

  switch (tab) {
    case 'overview':
      return <OverviewLanding />
    case 'tasks':
      return <TaskBoardPanel />
    case 'agents':
      if (isLocal) return <AgentsPanel />
      return (
        <>
          <OrchestrationBar />
          <AgentsPanel />
        </>
      )
    case 'notifications':
      return <NotificationsPanel />
    case 'standup':
      return <StandupPanel />
    case 'sessions':
      return <ChatPagePanel />
    case 'logs':
      return <LogViewerPanel />
    case 'cron':
      return <CronManagementPanel />
    case 'memory':
      return <MemoryBrowserPanel />
    case 'cost-tracker':
    case 'tokens':
    case 'agent-costs':
      return <CostTrackerPanel />
    case 'users':
      return <UserManagementPanel />
    case 'history':
    case 'activity':
      return <ActivityFeedPanel />
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
    case 'super-admin':
      return <SuperAdminPanel />
    case 'github':
      return <GitHubSyncPanel />
    case 'office':
      return <OfficePanel />
    case 'documents':
      return <DocumentsPanel />
    case 'skills':
      return <SkillsPanel />
    case 'channels':
      if (isLocal) return <LocalModeUnavailable panel={tab} />
      return <ChannelsPanel />
    case 'nodes':
      if (isLocal) return <LocalModeUnavailable panel={tab} />
      return <NodesPanel />
    case 'security':
      return <SecurityAuditPanel />
    case 'debug':
      return <DebugPanel />
    case 'exec-approvals':
      if (isLocal) return <LocalModeUnavailable panel={tab} />
      return <ExecApprovalPanel />
    case 'chat':
      return <ChatPagePanel />
    default: {
      return renderPluginPanel(tab)
    }
  }
}

function LocalModeUnavailable({ panel }: { panel: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{panel}</span> requires a gateway connection.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Configure a gateway to enable this panel.
      </p>
    </div>
  )
}
