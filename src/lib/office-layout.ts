import type { Agent } from '@/store'

/* ── Among Us-style office room types ─────────────────────── */

export type RoomId =
  | 'home-main'
  | 'home-gsd'
  | 'home-session'
  | 'library'
  | 'workshop'
  | 'lab'
  | 'phone-booth'
  | 'war-room'
  | 'waiting-bench'
  | 'break-room'

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
  // home rooms — left/right edges
  { id: 'home-main',    label: 'Main Office',  color: 'border-cyan-500/40 bg-cyan-500/8',     wallColor: '#0c1a2e', x:  2, y:  4, w: 22, h: 44 },
  { id: 'home-session', label: 'Session Pool', color: 'border-violet-500/40 bg-violet-500/8', wallColor: '#140c24', x:  2, y: 52, w: 22, h: 44 },
  { id: 'home-gsd',     label: 'GSD Wing',     color: 'border-emerald-500/40 bg-emerald-500/8', wallColor: '#0c1a14', x: 76, y:  4, w: 22, h: 44 },
  { id: 'break-room',   label: 'Break Room',   color: 'border-slate-500/30 bg-slate-500/6',   wallColor: '#12141a', x: 76, y: 52, w: 22, h: 44 },

  // corridor activity zones — center column
  { id: 'library',      label: 'Library',      color: 'border-amber-500/40 bg-amber-500/8',   wallColor: '#1a1408', x: 28, y:  6, w: 20, h: 22 },
  { id: 'lab',          label: 'Lab',          color: 'border-rose-500/40 bg-rose-500/8',     wallColor: '#1a0c14', x: 52, y:  6, w: 20, h: 22 },
  { id: 'phone-booth',  label: 'Phone Booths', color: 'border-sky-500/40 bg-sky-500/8',       wallColor: '#0c1620', x: 28, y: 32, w: 20, h: 18 },
  { id: 'war-room',     label: 'War Room',     color: 'border-orange-500/40 bg-orange-500/8', wallColor: '#1a1208', x: 52, y: 32, w: 20, h: 18 },
  { id: 'workshop',     label: 'Workshop',     color: 'border-teal-500/40 bg-teal-500/8',     wallColor: '#0c1a18', x: 28, y: 54, w: 44, h: 24 },
  { id: 'waiting-bench',label: 'Waiting Bench',color: 'border-yellow-500/40 bg-yellow-500/6', wallColor: '#1a1808', x: 28, y: 82, w: 44, h: 12 },
]

/* ── Hallway segments for the corridor between rooms ──────── */

export const HALLWAYS = [
  // Vertical lane between home rooms and corridor zones (left)
  { x1: 24, y1:  4, x2: 28, y2: 96 },
  // Vertical lane on the right
  { x1: 72, y1:  4, x2: 76, y2: 96 },
  // Horizontal lane through the middle of the activity grid
  { x1: 24, y1: 50, x2: 76, y2: 52 },
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

function classifyAgent(_agent: Agent): RoomId {
  return 'home-main'
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
    if (roomId === 'home-gsd') gsdCount++
    if (hideGsd && roomId === 'home-gsd') continue
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
      // Busy nanobot agents go to workshop, idle to main office
      const roomId: RoomId = isBusy ? 'workshop' : 'home-main'
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
