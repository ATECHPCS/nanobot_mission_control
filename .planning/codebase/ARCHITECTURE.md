# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Next.js App Router monolith with embedded SQLite, server-sent events, and WebSocket gateway integration

**Key Characteristics:**
- Single-page application with client-side panel routing via a catch-all route `src/app/[[...panel]]/page.tsx`
- API routes serve as the backend layer, all under `src/app/api/`
- Embedded SQLite database (better-sqlite3) with WAL mode -- no external DB required
- Dual real-time channels: SSE for local DB mutations, WebSocket for gateway communication
- Zustand store as the single source of truth on the client
- Multi-tenant capable with workspace isolation at the database level

## Layers

**Presentation Layer (Client):**
- Purpose: Renders the dashboard UI, manages client-side state
- Location: `src/components/`, `src/store/index.ts`, `src/app/[[...panel]]/page.tsx`
- Contains: React components, Zustand store, client-side hooks
- Depends on: API layer (via fetch), SSE endpoint, WebSocket gateway
- Used by: Browser

**API Layer (Server):**
- Purpose: REST endpoints for CRUD operations, SSE streaming, authentication
- Location: `src/app/api/`
- Contains: Next.js Route Handlers (GET, POST, PUT, DELETE per `route.ts`)
- Depends on: Data layer (`src/lib/db.ts`), Auth (`src/lib/auth.ts`), Validation (`src/lib/validation.ts`)
- Used by: Presentation layer, external agents (via API key), CLI tools

**Data Layer (Server):**
- Purpose: Database access, schema management, helper functions
- Location: `src/lib/db.ts`, `src/lib/schema.sql`, `src/lib/migrations.ts`
- Contains: SQLite connection management, entity interfaces, mutation helpers, audit logging
- Depends on: `better-sqlite3`, `src/lib/config.ts`
- Used by: API layer, scheduler, webhooks

**Real-Time Layer (Server + Client):**
- Purpose: Push data changes to connected clients in real time
- Location: `src/lib/event-bus.ts` (server), `src/app/api/events/route.ts` (SSE endpoint), `src/lib/websocket.ts` (client WS), `src/lib/use-server-events.ts` (client SSE)
- Contains: EventEmitter-based server event bus, SSE stream handler, WebSocket client hook
- Depends on: Data layer (emits events on mutations), Zustand store (dispatches events)
- Used by: All connected browser clients

**Infrastructure Layer (Server):**
- Purpose: Background tasks, configuration, external integrations
- Location: `src/lib/scheduler.ts`, `src/lib/webhooks.ts`, `src/lib/agent-sync.ts`, `src/lib/config.ts`
- Contains: Scheduled backup/cleanup, webhook delivery, agent config sync from OpenClaw
- Depends on: Data layer, file system (OpenClaw state directory)
- Used by: Initialized on database startup (lazy-loaded)

## Data Flow

**Client Page Load:**

1. Browser navigates to `/` or `/{panel}` -- caught by `src/app/[[...panel]]/page.tsx`
2. `useEffect` fetches `/api/auth/me` to validate session; redirects to `/login` on 401
3. `useEffect` fetches `/api/status?action=capabilities` to determine `dashboardMode` (local vs full)
4. If gateway available, `useWebSocket()` connects to the OpenClaw gateway via WebSocket
5. `useServerEvents()` opens an `EventSource` to `/api/events` for SSE
6. `ContentRouter` renders the panel component matching `activeTab` from Zustand store

**API Request (Mutation):**

1. Client calls API endpoint (e.g., `POST /api/tasks`)
2. `requireRole(request, 'operator')` validates session cookie or API key via `src/lib/auth.ts`
3. `mutationLimiter(request)` checks IP-based rate limit via `src/lib/rate-limit.ts`
4. `validateBody(request, schema)` parses and validates with Zod via `src/lib/validation.ts`
5. `getDatabase()` executes SQL against SQLite via `src/lib/db.ts`
6. `db_helpers.logActivity()` records audit trail
7. `eventBus.broadcast('task.created', data)` pushes event to SSE clients
8. Webhook listeners (attached to eventBus) deliver to external webhook URLs

**SSE Real-Time Updates:**

1. Client `EventSource` connects to `GET /api/events`
2. Server authenticates via `requireRole(request, 'viewer')`
3. Server creates a `ReadableStream` and attaches a listener to `eventBus`
4. On any `eventBus.broadcast()`, the event is serialized as SSE `data:` and sent to all connected clients
5. Client `useServerEvents()` hook dispatches events to Zustand store actions (e.g., `addTask`, `updateAgent`)
6. Components re-render reactively from Zustand state

**WebSocket Gateway Communication:**

1. `useWebSocket()` hook connects to the OpenClaw gateway (port 18789 by default)
2. Gateway sends `connect.challenge`; client responds with `connect` handshake (including device identity signing)
3. On successful handshake, gateway sends periodic `tick` events with session snapshots
4. Gateway also pushes `log`, `chat.message`, `notification`, `agent.status` events
5. Client dispatches these to Zustand store, updating dashboard in real time

**State Management:**
- Server: SQLite database is the single source of truth for persistent data
- Client: Zustand store (`src/store/index.ts`) holds all client-side state in a single flat store
- Sync: SSE provides real-time updates from server DB mutations; WebSocket provides gateway state
- Polling: `useSmartPoll` hook (`src/lib/use-smart-poll.ts`) provides visibility-aware fallback polling that pauses when SSE/WS is active

## Key Abstractions

**Event Bus:**
- Purpose: Decouples database mutations from real-time delivery (SSE, webhooks)
- Implementation: `src/lib/event-bus.ts` -- singleton `EventEmitter` surviving HMR via `globalThis`
- Pattern: Publisher-subscriber; API routes publish, SSE endpoint and webhook listener subscribe
- Event types: `task.created`, `agent.status_changed`, `chat.message`, `notification.created`, etc.

**Auth System:**
- Purpose: Multi-strategy authentication with role-based access control
- Implementation: `src/lib/auth.ts`
- Strategies: Session cookie (`mc-session`), system API key (`X-Api-Key` / `Authorization: Bearer`), agent API key (per-agent scoped keys)
- Roles: `viewer` < `operator` < `admin` (hierarchical)
- Pattern: `requireRole(request, minRole)` returns `{ user }` or `{ error, status }`

**Validation:**
- Purpose: Request body validation using Zod schemas
- Implementation: `src/lib/validation.ts`
- Pattern: `validateBody(request, schema)` returns `{ data }` or `{ error: NextResponse }`
- Schemas defined for all mutation endpoints (tasks, agents, webhooks, alerts, etc.)

**Rate Limiting:**
- Purpose: IP-based request throttling
- Implementation: `src/lib/rate-limit.ts`
- Tiers: `loginLimiter` (5/min, critical), `mutationLimiter` (60/min), `readLimiter` (120/min), `heavyLimiter` (10/min)
- Pattern: `const rateCheck = mutationLimiter(request); if (rateCheck) return rateCheck;`

**Database Migrations:**
- Purpose: Schema evolution tracked in `_migrations` table
- Implementation: `src/lib/migrations.ts` -- array of `{ id, up }` objects executed sequentially
- Pattern: Each migration has a unique string ID; already-applied migrations are skipped
- Base schema: `src/lib/schema.sql`

**Agent Templates:**
- Purpose: Pre-configured agent archetypes for quick creation
- Implementation: `src/lib/agent-templates.ts`
- Pattern: Template defines identity, model, tools, sandbox config; `buildAgentConfig(template)` produces full config

## Entry Points

**Web Application:**
- Location: `src/app/layout.tsx` (root layout), `src/app/[[...panel]]/page.tsx` (main SPA)
- Triggers: Browser navigation
- Responsibilities: Renders entire dashboard; manages WebSocket + SSE connections

**Login Page:**
- Location: `src/app/login/page.tsx`
- Triggers: Unauthenticated access; redirected from main page
- Responsibilities: Username/password login form, Google OAuth initiation

**API Docs:**
- Location: `src/app/docs/page.tsx`
- Triggers: Navigating to `/docs`
- Responsibilities: Renders OpenAPI reference from `openapi.json` using Scalar

**API Routes:**
- Location: `src/app/api/` (40+ route directories)
- Triggers: HTTP requests from UI, agents, CLI, external systems
- Responsibilities: All CRUD operations, SSE streaming, authentication, sync, export

**Database Initialization:**
- Location: `src/lib/db.ts` (module-level `getDatabase()` call)
- Triggers: First import of `db.ts` on the server side
- Responsibilities: Creates/opens SQLite DB, runs migrations, seeds admin user, starts scheduler and webhook listener

**Scheduler:**
- Location: `src/lib/scheduler.ts`
- Triggers: Lazy-loaded after DB initialization (skipped during `next build`)
- Responsibilities: Auto-backup, data retention cleanup, agent sync, webhook retry, Claude session sync

**Provisioner Daemon:**
- Location: `ops/mc-provisioner-daemon.js`
- Triggers: Standalone Node.js process for multi-tenant deployments
- Responsibilities: Executes tenant provisioning/decommission jobs approved via super-admin UI

## Error Handling

**Strategy:** Try-catch at the API route level with structured JSON error responses and server-side logging

**Patterns:**
- API routes wrap all logic in try-catch, returning `{ error: string }` with appropriate HTTP status
- Auth failures return 401 (unauthenticated) or 403 (insufficient role)
- Validation failures return 400 with `{ error, details }` array from Zod
- Rate limit violations return 429
- Duplicate entity creation returns 409
- Server errors return 500 with generic message; details logged via `pino`
- Client-side: `ErrorBoundary` component wraps each panel in `src/components/ErrorBoundary.tsx`

## Cross-Cutting Concerns

**Logging:**
- Server: `pino` logger (`src/lib/logger.ts`) with pretty-printing in dev
- Client: `createClientLogger(namespace)` (`src/lib/client-logger.ts`) for namespaced console logging
- Audit: Dedicated `audit_log` table via `logAuditEvent()` in `src/lib/db.ts`

**Validation:**
- All mutation endpoints use Zod schemas from `src/lib/validation.ts`
- `validateBody()` helper handles parsing + error response generation
- Query params validated inline with `parseInt`, `Math.min`, type guards

**Authentication:**
- `getUserFromRequest()` in `src/lib/auth.ts` checks cookie, then API key, then agent API key
- `requireRole(request, role)` is the standard guard used in every route handler
- Session cookie: `mc-session`, 7-day duration, stored in `user_sessions` table
- Google OAuth support via `src/lib/google-auth.ts`

**Multi-Tenancy:**
- Workspace ID (`workspace_id`) column on most tables
- `auth.user.workspace_id` flows through every query
- Super-admin panel (`src/components/panels/super-admin-panel.tsx`) for tenant management
- Provisioner daemon (`ops/mc-provisioner-daemon.js`) for tenant lifecycle

**Security Headers:**
- CSP, X-Frame-Options, X-Content-Type-Options configured in `next.config.js`
- HSTS optional via `MC_ENABLE_HSTS=1`
- Timing-safe comparisons for passwords and API keys (`src/lib/auth.ts`)

---

*Architecture analysis: 2026-03-09*
