# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
nanobot_mission_control/
├── .github/
│   ├── ISSUE_TEMPLATE/       # GitHub issue templates
│   └── workflows/            # CI: quality-gate.yml, docker-publish.yml
├── docs/                     # Deployment and CLI integration docs
├── ops/
│   ├── mc-provisioner-daemon.js  # Standalone tenant provisioner
│   └── templates/            # Provisioning templates
├── public/
│   └── office-sprites/       # SVG/PNG sprites for office visualization panel
├── scripts/
│   ├── agent-heartbeat.sh    # Agent heartbeat polling script
│   ├── notification-daemon.sh # Notification delivery daemon
│   └── e2e-openclaw/         # E2E test harness for OpenClaw integration
├── src/
│   ├── app/                  # Next.js App Router pages + API routes
│   │   ├── layout.tsx        # Root layout (ThemeProvider, dark mode default)
│   │   ├── globals.css       # Tailwind + CSS custom properties
│   │   ├── [[...panel]]/     # Main SPA catch-all route
│   │   │   └── page.tsx      # Dashboard shell + ContentRouter
│   │   ├── login/
│   │   │   └── page.tsx      # Login page
│   │   ├── docs/
│   │   │   └── page.tsx      # OpenAPI docs viewer (Scalar)
│   │   └── api/              # ~40+ API route directories
│   ├── components/           # React UI components
│   │   ├── ErrorBoundary.tsx  # Client error boundary
│   │   ├── markdown-renderer.tsx  # Markdown rendering utility
│   │   ├── chat/             # Agent chat components
│   │   ├── dashboard/        # Overview dashboard components
│   │   ├── hud/              # Connection status HUD
│   │   ├── layout/           # Shell layout (nav rail, header, live feed)
│   │   ├── panels/           # Feature panel components (~30 panels)
│   │   └── ui/               # Reusable UI primitives
│   ├── lib/                  # Server + shared utilities
│   │   ├── __tests__/        # Unit tests for lib modules
│   │   └── *.ts              # ~45 utility/service modules
│   ├── store/
│   │   └── index.ts          # Zustand store (single file, ~800 lines)
│   ├── test/
│   │   └── (test setup)      # Vitest setup files
│   └── types/
│       └── index.ts          # Shared TypeScript interfaces
├── tests/                    # E2E / integration tests (Playwright)
│   ├── fixtures/             # OpenClaw test fixtures
│   ├── helpers.ts            # Test helper functions
│   └── *.spec.ts             # ~30 spec files
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Docker Compose for local dev
├── next.config.js            # Next.js config (standalone, CSP, transpile)
├── openapi.json              # OpenAPI 3.x spec for API documentation
├── package.json              # pnpm project manifest
├── playwright.config.ts      # Playwright E2E config
├── tailwind.config.js        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript config (strict, @/* paths)
└── vitest.config.ts          # Vitest unit test config
```

## Directory Purposes

**`src/app/[[...panel]]/`:**
- Purpose: Catch-all route that powers the entire SPA dashboard
- Contains: Single `page.tsx` with `ContentRouter` switch statement mapping URL segments to panel components
- Key files: `page.tsx` -- imports all panels, manages WebSocket + SSE connections

**`src/app/api/`:**
- Purpose: All REST API endpoints organized by resource
- Contains: `route.ts` files exporting HTTP method handlers (GET, POST, PUT, DELETE)
- Key files: `agents/route.ts`, `tasks/route.ts`, `events/route.ts`, `auth/login/route.ts`
- Nested resources use dynamic segments: `agents/[id]/heartbeat/route.ts`, `tasks/[id]/comments/route.ts`

**`src/components/panels/`:**
- Purpose: Feature-specific panel components rendered by `ContentRouter`
- Contains: One `.tsx` file per panel (~30 panels)
- Key files: `task-board-panel.tsx`, `agent-squad-panel-phase3.tsx`, `super-admin-panel.tsx`, `office-panel.tsx`

**`src/components/layout/`:**
- Purpose: Persistent shell components visible across all panels
- Contains: Navigation rail, header bar, live feed sidebar, banners
- Key files: `nav-rail.tsx`, `header-bar.tsx`, `live-feed.tsx`

**`src/components/dashboard/`:**
- Purpose: Overview dashboard shown on the default/overview tab
- Contains: Stats grid, session list, agent network visualization
- Key files: `dashboard.tsx`, `stats-grid.tsx`, `agent-network.tsx`

**`src/components/chat/`:**
- Purpose: Agent-to-agent and operator chat interface
- Contains: Chat panel overlay, message list, conversation list, input
- Key files: `chat-panel.tsx`, `message-list.tsx`, `chat-input.tsx`

**`src/components/ui/`:**
- Purpose: Small reusable UI atoms
- Contains: Agent avatar, digital clock, online status indicator, theme toggle
- Key files: `agent-avatar.tsx`, `theme-toggle.tsx`

**`src/lib/`:**
- Purpose: Server-side services, utilities, and shared hooks
- Contains: Database, auth, validation, config, sync, scheduling, real-time hooks
- Key files: `db.ts`, `auth.ts`, `config.ts`, `event-bus.ts`, `validation.ts`, `migrations.ts`, `websocket.ts`, `scheduler.ts`, `webhooks.ts`, `agent-sync.ts`, `super-admin.ts`

**`src/store/`:**
- Purpose: Client-side global state management
- Contains: Single Zustand store with all domain slices (tasks, agents, sessions, chat, notifications, UI state)
- Key files: `index.ts`

**`src/types/`:**
- Purpose: Shared TypeScript type definitions for WebSocket protocol, sessions, agents, chat
- Contains: Interface definitions used by both client hooks and components
- Key files: `index.ts`

**`tests/`:**
- Purpose: E2E integration tests using Playwright against a running dev server
- Contains: Spec files testing API endpoints end-to-end, test fixtures with OpenClaw agent data
- Key files: `tasks-crud.spec.ts`, `agents-crud.spec.ts`, `helpers.ts`

**`ops/`:**
- Purpose: Operational tooling for multi-tenant deployments
- Contains: Provisioner daemon for tenant lifecycle management
- Key files: `mc-provisioner-daemon.js`

**`scripts/`:**
- Purpose: Shell scripts for agent integration
- Contains: Heartbeat polling, notification delivery daemon
- Key files: `agent-heartbeat.sh`, `notification-daemon.sh`

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root HTML layout with ThemeProvider
- `src/app/[[...panel]]/page.tsx`: Main SPA entry point and panel router
- `src/app/login/page.tsx`: Authentication login page

**Configuration:**
- `next.config.js`: Next.js standalone output, CSP headers, transpile config
- `tailwind.config.js`: Tailwind theme customization
- `tsconfig.json`: TypeScript strict mode, `@/*` path alias to `./src/*`
- `src/lib/config.ts`: Runtime configuration from environment variables
- `vitest.config.ts`: Unit test runner configuration
- `playwright.config.ts`: E2E test configuration

**Core Logic:**
- `src/lib/db.ts`: Database singleton, entity types, helper functions, audit logging
- `src/lib/auth.ts`: Authentication strategies, session management, RBAC
- `src/lib/event-bus.ts`: Server-side event bus for real-time broadcasting
- `src/lib/validation.ts`: Zod schemas for all API request bodies
- `src/lib/migrations.ts`: Database migration definitions
- `src/lib/scheduler.ts`: Background task scheduler (backup, cleanup, sync)
- `src/lib/webhooks.ts`: Outbound webhook delivery with retry/backoff
- `src/lib/agent-sync.ts`: Sync agents between OpenClaw config and MC database
- `src/lib/super-admin.ts`: Multi-tenant provisioning logic

**State Management:**
- `src/store/index.ts`: Zustand store with all client state
- `src/lib/websocket.ts`: WebSocket client hook for gateway connection
- `src/lib/use-server-events.ts`: SSE client hook for local DB events
- `src/lib/use-smart-poll.ts`: Visibility-aware polling hook with SSE/WS awareness

**Testing:**
- `src/lib/__tests__/`: Unit tests for lib modules (co-located)
- `src/lib/google-auth.test.ts`: Co-located test file
- `tests/`: E2E integration specs (Playwright)
- `tests/helpers.ts`: Shared E2E test utilities
- `tests/fixtures/`: Test fixture data for OpenClaw agent simulation

## Naming Conventions

**Files:**
- Components: `kebab-case.tsx` (e.g., `task-board-panel.tsx`, `agent-avatar.tsx`)
- Library modules: `kebab-case.ts` (e.g., `event-bus.ts`, `agent-sync.ts`)
- API routes: `route.ts` inside directory matching the resource path
- Test files: `*.spec.ts` (E2E in `tests/`), `*.test.ts` (unit, co-located in `src/lib/`)
- SQL: `schema.sql` for base schema

**Directories:**
- API routes: Resource name in kebab-case (`agents`, `tasks`, `quality-review`)
- Dynamic segments: `[id]` for resource IDs, `[[...panel]]` for catch-all
- Component groups: Feature name in kebab-case (`chat`, `dashboard`, `panels`, `layout`, `ui`)

**Exports:**
- Components: PascalCase named exports (e.g., `export function TaskBoardPanel()`)
- Hooks: camelCase with `use` prefix (e.g., `export function useWebSocket()`)
- Utilities: camelCase named exports (e.g., `export function getDatabase()`)
- Store: Single named export `useMissionControl`
- Constants: UPPER_SNAKE_CASE (e.g., `PROTOCOL_VERSION`, `SESSION_DURATION`)

## Where to Add New Code

**New Dashboard Panel:**
1. Create component: `src/components/panels/{panel-name}-panel.tsx`
2. Export a named PascalCase component (e.g., `export function MyNewPanel()`)
3. Import and add case in `ContentRouter` switch in `src/app/[[...panel]]/page.tsx`
4. Add navigation entry in `src/components/layout/nav-rail.tsx`

**New API Endpoint:**
1. Create directory: `src/app/api/{resource}/`
2. Create `route.ts` exporting async functions named `GET`, `POST`, `PUT`, `DELETE`
3. Use `requireRole(request, role)` for auth
4. Use `validateBody(request, schema)` for mutation validation
5. Use `mutationLimiter(request)` for rate limiting on mutations
6. Broadcast changes via `eventBus.broadcast(eventType, data)` for real-time updates
7. Add Zod schema to `src/lib/validation.ts`

**New Database Table:**
1. Add migration to `src/lib/migrations.ts` with a sequential ID (e.g., `'042_my_feature'`)
2. Add TypeScript interface to `src/lib/db.ts`
3. Add workspace_id column for multi-tenant isolation
4. Add indexes for frequently queried columns

**New React Hook:**
1. Client-only hooks: Place in `src/lib/` with `use-` prefix (e.g., `src/lib/use-my-feature.ts`)
2. Mark with `'use client'` directive at the top
3. Import store via `useMissionControl()` if needed

**New Server-Side Utility:**
1. Place in `src/lib/{module-name}.ts`
2. Import from other server files using `@/lib/{module-name}`

**New Store Slice:**
1. Add interface properties and actions to `MissionControlStore` in `src/store/index.ts`
2. Add initial state and action implementations in the `create()` call
3. Add SSE dispatch case in `src/lib/use-server-events.ts` if the data comes from server events

**New Unit Test:**
1. Co-located: `src/lib/__tests__/{module}.test.ts` or `src/lib/{module}.test.ts`
2. Follow vitest patterns; test runner: `pnpm test`

**New E2E Test:**
1. Place in `tests/{feature}.spec.ts`
2. Use helpers from `tests/helpers.ts` for auth setup
3. Test runner: `pnpm test:e2e`

## Special Directories

**`.data/`:**
- Purpose: SQLite database file and backups at runtime
- Generated: Yes (created automatically on first run)
- Committed: No (in `.gitignore`)

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (created by `pnpm build` or `pnpm dev`)
- Committed: No

**`public/office-sprites/`:**
- Purpose: Static sprite assets for the "Office" visualization panel
- Generated: No (hand-crafted SVGs and CC0-licensed PNGs)
- Committed: Yes

**`ops/templates/`:**
- Purpose: Templates used by the multi-tenant provisioner daemon
- Generated: No
- Committed: Yes

**`tests/fixtures/openclaw/`:**
- Purpose: Mock OpenClaw state directory structure for E2E tests
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-09*
