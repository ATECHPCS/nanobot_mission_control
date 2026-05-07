'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { WheelEvent, MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useMissionControl, Agent } from '@/store'
import { WalkingCrewmate } from './office/walking-crewmate'
import { ActivityGlyph } from './office/activity-glyph'
import { SpeechBubble } from './office/speech-bubble'
import { pickDeadpanLine } from '@/lib/office-deadpan'
import type { ActivityState, ActivityKind } from '@/lib/agent-activity'
import {
  buildOfficeLayout,
  isGsdAgent,
  isLocalSession,
  isNamedNanobotAgent,
  NANOBOT_AGENT_DEFS,
  ROOM_DEFS,
  HALLWAYS,
  ROOM_FURNITURE,
  type RoomId,
  type SeatedAgent,
  type RoomDefinition,
  type NanobotAgentStatus,
} from '@/lib/office-layout'
import { FURNITURE_COMPONENTS } from './office/furniture'

/* ── Types ────────────────────────────────────────────────── */

interface SessionAgentRow {
  id: string
  key: string
  agent: string
  kind: string
  model: string
  active: boolean
  lastActivity?: number
  workingDir?: string | null
}

type SidebarFilter = 'all' | 'working' | 'idle' | 'gsd'

/* ── Helpers ──────────────────────────────────────────────── */

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Among Us crewmate color palette
const CREW_COLORS = [
  '#2b57d4', // blue
  '#12802c', // green
  '#c51111', // red
  '#ed54ba', // pink
  '#f07d0d', // orange
  '#f5f557', // yellow
  '#3f474e', // black
  '#d6e0f0', // white
  '#6b2fbb', // purple
  '#71491e', // brown
  '#38fedc', // cyan
  '#50ef39', // lime
]

function crewColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return CREW_COLORS[Math.abs(hash) % CREW_COLORS.length]
}

function crewColorClass(name: string): string {
  const bgColors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-red-600', 'bg-pink-500',
    'bg-orange-500', 'bg-yellow-500', 'bg-gray-700', 'bg-slate-200',
    'bg-violet-600', 'bg-amber-800', 'bg-cyan-400', 'bg-lime-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return bgColors[Math.abs(hash) % bgColors.length]
}

const statusDot: Record<string, string> = {
  idle: 'bg-amber-400',
  busy: 'bg-emerald-400',
  error: 'bg-red-400',
  offline: 'bg-gray-500',
}

const statusLabel: Record<string, string> = {
  idle: 'Idle',
  busy: 'Active',
  error: 'Alert',
  offline: 'Offline',
}

function formatLastSeen(ts?: number): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts * 1000
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Map session slugs / working dirs to known nanobot agent names. */
const SLUG_TO_AGENT: [RegExp, string][] = [
  [/\bcody\b/i, 'Cody'],
  [/\bstefany\b|bookkeeping.bot/i, 'Stefany'],
  [/\bandy\b/i, 'Andy'],
]

function resolveAgentName(row: SessionAgentRow): string {
  const slug = String(row.agent || '')
  const dir = String(row.workingDir || '')
  const combined = `${slug} ${dir}`
  for (const [re, name] of SLUG_TO_AGENT) {
    if (re.test(combined)) return name
  }
  return slug.trim()
}

function inferLocalRole(row: SessionAgentRow): string {
  const context = [
    String(row.agent || ''),
    String(row.key || ''),
    String(row.workingDir || ''),
    String(row.kind || ''),
  ].join(' ').toLowerCase()

  if (/gsd/.test(context)) return 'gsd-agent'
  if (/frontend|ui|ux|design|landing|web/.test(context)) return 'frontend-engineer'
  if (/backend|api|server|platform|infra|ops|sre|deploy/.test(context)) return 'ops-engineer'
  if (/research|science|ml|ai|llm|data/.test(context)) return 'research-analyst'
  if (/qa|test|e2e|spec|validation/.test(context)) return 'qa-engineer'
  return row.kind || 'local-session'
}

function isInactiveLocalSession(agent: Agent): boolean {
  return Boolean((agent.config as any)?.localSession) && agent.status !== 'busy'
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/* ── Crewmate SVG ─────────────────────────────────────────── */

function Crewmate({ color, size = 28, status, animate }: {
  color: string
  size?: number
  status: Agent['status']
  animate?: boolean
}) {
  const visorColor = '#9bc4e2'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 40"
      fill="none"
      className={animate && status === 'busy' ? 'animate-bounce' : ''}
      style={{ filter: status === 'offline' ? 'saturate(0.3) brightness(0.6)' : undefined }}
    >
      {/* Body */}
      <rect x="6" y="10" width="20" height="22" rx="8" fill={color} />
      {/* Backpack */}
      <rect x="2" y="16" width="6" height="12" rx="3" fill={color} opacity="0.85" />
      {/* Visor */}
      <rect x="14" y="12" width="12" height="10" rx="5" fill={visorColor} opacity="0.9" />
      <rect x="16" y="14" width="4" height="3" rx="1.5" fill="white" opacity="0.5" />
      {/* Legs */}
      <rect x="8" y="30" width="7" height="8" rx="3" fill={color} />
      <rect x="17" y="30" width="7" height="8" rx="3" fill={color} />
      {/* Status indicator */}
      {status === 'busy' && (
        <circle cx="26" cy="10" r="4" fill="#fbbf24" stroke="#1a1a1a" strokeWidth="1.5">
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
      {status === 'error' && (
        <circle cx="26" cy="10" r="4" fill="#ef4444" stroke="#1a1a1a" strokeWidth="1.5">
          <animate attributeName="r" values="3;5;3" dur="0.8s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}


/* ── Agent drift — subtle wandering animation ────────────── */

function useAgentDrift(agentId: string | number, status: string) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    // Only idle agents wander; busy agents stay put (working at desk)
    if (status === 'busy' || status === 'offline') {
      setOffset({ x: 0, y: 0 })
      return
    }

    function drift() {
      // Random offset in range [-3%, 3%] — subtle shift
      setOffset({
        x: (Math.random() - 0.5) * 6,
        y: (Math.random() - 0.5) * 4,
      })
      // Next drift in 4-10 seconds
      timeoutRef.current = setTimeout(drift, 4000 + Math.random() * 6000)
    }

    // Start after a random delay so agents don't all move at once
    timeoutRef.current = setTimeout(drift, 2000 + Math.random() * 5000)

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [agentId, status])

  return offset
}

function DriftingCrewmate({ seated, crewSize, nameSize, onAgentClick, activityKind }: {
  seated: SeatedAgent
  crewSize: number
  nameSize: number
  onAgentClick: (agent: Agent) => void
  activityKind?: ActivityKind
}) {
  const drift = useAgentDrift(seated.agent.id, seated.agent.status)

  return (
    <button
      className={`relative cursor-pointer group${activityKind ? ` activity-${activityKind}` : ''}`}
      style={{
        left: `${drift.x}px`,
        top: `${drift.y}px`,
        transition: 'left 2s ease-in-out, top 2s ease-in-out',
      }}
      onClick={(e) => { e.stopPropagation(); onAgentClick(seated.agent) }}
      title={seated.agent.name}
    >
      {activityKind ? <ActivityGlyph kind={activityKind} size={Math.round(crewSize * 0.45)} /> : null}
      <Crewmate
        color={crewColor(seated.agent.name)}
        size={crewSize}
        status={seated.agent.status}
        animate
      />
      {/* Name tag — always visible */}
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 text-white rounded px-1 sm:px-1.5 py-0.5 pointer-events-none z-10"
        style={{ top: `${crewSize + 2}px`, fontSize: `${nameSize}px` }}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot[seated.agent.status]} mr-0.5`} />
        {seated.agent.name}
      </div>
    </button>
  )
}

/* ── Room Component ───────────────────────────────────────── */

function OfficeRoom({ room, agents, zoom }: {
  room: RoomDefinition
  agents: SeatedAgent[]
  zoom: number
}) {
  const labelSize = Math.max(8, Math.round(12 / zoom))

  return (
    <div
      className={`absolute border-2 rounded-lg ${room.color} transition-colors`}
      style={{
        left: `${room.x}%`,
        top: `${room.y}%`,
        width: `${room.w}%`,
        height: `${room.h}%`,
        backgroundColor: room.wallColor,
        backgroundImage: room.floorPattern ?? undefined,
      }}
    >
      {/* Room label */}
      <div
        className="absolute left-1.5 sm:left-2 top-0.5 sm:top-1 font-mono uppercase tracking-wider text-white/60"
        style={{ fontSize: `${labelSize}px` }}
      >
        {room.label}
        {agents.length > 0 && (
          <span className="ml-1 text-white/30">({agents.length})</span>
        )}
      </div>

      {/* Door notch on the wall nearest corridor */}
      {room.y < 50 ? (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 sm:w-6 h-2 sm:h-3 rounded-b bg-slate-700/60 border border-slate-600/30" />
      ) : (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 sm:w-6 h-2 sm:h-3 rounded-t bg-slate-700/60 border border-slate-600/30" />
      )}

      {/* Furniture */}
      {(ROOM_FURNITURE[room.id] || []).map((entry, i) => {
        const Comp = FURNITURE_COMPONENTS[entry.kind]
        if (entry.kind === 'rug') {
          return (
            <div
              key={`${entry.kind}-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left:   `${entry.x}%`,
                top:    `${entry.y}%`,
                width:  `${entry.w ?? 40}%`,
                height: `${entry.h ?? 20}%`,
                zIndex: 0,
              }}
            >
              <Comp palette={room.palette} w={entry.w} h={entry.h} size={36} />
            </div>
          )
        }
        return (
          <div
            key={`${entry.kind}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${entry.x}%`, top: `${entry.y}%`, zIndex: 1 }}
          >
            <Comp palette={room.palette} size={36} />
          </div>
        )
      })}

      {/* Empty room message */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-white/15 text-[10px] sm:text-xs font-mono">
          empty
        </div>
      )}
    </div>
  )
}

/* ── Main Panel ───────────────────────────────────────────── */

export function OfficePanel({ kiosk = false }: { kiosk?: boolean } = {}) {
  const {
    agents, dashboardMode,
    officeSessionAgents: sessionAgents, setOfficeSessionAgents: setSessionAgents,
    officeLocalAgents: localAgents, setOfficeLocalAgents: setLocalAgents,
    officeNanobotStatus: nanobotStatusObj, setOfficeNanobotStatus: setNanobotStatusObj,
    officeDataFetched, setOfficeDataFetched,
    officeActivities, setOfficeActivities,
  } = useMissionControl()
  const isLocalMode = dashboardMode === 'local'

  const searchParams = useSearchParams()
  const demoMode = searchParams?.get('demo') === '1'
  const kioskTokenQuery = kiosk
    ? `?token=${encodeURIComponent(searchParams?.get('token') || '')}`
    : ''

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [hideGsd, setHideGsd] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('office-hide-gsd') === '1'
    return false
  })
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all')
  const [loading, setLoading] = useState(!officeDataFetched)
  const [localBootstrapping, setLocalBootstrapping] = useState(isLocalMode && !officeDataFetched)
  const [localSessionFilter, setLocalSessionFilter] = useState<'running' | 'not-running'>('running')
  const [mapZoom, setMapZoom] = useState(1)
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 })
  const [refreshing, setRefreshing] = useState(false)

  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const localBootstrapRetries = useRef(0)
  const dragActiveRef = useRef(false)
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })

  /* ── Speech bubbles ─────────────────────────────────────── */

  interface ActiveBubble {
    agentName: string
    text: string
    id: number
  }

  const [bubbles, setBubbles] = useState<ActiveBubble[]>([])
  const lastBubbleByAgent = useRef<Record<string, string>>({})
  const lastKindByAgent = useRef<Record<string, ActivityKind>>({})
  const bubbleIdRef = useRef(0)
  const MAX_BUBBLES = 3

  const showBubble = useCallback((agentName: string, kind: ActivityKind, subject?: string) => {
    const text = pickDeadpanLine(kind, subject, lastBubbleByAgent.current[agentName] ?? null, agentName)
    if (!text) return
    lastBubbleByAgent.current[agentName] = text
    bubbleIdRef.current += 1
    const id = bubbleIdRef.current
    setBubbles(curr => {
      const next = [...curr, { agentName, text, id }]
      while (next.length > MAX_BUBBLES) next.shift()
      return next
    })
  }, [])

  // Trigger on activity change
  useEffect(() => {
    const newKinds: Record<string, ActivityKind> = {}
    for (const [name, state] of Object.entries(officeActivities)) {
      newKinds[name] = state.kind
      if (lastKindByAgent.current[name] !== state.kind) {
        showBubble(name, state.kind, state.subject)
      }
    }
    lastKindByAgent.current = newKinds
  }, [officeActivities, showBubble])

  // Scheduled cadence — every ~35-55s pick a random agent and show a bubble
  useEffect(() => {
    const id = window.setInterval(() => {
      const names = Object.keys(officeActivities)
      if (names.length === 0) return
      const pick = names[Math.floor(Math.random() * names.length)]
      const state = officeActivities[pick]
      if (!state) return
      showBubble(pick, state.kind, state.subject)
    }, 35_000 + Math.floor(Math.random() * 20_000))
    return () => window.clearInterval(id)
  }, [officeActivities, showBubble])

  const dismissBubble = useCallback((id: number) => {
    setBubbles(curr => curr.filter(b => b.id !== id))
  }, [])

  /* ── Data fetching ──────────────────────────────────────── */

  const fetchAgents = useCallback(async () => {
    let nextLocalAgents: Agent[] = []
    let nextSessionAgents: Agent[] = []

    try {
      const [agentRes, sessionRes, nanobotRes] = await Promise.all([
        fetch(`/api/agents${kioskTokenQuery}`),
        isLocalMode ? fetch(`/api/sessions${kioskTokenQuery}`) : Promise.resolve(null),
        isLocalMode ? fetch(`/api/nanobot/status${kioskTokenQuery}`) : Promise.resolve(null),
      ])

      if (isLocalMode && nanobotRes?.ok) {
        const nbJson = await nanobotRes.json().catch(() => ({}))
        const statusObj: Record<string, { status: string; lastActivity: number | null; activeSession: string | null }> = {}
        if (Array.isArray(nbJson?.agents)) {
          for (const a of nbJson.agents) {
            statusObj[String(a.name).toLowerCase()] = {
              status: a.status,
              lastActivity: a.lastActivity,
              activeSession: a.activeSession,
            }
          }
        }
        setNanobotStatusObj(statusObj)
      }

      if (agentRes.ok) {
        const data = await agentRes.json()
        nextLocalAgents = Array.isArray(data.agents) ? data.agents : []
        setLocalAgents(nextLocalAgents)
      }

      if (isLocalMode && sessionRes?.ok) {
        const sessionJson = await sessionRes.json().catch(() => ({}))
        const rows = Array.isArray(sessionJson?.sessions) ? sessionJson.sessions as SessionAgentRow[] : []
        const byAgent = new Map<string, Agent>()
        let idx = 0

        for (const row of rows) {
          const name = resolveAgentName(row)
          if (!name) continue
          const existing = byAgent.get(name)
          const nowSec = Math.floor(Date.now() / 1000)
          const lastSeenSec = row.lastActivity ? Math.floor(row.lastActivity / 1000) : nowSec
          const candidate: Agent = {
            id: -5000 - idx,
            name,
            role: NANOBOT_AGENT_DEFS.find(d => d.name === name)?.role || inferLocalRole(row),
            status: row.active ? 'busy' : 'idle',
            last_seen: lastSeenSec,
            last_activity: `${row.kind || 'session'} · ${row.model || 'unknown model'}`,
            session_key: row.key || row.id,
            created_at: nowSec,
            updated_at: nowSec,
            config: {
              localSession: {
                sessionId: row.id,
                key: row.key,
                workingDir: row.workingDir || null,
                kind: row.kind || 'session',
              },
            },
          }

          const shouldReplace =
            !existing ||
            (existing.status !== 'busy' && candidate.status === 'busy') ||
            (existing.status === candidate.status && (candidate.last_seen || 0) > (existing.last_seen || 0))

          if (shouldReplace) {
            byAgent.set(name, candidate)
            idx += 1
          }
        }

        nextSessionAgents = Array.from(byAgent.values())
        setSessionAgents(nextSessionAgents)
      }
    } catch { /* ignore */ }

    if (isLocalMode) {
      const hasAny = nextLocalAgents.length > 0 || nextSessionAgents.length > 0
      if (hasAny) setLocalBootstrapping(false)
      if (!hasAny && localBootstrapRetries.current < 5) {
        localBootstrapRetries.current += 1
        setLoading(true)
        setTimeout(() => void fetchAgents(), 700)
        return
      }
    }

    setLoading(false)
    setOfficeDataFetched(true)
  }, [isLocalMode, setLocalAgents, setSessionAgents, setNanobotStatusObj, setOfficeDataFetched, kioskTokenQuery])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/activity${kioskTokenQuery}`)
      if (!res.ok) return
      const json = await res.json()
      if (!Array.isArray(json?.agents)) return
      const map: Record<string, ActivityState> = {}
      for (const row of json.agents) {
        if (row?.name && row?.activity) map[row.name] = row.activity
      }
      setOfficeActivities(map)
    } catch { /* ignore — fall back to status */ }
  }, [setOfficeActivities, kioskTokenQuery])

  useEffect(() => { if (!demoMode) fetchActivities() }, [demoMode, fetchActivities])

  useEffect(() => {
    if (demoMode) return
    const id = setInterval(fetchActivities, 5_000)
    return () => clearInterval(id)
  }, [demoMode, fetchActivities])

  useEffect(() => {
    if (!isLocalMode) { setLocalBootstrapping(false); return }
    if (officeDataFetched) { setLocalBootstrapping(false); return }
    setLocalBootstrapping(true)
    const timer = setTimeout(() => setLocalBootstrapping(false), 4500)
    return () => clearTimeout(timer)
  }, [isLocalMode, officeDataFetched])

  useEffect(() => {
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  /* ── Derived data ───────────────────────────────────────── */

  const displayAgents = useMemo(() => {
    let result: Agent[]
    if (isLocalMode) {
      // Merge DB agents, local agents, and session agents — session agents
      // represent active Claude Code / Codex sessions that should appear in
      // the session pool alongside registered DB agents.
      const merged = new Map<string, Agent>()
      for (const agent of [...sessionAgents, ...localAgents, ...agents]) {
        const key = (agent.name || '').trim().toLowerCase()
        if (!key) continue
        const existing = merged.get(key)
        const shouldReplace =
          !existing ||
          (existing.status !== 'busy' && agent.status === 'busy') ||
          (existing.status === agent.status && (agent.last_seen || 0) > (existing.last_seen || 0))
        if (shouldReplace) merged.set(key, agent)
      }
      result = Array.from(merged.values())
    } else if (agents.length > 0) {
      result = agents
    } else {
      result = localAgents.length > 0 ? localAgents : []
    }

    // Inject virtual agents for named nanobots not present in real data
    const seen = new Set(result.map(a => (a.name || '').trim().toLowerCase()))
    const nowSec = Math.floor(Date.now() / 1000)
    for (const def of NANOBOT_AGENT_DEFS) {
      if (!seen.has(def.name.toLowerCase())) {
        result = [...result, {
          id: -9000 - seen.size,
          name: def.name,
          role: def.role,
          status: 'idle' as const,
          last_seen: nowSec,
          last_activity: 'At desk',
          created_at: nowSec,
          updated_at: nowSec,
          config: {},
        }]
        seen.add(def.name.toLowerCase())
      }
    }

    return result
  }, [agents, isLocalMode, localAgents, sessionAgents])

  const visibleAgents = useMemo(() => {
    if (!isLocalMode) return displayAgents
    return localSessionFilter === 'not-running'
      ? displayAgents.filter(a => isInactiveLocalSession(a))
      : displayAgents.filter(a => !isInactiveLocalSession(a))
  }, [displayAgents, isLocalMode, localSessionFilter])

  // Demo-mode activity injector — cycles all ActivityKind values across agents
  useEffect(() => {
    if (!demoMode) return
    const KINDS: ActivityKind[] = [
      'typing', 'reading', 'searching', 'bash', 'on-call',
      'in-meeting', 'thinking', 'blocked', 'idle', 'error',
    ]
    const id = window.setInterval(() => {
      const map: Record<string, ActivityState> = {}
      visibleAgents.forEach((a, i) => {
        const kind = KINDS[(i + Math.floor(Date.now() / 5000)) % KINDS.length]
        map[a.name] = {
          kind,
          subject: kind === 'typing' ? 'src/foo/bar.ts'
                 : kind === 'bash'   ? 'pnpm test --watch'
                 : kind === 'reading'? 'README.md'
                 : kind === 'on-call'? 'Cody'
                 : undefined,
          since: Date.now(),
        }
      })
      setOfficeActivities(map)
    }, 1500)
    return () => window.clearInterval(id)
  }, [demoMode, visibleAgents, setOfficeActivities])

  const nanobotStatus = useMemo(() => new Map(Object.entries(nanobotStatusObj)), [nanobotStatusObj])
  const layout = useMemo(
    // In kiosk mode, GSD agents are hidden by default (no toggle UI on the TV).
    () => buildOfficeLayout(visibleAgents, kiosk || hideGsd, nanobotStatus, officeActivities),
    [visibleAgents, kiosk, hideGsd, nanobotStatus, officeActivities]
  )

  const agentsByRoom = useMemo(() => {
    const map = new Map<RoomId, SeatedAgent[]>()
    for (const room of ROOM_DEFS) map.set(room.id, [])
    for (const s of layout.seated) map.get(s.roomId)!.push(s)
    return map
  }, [layout])

  // Defensive dedup: keep one seated entry per agent name. Belt-and-suspenders
  // against any race where the same agent ends up in layout.seated twice
  // (e.g., merge winners flipping between fetches, or two different code paths
  // both injecting the same virtual agent). Lowercased trimmed name is the
  // canonical identity here — same key the displayAgents merge uses.
  const seatedUnique = useMemo(() => {
    const seen = new Map<string, SeatedAgent>()
    for (const s of layout.seated) {
      const key = (s.agent.name || '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.set(key, s)
    }
    return Array.from(seen.values())
  }, [layout])

  const counts = useMemo(() => {
    const c = { idle: 0, busy: 0, error: 0, offline: 0 }
    for (const a of visibleAgents) c[a.status] = (c[a.status] || 0) + 1
    return c
  }, [visibleAgents])

  const sidebarAgents = useMemo(() => {
    let filtered = visibleAgents
    if (hideGsd) filtered = filtered.filter(a => !isGsdAgent(a))
    if (sidebarFilter === 'working') filtered = filtered.filter(a => a.status === 'busy')
    else if (sidebarFilter === 'idle') filtered = filtered.filter(a => a.status === 'idle')
    else if (sidebarFilter === 'gsd') filtered = filtered.filter(a => isGsdAgent(a))
    return filtered.sort((a, b) => {
      if (a.status === 'busy' && b.status !== 'busy') return -1
      if (a.status !== 'busy' && b.status === 'busy') return 1
      return a.name.localeCompare(b.name)
    })
  }, [visibleAgents, sidebarFilter, hideGsd])

  /* ── Map interaction ────────────────────────────────────── */

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setMapZoom(z => clamp(+(z + delta).toFixed(2), 0.6, 2.5))
  }

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    dragActiveRef.current = true
    dragOriginRef.current = { x: e.clientX, y: e.clientY }
    panStartRef.current = { ...mapPan }
  }

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragActiveRef.current) return
    setMapPan({
      x: panStartRef.current.x + (e.clientX - dragOriginRef.current.x),
      y: panStartRef.current.y + (e.clientY - dragOriginRef.current.y),
    })
  }

  const endDrag = () => { dragActiveRef.current = false }

  const resetView = () => { setMapZoom(1); setMapPan({ x: 0, y: 0 }) }

  const handleAgentClick = useCallback((agent: Agent) => {
    if (kiosk) return
    setSelectedAgent(agent)
  }, [kiosk])

  /* ── Render ─────────────────────────────────────────────── */

  if ((loading || (isLocalMode && localBootstrapping)) && visibleAgents.length === 0) {
    return <Loader variant="panel" label={isLocalMode ? 'Scanning local sessions...' : 'Loading office...'} />
  }

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 h-full">
      <style jsx>{`
        @keyframes typing-jitter { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
        @keyframes reading-bob   { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
        @keyframes blocked-halo  { 0%, 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.5); } 50% { box-shadow: 0 0 12px 4px rgba(250, 204, 21, 0.5); } }
        @keyframes error-flash   { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(330deg) brightness(1.4); } }
        .activity-typing  > svg { animation: typing-jitter 0.25s ease-in-out infinite; }
        .activity-reading > svg { animation: reading-bob 1.6s ease-in-out infinite; }
        .activity-blocked       { animation: blocked-halo 2.4s ease-in-out infinite; border-radius: 50%; }
        .activity-error  > svg  { animation: error-flash 0.8s ease-in-out infinite; }
        .kiosk-bleed {
          border: none;
          border-radius: 0;
          background-color: #06080d;
        }
      `}</style>
      {/* Header */}
      {!kiosk && (
        <div className="border-b border-border pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Office</h1>
              <p className="text-muted-foreground text-sm mt-0.5 sm:mt-1">
                {layout.seated.length} agent{layout.seated.length !== 1 ? 's' : ''} on the floor
                {hideGsd && layout.gsdCount > 0 && <span className="text-muted-foreground/60"> (+{layout.gsdCount} GSD hidden)</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                {counts.busy > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />{counts.busy} active</span>}
                {counts.idle > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{counts.idle} idle</span>}
                {counts.error > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />{counts.error} alert</span>}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* GSD filter toggle */}
                <Button
                  variant={hideGsd ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => { const next = !hideGsd; setHideGsd(next); localStorage.setItem('office-hide-gsd', next ? '1' : '0') }}
                  title={hideGsd ? `Show ${layout.gsdCount} GSD agents` : 'Hide GSD agents'}
                  className="text-xs"
                >
                  {hideGsd ? `Show GSD (${layout.gsdCount})` : `Hide GSD (${layout.gsdCount})`}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={refreshing}
                  onClick={async () => { setRefreshing(true); await fetchAgents(); setRefreshing(false) }}
                  className="text-xs"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {displayAgents.length === 0 && !hideGsd ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="mx-auto mb-4 w-16 h-16 opacity-30">
            <Crewmate color="#6b7280" size={64} status="offline" />
          </div>
          <p className="text-lg">The office is empty</p>
          <p className="text-sm mt-1">Deploy agents to see them appear here</p>
        </div>
      ) : (
        <div className={kiosk ? 'flex flex-col gap-3 sm:gap-4' : 'flex flex-col xl:grid xl:grid-cols-[220px_1fr] gap-3 sm:gap-4'}>
          {/* Sidebar / Roster */}
          {!kiosk && (
          <div className="void-panel text-foreground p-3 h-fit max-h-[280px] xl:max-h-[calc(100vh-180px)] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold font-mono tracking-wider text-cyan-400">ROSTER</div>
              <div className="text-[10px] text-muted-foreground">{sidebarAgents.length}</div>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {([
                { key: 'all' as const, label: 'All' },
                { key: 'working' as const, label: 'Working' },
                { key: 'idle' as const, label: 'Idle' },
                { key: 'gsd' as const, label: 'GSD' },
              ]).map(item => (
                <Button
                  key={item.key}
                  variant="ghost"
                  size="xs"
                  onClick={() => setSidebarFilter(item.key)}
                  className={`h-auto px-2 py-1 text-[10px] font-mono border ${
                    sidebarFilter === item.key
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                      : 'bg-secondary border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            {isLocalMode && (
              <div className="mb-2 flex gap-1.5">
                <Button
                  variant="ghost" size="xs"
                  onClick={() => setLocalSessionFilter('running')}
                  className={`flex-1 h-auto px-2 py-1 text-[10px] font-mono border ${
                    localSessionFilter === 'running'
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                      : 'bg-secondary border-border text-muted-foreground hover:bg-muted'
                  }`}
                >Running</Button>
                <Button
                  variant="ghost" size="xs"
                  onClick={() => setLocalSessionFilter('not-running')}
                  className={`flex-1 h-auto px-2 py-1 text-[10px] font-mono border ${
                    localSessionFilter === 'not-running'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-secondary border-border text-muted-foreground hover:bg-muted'
                  }`}
                >Not Running</Button>
              </div>
            )}

            <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
              {sidebarAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className="w-full flex items-center gap-2 rounded-lg p-2 text-left bg-black/20 border border-white/5 hover:bg-black/35 transition-colors"
                >
                  <div className="w-6 h-6 flex-shrink-0">
                    <Crewmate color={crewColor(agent.name)} size={24} status={agent.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate text-foreground">{agent.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {isGsdAgent(agent) ? 'GSD' : agent.role || 'agent'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
                    <span className="text-[9px] text-muted-foreground">
                      {agent.status === 'busy' ? 'active' : formatLastSeen(agent.last_seen)}
                    </span>
                  </div>
                </button>
              ))}
              {sidebarAgents.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-1 py-3 text-center">
                  No agents match this filter
                </div>
              )}
            </div>
          </div>
          )}

          {/* Map viewport */}
          <div
            ref={mapViewportRef}
            className={`relative rounded-lg ${kiosk ? 'kiosk-bleed' : 'border border-border'} overflow-hidden min-h-[320px] sm:min-h-[420px] xl:min-h-[calc(100vh-180px)] cursor-grab active:cursor-grabbing touch-none`}
            style={{
              backgroundColor: '#0a0e17',
              backgroundImage:
                'radial-gradient(circle at 30% 20%, rgba(34,211,238,0.04) 0%, transparent 50%), ' +
                'radial-gradient(circle at 70% 80%, rgba(139,92,246,0.03) 0%, transparent 50%)',
            }}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                dragActiveRef.current = true
                dragOriginRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                panStartRef.current = { ...mapPan }
              }
            }}
            onTouchMove={(e) => {
              if (!dragActiveRef.current || e.touches.length !== 1) return
              setMapPan({
                x: panStartRef.current.x + (e.touches[0].clientX - dragOriginRef.current.x),
                y: panStartRef.current.y + (e.touches[0].clientY - dragOriginRef.current.y),
              })
            }}
            onTouchEnd={endDrag}
          >
            {/* Zoom controls */}
            <div className="absolute right-2 sm:right-3 top-2 sm:top-3 z-30 flex items-center gap-0.5 sm:gap-1 rounded-md bg-card/80 backdrop-blur-sm border border-border text-foreground/90 px-1.5 sm:px-2 py-1">
              <Button variant="ghost" size="xs" onClick={() => setMapZoom(z => clamp(+(z - 0.1).toFixed(2), 0.6, 2.5))} className="h-auto px-1 sm:px-1.5 py-0.5 text-xs">-</Button>
              <span className="text-[10px] sm:text-[11px] font-mono w-8 sm:w-10 text-center">{Math.round(mapZoom * 100)}%</span>
              <Button variant="ghost" size="xs" onClick={() => setMapZoom(z => clamp(+(z + 0.1).toFixed(2), 0.6, 2.5))} className="h-auto px-1 sm:px-1.5 py-0.5 text-xs">+</Button>
              <Button variant="ghost" size="xs" onClick={resetView} className="h-auto px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] hidden sm:inline-flex">Reset</Button>
            </div>

            {/* Map label */}
            <div className="absolute left-2 sm:left-3 top-2 sm:top-3 z-30 rounded-md bg-card/70 backdrop-blur-sm border border-cyan-500/20 text-cyan-400 text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 font-mono">
              THE OFFICE
            </div>

            {/* Zoomable/pannable layer */}
            <div
              className="absolute inset-0 origin-top-left"
              style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})` }}
            >
              {/* Grid floor */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
                  backgroundSize: '4.167% 6.25%', // 24x16 grid
                }}
              />

              {/* Hallway corridors */}
              {HALLWAYS.map((h, i) => (
                <div
                  key={`hall-${i}`}
                  className="absolute bg-slate-800/40 border border-slate-700/20"
                  style={{
                    left: `${Math.min(h.x1, h.x2)}%`,
                    top: `${Math.min(h.y1, h.y2)}%`,
                    width: `${Math.abs(h.x2 - h.x1)}%`,
                    height: `${Math.abs(h.y2 - h.y1)}%`,
                  }}
                >
                  {/* Center line */}
                  {Math.abs(h.x2 - h.x1) > Math.abs(h.y2 - h.y1) ? (
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-yellow-500/20" />
                  ) : (
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-yellow-500/20" />
                  )}
                </div>
              ))}

              {/* Rooms */}
              {ROOM_DEFS.map(room => (
                <OfficeRoom
                  key={room.id}
                  room={room}
                  agents={agentsByRoom.get(room.id) || []}
                  zoom={mapZoom}
                />
              ))}

              {/* Agents rendered at map level for cross-room pathed motion.
                  Keyed by name (not id) so React reuses the same component
                  across renders even when the underlying agent's id flips
                  (e.g., merge winner switches between session and DB row). */}
              {seatedUnique.map(seated => {
                const crewSize = clamp(Math.round(38 / mapZoom), 20, 56)
                const nameSize = Math.max(8, Math.round(10 / mapZoom))
                const stableKey = (seated.agent.name || '').trim().toLowerCase()
                return (
                  <WalkingCrewmate
                    key={`walk-${stableKey}`}
                    agentId={stableKey}
                    targetSeat={{ x: seated.seat.x, y: seated.seat.y }}
                    targetRoom={seated.roomId}
                  >
                    <DriftingCrewmate
                      seated={seated}
                      crewSize={crewSize}
                      nameSize={nameSize}
                      onAgentClick={handleAgentClick}
                      activityKind={officeActivities[seated.agent.name]?.kind}
                    />
                  </WalkingCrewmate>
                )
              })}

              {/* Speech bubbles */}
              {bubbles.map(b => {
                const seated = layout.seated.find(s => s.agent.name === b.agentName)
                if (!seated) return null
                return (
                  <div
                    key={`bubble-${b.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                    style={{ left: `${seated.seat.x}%`, top: `${seated.seat.y}%` }}
                  >
                    <SpeechBubble text={b.text} onDismiss={() => dismissBubble(b.id)} />
                  </div>
                )
              })}
            </div>

            {/* Empty filter overlay */}
            {visibleAgents.length === 0 && displayAgents.length > 0 && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-5 py-4 text-center pointer-events-auto">
                  <div className="mx-auto mb-2 w-10 h-10 opacity-40">
                    <Crewmate color="#6b7280" size={40} status="offline" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No {localSessionFilter === 'not-running' ? 'stopped' : 'running'} sessions
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs text-cyan-400"
                    onClick={() => setLocalSessionFilter(localSessionFilter === 'not-running' ? 'running' : 'not-running')}
                  >
                    Show {localSessionFilter === 'not-running' ? 'running' : 'not running'} instead
                  </Button>
                </div>
              </div>
            )}

            {/* Minimap — hidden on small screens */}
            <div className="absolute right-2 sm:right-3 bottom-2 sm:bottom-3 z-30 w-32 sm:w-40 h-24 sm:h-28 rounded-md border border-white/10 bg-card/80 backdrop-blur-sm p-1.5 hidden sm:block">
              <div className="text-[9px] text-white/40 font-mono mb-1">MAP</div>
              <div className="relative w-full h-[calc(100%-14px)] rounded-sm overflow-hidden bg-black/40">
                {ROOM_DEFS.map(room => (
                  <div
                    key={`mini-${room.id}`}
                    className="absolute border border-white/10"
                    style={{
                      left: `${room.x}%`, top: `${room.y}%`,
                      width: `${room.w}%`, height: `${room.h}%`,
                      backgroundColor: room.wallColor,
                    }}
                  />
                ))}
                {seatedUnique.map(s => (
                  <div
                    key={`mini-a-${(s.agent.name || '').trim().toLowerCase()}`}
                    className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${s.seat.x}%`, top: `${s.seat.y}%`,
                      backgroundColor: crewColor(s.agent.name),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent detail modal */}
      {!kiosk && selectedAgent && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setSelectedAgent(null)}>
          <div className="bg-card border border-border rounded-t-xl sm:rounded-lg max-w-sm w-full p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <Crewmate color={crewColor(selectedAgent.name)} size={48} status={selectedAgent.status} />
                <div>
                  <h3 className="text-lg font-bold text-foreground">{selectedAgent.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {isGsdAgent(selectedAgent) ? 'GSD Agent' : selectedAgent.role || 'Agent'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setSelectedAgent(null)} className="text-muted-foreground hover:text-foreground text-xl w-6 h-6">×</Button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${statusDot[selectedAgent.status]}`} />
                <span className="font-medium text-foreground">{statusLabel[selectedAgent.status]}</span>
                <span className="text-muted-foreground ml-auto">{formatLastSeen(selectedAgent.last_seen)}</span>
              </div>

              {selectedAgent.last_activity && (
                <div className="bg-secondary rounded-lg p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Current Activity</span>
                  <span className="text-foreground text-sm">{selectedAgent.last_activity}</span>
                </div>
              )}

              {isGsdAgent(selectedAgent) && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <span className="text-xs text-emerald-400 font-mono">GSD AGENT</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    This is a GSD skill subagent spawned by Claude Code.
                  </p>
                </div>
              )}

              {selectedAgent.taskStats && (
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center bg-secondary rounded-lg p-2">
                    <div className="text-lg font-bold text-foreground">{selectedAgent.taskStats.total}</div>
                    <div className="text-[10px] text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center bg-secondary rounded-lg p-2">
                    <div className="text-lg font-bold text-blue-400">{selectedAgent.taskStats.assigned}</div>
                    <div className="text-[10px] text-muted-foreground">Assigned</div>
                  </div>
                  <div className="text-center bg-secondary rounded-lg p-2">
                    <div className="text-lg font-bold text-yellow-400">{selectedAgent.taskStats.in_progress}</div>
                    <div className="text-[10px] text-muted-foreground">Active</div>
                  </div>
                  <div className="text-center bg-secondary rounded-lg p-2">
                    <div className="text-lg font-bold text-green-400">{selectedAgent.taskStats.completed}</div>
                    <div className="text-[10px] text-muted-foreground">Done</div>
                  </div>
                </div>
              )}

              {selectedAgent.session_key && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Session:</span>{' '}
                  <code className="font-mono">{selectedAgent.session_key}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
