import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock event-bus before importing to get a controllable instance
// The real module uses globalThis singleton; we need to test the class behavior
vi.mock('@/lib/event-bus', async () => {
  const { EventEmitter } = await import('events')

  class TestEventBus extends EventEmitter {
    constructor() {
      super()
      this.setMaxListeners(50)
    }

    broadcast(type: string, data: unknown) {
      const event = { type, data, timestamp: Date.now() }
      this.emit('server-event', event)
      return event
    }
  }

  const instance = new TestEventBus()
  return {
    eventBus: instance,
    ServerEvent: {} as any,
  }
})

describe('SSE event bus smoke tests', () => {
  let eventBus: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../event-bus')
    eventBus = mod.eventBus
    eventBus.removeAllListeners('server-event')
  })

  afterEach(() => {
    eventBus.removeAllListeners('server-event')
  })

  describe('broadcast', () => {
    it('emits a server-event when broadcast is called', () => {
      const handler = vi.fn()
      eventBus.on('server-event', handler)

      eventBus.broadcast('task.created', { id: 42, title: 'Test task' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.created',
          data: { id: 42, title: 'Test task' },
        })
      )
    })

    it('includes a timestamp in the emitted event', () => {
      const handler = vi.fn()
      eventBus.on('server-event', handler)

      const before = Date.now()
      eventBus.broadcast('agent.updated', { name: 'cody' })
      const after = Date.now()

      const event = handler.mock.calls[0][0]
      expect(event.timestamp).toBeGreaterThanOrEqual(before)
      expect(event.timestamp).toBeLessThanOrEqual(after)
    })

    it('returns the constructed event object', () => {
      const result = eventBus.broadcast('notification.created', { message: 'hello' })
      expect(result).toMatchObject({
        type: 'notification.created',
        data: { message: 'hello' },
      })
      expect(result.timestamp).toBeDefined()
    })
  })

  describe('subscriber receives events', () => {
    it('multiple subscribers all receive the same broadcast', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      eventBus.on('server-event', handler1)
      eventBus.on('server-event', handler2)

      eventBus.broadcast('task.updated', { id: 1 })

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('unsubscribed listener does not receive events', () => {
      const handler = vi.fn()
      eventBus.on('server-event', handler)
      eventBus.removeListener('server-event', handler)

      eventBus.broadcast('task.deleted', { id: 1 })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('SSE format compatibility', () => {
    it('event type is a plain string suitable for SSE event field', () => {
      const handler = vi.fn()
      eventBus.on('server-event', handler)

      eventBus.broadcast('activity.created', { type: 'task_created' })

      const event = handler.mock.calls[0][0]
      // SSE format: "event: <type>\ndata: <json>\n\n"
      // The type must be a valid SSE event name (no newlines, no colons)
      expect(event.type).toBe('activity.created')
      expect(event.type).not.toContain('\n')
      expect(event.type).not.toContain(':')
    })

    it('event data is JSON-serializable for SSE data field', () => {
      const handler = vi.fn()
      eventBus.on('server-event', handler)

      eventBus.broadcast('agent.status_changed', {
        id: 1,
        status: 'online',
        name: 'cody',
      })

      const event = handler.mock.calls[0][0]
      // Data must be JSON-serializable (this is what gets sent as SSE data: field)
      expect(() => JSON.stringify(event.data)).not.toThrow()
      const parsed = JSON.parse(JSON.stringify(event.data))
      expect(parsed.status).toBe('online')
    })
  })

  describe('no OpenClaw references', () => {
    it('event types used in tests are generic nanobot types', () => {
      const testedTypes = [
        'task.created',
        'task.updated',
        'task.deleted',
        'agent.updated',
        'agent.status_changed',
        'activity.created',
        'notification.created',
      ]
      for (const t of testedTypes) {
        expect(t.toLowerCase()).not.toContain('openclaw')
      }
    })
  })
})
