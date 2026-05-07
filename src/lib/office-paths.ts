// src/lib/office-paths.ts
import {
  ROOM_DOORS,
  CORRIDOR_LEFT,
  CORRIDOR_RIGHT,
  type Point,
  type RoomId,
} from './office-layout'

const LEFT_ROOMS: ReadonlySet<RoomId> = new Set([
  'home-main', 'home-session', 'library', 'phone-booth',
])
const RIGHT_ROOMS: ReadonlySet<RoomId> = new Set([
  'home-gsd', 'break-room', 'lab', 'war-room',
])

function corridorTurnFor(room: RoomId): Point | null {
  if (LEFT_ROOMS.has(room)) return CORRIDOR_LEFT
  if (RIGHT_ROOMS.has(room)) return CORRIDOR_RIGHT
  return null  // workshop / waiting-bench sit on the corridor itself
}

/**
 * Returns waypoints for an agent to walk from `from` to `to`.
 * Always begins with `from` and ends with `to`.
 *
 * Same-room moves: 2 points (straight line).
 * Cross-room moves: from → fromDoor → [corridor turns] → toDoor → to.
 */
export function pathBetween(
  from: Point, fromRoom: RoomId,
  to: Point, toRoom: RoomId,
): Point[] {
  if (fromRoom === toRoom) return [from, to]

  const path: Point[] = [from, ROOM_DOORS[fromRoom]]

  const fromTurn = corridorTurnFor(fromRoom)
  const toTurn = corridorTurnFor(toRoom)

  if (fromTurn) path.push(fromTurn)
  if (toTurn && toTurn !== fromTurn) path.push(toTurn)

  path.push(ROOM_DOORS[toRoom], to)
  return path
}
