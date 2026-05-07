// src/components/panels/office/walking-crewmate.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { Point, RoomId } from '@/lib/office-layout'
import { pathBetween } from '@/lib/office-paths'

interface WalkingCrewmateProps {
  /** Stable id for keying transitions */
  agentId: string | number
  /** Current resolved seat in absolute % (within map). */
  targetSeat: Point
  /** Current target room id, used to choose corridor lanes. */
  targetRoom: RoomId
  /** Last-known room — first render uses targetRoom. */
  lastRoom?: RoomId
  /** Render the crewmate body. */
  children: React.ReactNode
  /** Total trip duration in ms (defaults 1200ms per leg). */
  legDurationMs?: number
}

/**
 * Animates absolute % position by walking through pathBetween waypoints.
 * Each leg is a CSS transition; we advance through legs with setTimeout.
 */
export function WalkingCrewmate({
  agentId,
  targetSeat,
  targetRoom,
  lastRoom,
  children,
  legDurationMs = 1200,
}: WalkingCrewmateProps) {
  const [pos, setPos] = useState<Point>(targetSeat)
  const lastSeatRef = useRef<Point>(targetSeat)
  const lastRoomRef = useRef<RoomId>(lastRoom ?? targetRoom)
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    const from = lastSeatRef.current
    const fromRoom = lastRoomRef.current
    if (from.x === targetSeat.x && from.y === targetSeat.y && fromRoom === targetRoom) return

    const path = pathBetween(from, fromRoom, targetSeat, targetRoom)
    let cancelled = false
    setWalking(true)

    const advance = (i: number) => {
      if (cancelled || i >= path.length) {
        setWalking(false)
        return
      }
      setPos(path[i])
      window.setTimeout(() => advance(i + 1), legDurationMs)
    }
    advance(1)  // start at index 1 — index 0 is the current position

    lastSeatRef.current = targetSeat
    lastRoomRef.current = targetRoom

    return () => { cancelled = true }
  }, [agentId, targetSeat.x, targetSeat.y, targetRoom, legDurationMs])

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${walking ? 'walking' : ''}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transition: `left ${legDurationMs}ms ease-in-out, top ${legDurationMs}ms ease-in-out`,
      }}
    >
      {children}
    </div>
  )
}
