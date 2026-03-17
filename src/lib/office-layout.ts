import type { Agent } from '@/store'

/* ── Among Us-style office room types ─────────────────────── */

export type RoomId =
  | 'main-office'    // Primary nanobot agents (Stefany, Cody, etc.)
  | 'gsd-office'     // GSD skill agents (planners, executors, verifiers, etc.)
  | 'session-pool'   // Active Claude Code / Codex sessions
  | 'conference'     // Busy/active agents pulled into a meeting
  | 'break-room'     // Idle agents hanging out

export interface RoomDefinition {
  id: RoomId
  label: string
  color: string          // Tailwind border/bg accent
  wallColor: string      // CSS color for room fill
  x: number              // % from left
  y: number              // % from top
  w: number              // % width
  h: number              // % height
}

export interface SeatPosition {
  x: number
  y: number
  roomId: RoomId
}

export interface SeatedAgent {
  agent: Agent
  seat: SeatPosition
  roomId: RoomId
}

export interface OfficeLayout {
  rooms: RoomDefinition[]
  seated: SeatedAgent[]
  gsdCount: number
  activeCount: number
}

/* ── Room layout — top-down Among Us map ─────────────────── */

export const ROOM_DEFS: RoomDefinition[] = [
  {
    id: 'main-office',
    label: 'Main Office',
    color: 'border-cyan-500/40 bg-cyan-500/8',
    wallColor: '#0c1a2e',
    x: 4, y: 6, w: 42, h: 40,
  },
  {
    id: 'conference',
    label: 'War Room',
    color: 'border-amber-500/40 bg-amber-500/8',
    wallColor: '#1a1408',
    x: 54, y: 6, w: 42, h: 40,
  },
  {
    id: 'session-pool',
    label: 'Session Pool',
    color: 'border-violet-500/40 bg-violet-500/8',
    wallColor: '#140c24',
    x: 4, y: 54, w: 42, h: 40,
  },
  {
    id: 'gsd-office',
    label: 'GSD Wing',
    color: 'border-emerald-500/40 bg-emerald-500/8',
    wallColor: '#0c1a14',
    x: 54, y: 54, w: 42, h: 40,
  },
  {
    id: 'break-room',
    label: 'Break Room',
    color: 'border-slate-500/30 bg-slate-500/6',
    wallColor: '#12141a',
    x: 46, y: 42, w: 8, h: 16,
  },
]

/* ── Hallway segments for the corridor between rooms ──────── */

export const HALLWAYS = [
  // Horizontal corridor
  { x1: 4, y1: 46, x2: 96, y2: 54 },
  // Vertical corridor
  { x1: 46, y1: 6, x2: 54, y2: 94 },
]

/* ── Classification ──────────────────────────────────────── */

const GSD_PATTERNS = [
  'gsd-planner', 'gsd-executor', 'gsd-verifier', 'gsd-debugger',
  'gsd-researcher', 'gsd-phase-researcher', 'gsd-project-researcher',
  'gsd-research-synthesizer', 'gsd-roadmapper', 'gsd-codebase-mapper',
  'gsd-plan-checker', 'gsd-integration-checker', 'gsd-nyquist-auditor',
  'gsd-ui-researcher', 'gsd-ui-checker', 'gsd-ui-auditor',
]

/** Named nanobot agents that should always have a desk in the main office. */
const NANOBOT_AGENT_DEFS: { name: string; role: string }[] = [
  { name: 'Andy', role: 'operations-manager' },
  { name: 'Stefany', role: 'bookkeeper' },
  { name: 'Cody', role: 'engineer' },
]

const NANOBOT_AGENT_NAMES = new Set(
  NANOBOT_AGENT_DEFS.map(d => d.name.toLowerCase()),
)

function isNamedNanobotAgent(agent: Agent): boolean {
  const name = (agent.name || '').trim().toLowerCase()
  return NANOBOT_AGENT_NAMES.has(name)
}

function isGsdAgent(agent: Agent): boolean {
  const name = (agent.name || '').toLowerCase()
  const role = (agent.role || '').toLowerCase()
  const kind = ((agent.config as any)?.localSession?.kind || '').toLowerCase()
  return (
    GSD_PATTERNS.some(p => name.includes(p) || role.includes(p) || kind.includes(p)) ||
    name.startsWith('gsd') ||
    role.startsWith('gsd')
  )
}

function isLocalSession(agent: Agent): boolean {
  return Boolean((agent.config as any)?.localSession)
}

function classifyAgent(agent: Agent): RoomId {
  // Named nanobot agents always live in main-office; go to war room when busy
  if (isNamedNanobotAgent(agent)) {
    return agent.status === 'busy' ? 'conference' : 'main-office'
  }
  if (isGsdAgent(agent)) return 'gsd-office'
  if (isLocalSession(agent) && agent.status !== 'busy') return 'session-pool'
  if (isLocalSession(agent) && agent.status === 'busy') return 'conference'
  // Other gateway agents
  if (agent.status === 'busy') return 'conference'
  return 'main-office'
}

/* ── Seat assignment within a room ───────────────────────── */

function assignSeats(agents: Agent[], room: RoomDefinition): SeatedAgent[] {
  if (agents.length === 0) return []

  const padding = 4 // % padding inside room walls
  const innerX = room.x + padding
  const innerY = room.y + padding + 3 // extra for room label
  const innerW = room.w - padding * 2
  const innerH = room.h - padding * 2 - 3

  // Grid layout: figure out cols/rows to fit
  const count = agents.length
  const cols = count <= 2 ? count : count <= 6 ? 3 : count <= 12 ? 4 : 5
  const rows = Math.ceil(count / cols)

  const cellW = innerW / cols
  const cellH = innerH / Math.max(rows, 1)

  return agents.map((agent, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      agent,
      roomId: room.id,
      seat: {
        x: innerX + col * cellW + cellW / 2,
        y: innerY + row * cellH + cellH / 2,
        roomId: room.id,
      },
    }
  })
}

/* ── Main layout builder ─────────────────────────────────── */

export interface NanobotAgentStatus {
  status: string
  lastActivity: number | null
  activeSession: string | null
}

export function buildOfficeLayout(
  agents: Agent[],
  hideGsd = false,
  nanobotStatus?: Map<string, NanobotAgentStatus>,
): OfficeLayout {
  const buckets = new Map<RoomId, Agent[]>()
  for (const room of ROOM_DEFS) buckets.set(room.id, [])

  let gsdCount = 0

  // Track which named nanobot agents are already in the data
  const seenNanobotNames = new Set<string>()

  for (const rawAgent of agents) {
    let agent = rawAgent
    if (isNamedNanobotAgent(agent)) {
      seenNanobotNames.add((agent.name || '').trim().toLowerCase())
      // Override status from nanobot session files if available
      const nbStatus = nanobotStatus?.get(agent.name.toLowerCase())
      if (nbStatus && nbStatus.status === 'busy' && agent.status !== 'busy') {
        agent = { ...agent, status: 'busy', last_activity: nbStatus.activeSession || agent.last_activity }
      }
    }
    const roomId = classifyAgent(agent)
    if (roomId === 'gsd-office') gsdCount++
    if (hideGsd && roomId === 'gsd-office') continue
    buckets.get(roomId)!.push(agent)
  }

  // Inject virtual agents for named nanobots not present in the data
  const nowSec = Math.floor(Date.now() / 1000)
  for (const def of NANOBOT_AGENT_DEFS) {
    if (!seenNanobotNames.has(def.name.toLowerCase())) {
      const nbStatus = nanobotStatus?.get(def.name.toLowerCase())
      const isBusy = nbStatus?.status === 'busy'
      const virtual: Agent = {
        id: -9000 - seenNanobotNames.size,
        name: def.name,
        role: def.role,
        status: isBusy ? 'busy' : 'idle',
        last_seen: nbStatus?.lastActivity || nowSec,
        last_activity: isBusy ? (nbStatus?.activeSession || 'Working') : 'At desk',
        created_at: nowSec,
        updated_at: nowSec,
        config: {},
      }
      // Busy nanobot agents go to conference room, idle to main office
      const roomId: RoomId = isBusy ? 'conference' : 'main-office'
      buckets.get(roomId)!.push(virtual)
    }
  }

  // Sort agents within each room: busy first, then by name
  for (const [, list] of buckets) {
    list.sort((a, b) => {
      if (a.status === 'busy' && b.status !== 'busy') return -1
      if (a.status !== 'busy' && b.status === 'busy') return 1
      return a.name.localeCompare(b.name)
    })
  }

  const seated: SeatedAgent[] = []
  const activeCount = agents.filter(a => a.status === 'busy').length

  for (const room of ROOM_DEFS) {
    const roomAgents = buckets.get(room.id) || []
    seated.push(...assignSeats(roomAgents, room))
  }

  return { rooms: ROOM_DEFS, seated, gsdCount, activeCount }
}

/* ── Helpers re-exported for the panel ───────────────────── */

export { isGsdAgent, isLocalSession, isNamedNanobotAgent, NANOBOT_AGENT_NAMES, NANOBOT_AGENT_DEFS }
