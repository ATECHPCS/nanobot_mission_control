# Coding Conventions

**Analysis Date:** 2026-03-09

## Naming Patterns

**Files:**
- Components: `kebab-case.tsx` (e.g., `agent-avatar.tsx`, `task-board-panel.tsx`, `chat-input.tsx`)
- Lib modules: `kebab-case.ts` (e.g., `rate-limit.ts`, `event-bus.ts`, `task-status.ts`)
- API routes: `route.ts` inside Next.js App Router directory structure (e.g., `src/app/api/tasks/route.ts`)
- Test files (unit): `<module-name>.test.ts` inside `src/lib/__tests__/` or co-located (e.g., `src/lib/google-auth.test.ts`)
- Test files (E2E): `<feature-name>.spec.ts` inside `tests/` (e.g., `tests/tasks-crud.spec.ts`)
- Type definitions: `index.ts` barrel files in `src/types/` and `src/store/`
- Config files: `.config.js` or `.config.ts` at project root
- Exception: `ErrorBoundary.tsx` uses PascalCase filename (React class component convention)

**Functions:**
- Use `camelCase` for all functions: `getDatabase()`, `validateSession()`, `createRateLimiter()`
- API route handlers: exported named functions matching HTTP methods in UPPERCASE: `GET`, `POST`, `PUT`, `DELETE`
- React components: `PascalCase` for component functions: `AgentAvatar`, `Dashboard`, `TaskBoardPanel`
- Custom hooks: `use` prefix with camelCase: `useSmartPoll`, `useServerEvents`, `useFocusTrap`
- Helper/factory functions: descriptive verbs: `buildGatewayWebSocketUrl()`, `extractClientIp()`, `normalizeModel()`
- Private/internal helpers: plain `camelCase`, no underscore prefix: `mapTaskRow()`, `resolveProjectId()`

**Variables:**
- Constants: `UPPER_SNAKE_CASE` for static values: `SESSION_DURATION`, `INSECURE_PASSWORDS`, `ROLE_LEVELS`, `API_KEY_HEADER`
- Local variables: `camelCase`: `workspaceId`, `existingAgent`, `taskId`
- Environment variables: `UPPER_SNAKE_CASE` with `MC_` prefix for app-specific config: `MC_DISABLE_RATE_LIMIT`, `MC_TRUSTED_PROXIES`, `MC_ENABLE_HSTS`

**Types/Interfaces:**
- `PascalCase` for all types and interfaces: `Task`, `Agent`, `User`, `RateLimitEntry`, `ServerEvent`
- Props interfaces: `<ComponentName>Props` pattern: `AgentAvatarProps`, `SmartPollOptions`
- Store interface: single large `MissionControlStore` interface in `src/store/index.ts`
- Database row interfaces: suffixed with `Row` or `QueryRow`: `SessionQueryRow`, `AgentApiKeyRow`, `CountRow`

## Code Style

**Formatting:**
- No Prettier config detected -- relies on ESLint only
- Semicolons: inconsistent -- some files use them, some omit. Server-side lib files (`src/lib/auth.ts`, `src/lib/rate-limit.ts`) tend to omit semicolons. API route files (`src/app/api/tasks/route.ts`) use semicolons. Follow the existing style of the file being edited.
- Quotes: single quotes for strings in TypeScript
- Trailing commas: used in multi-line structures
- Indentation: 2 spaces

**Linting:**
- ESLint 9 flat config: `eslint.config.mjs`
- Extends `eslint-config-next`
- Disabled rules (due to React 19 false positives):
  - `react-hooks/set-state-in-effect`: off
  - `react-hooks/purity`: off
  - `react-hooks/immutability`: off
- Ignored directories: `.data/**`, `ops/**`
- Run with: `pnpm lint`

**TypeScript:**
- Strict mode enabled in `tsconfig.json`
- Target: `es2017`
- Module resolution: `bundler`
- Path alias: `@/*` maps to `./src/*`
- Type assertions used for database query results: `as Task`, `as { id: number } | undefined`
- `any` used pragmatically for database row params and JSON fields

## Import Organization

**Order:**
1. External framework imports (`next/server`, `react`, `zustand`)
2. Internal lib imports via path alias (`@/lib/db`, `@/lib/auth`, `@/lib/validation`)
3. Internal component imports (`@/components/...`)
4. Internal store imports (`@/store`)
5. Type-only imports mixed with value imports (not separated)

**Path Aliases:**
- `@/*` -> `./src/*` (the only alias, configured in `tsconfig.json`)
- Always use `@/` prefix for internal imports. Never use relative paths like `../../lib/db`.

**Example (from `src/app/api/tasks/route.ts`):**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, Task, db_helpers } from '@/lib/db';
import { eventBus } from '@/lib/event-bus';
import { requireRole } from '@/lib/auth';
import { mutationLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { validateBody, createTaskSchema, bulkUpdateTaskStatusSchema } from '@/lib/validation';
```

**Exception:** Test files in `src/lib/__tests__/` sometimes use relative imports for the module under test: `import { verifyWebhookSignature } from '../webhooks'`

## API Route Patterns

**Authentication guard (required on every route):**
```typescript
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // ... handler logic using auth.user
}
```

Use `'viewer'` for read endpoints, `'operator'` for mutations, `'admin'` for destructive operations.

**Rate limiting (required on mutation routes):**
```typescript
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  // ... handler logic
}
```

**Request validation with Zod:**
```typescript
const validated = await validateBody(request, createTaskSchema);
if ('error' in validated) return validated.error;
const body = validated.data;
```

Define schemas in `src/lib/validation.ts`. Use `validateBody()` helper which returns `{ data: T } | { error: NextResponse }`.

**Response shape:**
- Success: `NextResponse.json({ task: parsedTask }, { status: 201 })` or `{ success: true, updated: count }`
- List responses: `{ tasks: [...], total: N, page: N, limit: N }` (consistent pagination shape)
- Error: `NextResponse.json({ error: 'Human-readable message' }, { status: 4xx })`
- Always include `status` in error responses

**Error handling (try/catch wrapper):**
```typescript
try {
  // ... logic
} catch (error) {
  logger.error({ err: error }, 'POST /api/tasks error');
  return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
}
```

Always log with `logger.error({ err: error }, 'METHOD /api/route error')` pattern. Use user-facing generic error message, not the raw error.

**Workspace scoping:**
All database queries must be scoped to `workspace_id`:
```typescript
const workspaceId = auth.user.workspace_id;
db.prepare('SELECT * FROM tasks WHERE workspace_id = ?').all(workspaceId);
```

**Activity logging + Event broadcasting:**
After mutations, log activity and broadcast via SSE:
```typescript
db_helpers.logActivity('task_created', 'task', taskId, actor, `Created task: ${title}`, { ... }, workspaceId);
eventBus.broadcast('task.created', parsedTask);
```

## Error Handling

**Server-side patterns:**
- Wrap entire route handler body in `try/catch`
- Log errors with structured pino logger: `logger.error({ err: error }, 'context message')`
- Return generic user-facing error messages in JSON responses
- Use specific HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limit), 500 (server error), 502 (upstream failure)

**Client-side patterns:**
- `ErrorBoundary` class component wraps panel content: `src/components/ErrorBoundary.tsx`
- Key-based error boundary reset: `<ErrorBoundary key={activeTab}>`
- Fetch calls use `.catch(() => {})` for non-critical requests (graceful degradation)
- Promise errors are silently caught in many places (fire-and-forget pattern)

**Validation errors:**
- Zod validation returns structured error details: `{ error: 'Validation failed', details: ['field: message'] }`
- Schemas defined centrally in `src/lib/validation.ts`

## Logging

**Server-side:**
- Framework: `pino` (structured JSON logger)
- Config: `src/lib/logger.ts`
- Uses `pino-pretty` in development (dev dependency)
- Log level controlled by `LOG_LEVEL` env var (default: `info`)
- Singleton export: `import { logger } from '@/lib/logger'`

**Patterns:**
```typescript
logger.info('Database migrations applied successfully')
logger.warn('AUTH_PASS is not set -- skipping admin user seeding.')
logger.error({ err: error }, 'POST /api/tasks error')
logger.error({ err: provisionError, openclawId, workspacePath }, 'OpenClaw workspace provisioning failed')
```

Always pass error objects as `{ err: error }` (pino convention for serialization), with context message as second argument.

**Client-side:**
- Framework: custom `createClientLogger()` in `src/lib/client-logger.ts`
- Mirrors pino API: `debug()`, `info()`, `warn()`, `error()`
- Suppresses debug/info in production (only warn/error logged)
- Usage: `const log = createClientLogger('ErrorBoundary')`
- Output format: `[LEVEL] ModuleName: message`

## Comments

**When to Comment:**
- JSDoc on exported functions with `/** ... */` blocks for public API: database helpers, auth functions
- Inline comments for non-obvious logic (e.g., circuit breaker derivation, workspace resolution)
- Section dividers in route files: `// ── POST /api/tasks ──────────────────────────`
- TODO/FIXME markers for known issues (sparingly used)

**JSDoc/TSDoc:**
- Used on public-facing lib functions with `@param`-less style (description only)
- Not used on component props or internal helpers
- Example from `src/lib/db.ts`:
```typescript
/**
 * Get or create database connection
 */
export function getDatabase(): Database.Database {
```

## Function Design

**Size:** Most functions are moderate (20-80 lines). Route handlers can be longer (100-200 lines) due to inline validation, business logic, and response mapping.

**Parameters:**
- Use `options` objects for functions with 3+ optional params: `createUser(username, password, displayName, role, options?)`
- Database helpers accept `workspaceId` as trailing parameter with default `= 1`
- Request handlers take `request: NextRequest` (or `Request` in lib code)

**Return Values:**
- Discriminated unions for auth: `{ user: User } | { error: string; status: 401 | 403 }`
- Validation returns: `{ data: T } | { error: NextResponse }`
- Database lookups return `T | null` (never throw for missing records)
- Rate limiter returns `NextResponse | null` (null = allowed)

## Module Design

**Exports:**
- Named exports only (no default exports except Next.js pages/layouts)
- Functions, interfaces, types, and constants exported individually
- Zustand store exported as named hook: `export const useMissionControl = create<...>()`

**Barrel Files:**
- `src/types/index.ts` - Frontend-facing type definitions
- `src/store/index.ts` - Single Zustand store with all state + actions
- No barrel files for `src/lib/` -- import individual modules directly

**Singletons:**
- Database: `getDatabase()` lazy initializer in `src/lib/db.ts`
- Event bus: `eventBus` singleton via `globalThis` in `src/lib/event-bus.ts`
- Logger: `logger` singleton in `src/lib/logger.ts`
- Rate limiters: module-level `createRateLimiter()` calls in `src/lib/rate-limit.ts`
- All singletons survive HMR via `globalThis` pattern where needed

## Component Patterns

**Directive:**
- All React components use `'use client'` directive (entire app is client-rendered with server-side API routes)

**State management:**
- Global state: single Zustand store (`useMissionControl` hook from `src/store/index.ts`)
- Local state: `useState` for component-specific UI state (loading, form values)
- No React Context usage -- Zustand replaces it

**Data fetching:**
- Custom `useSmartPoll` hook for visibility-aware polling with SSE/WS pause capability
- Direct `fetch()` calls to internal API routes (`/api/tasks`, `/api/agents`)
- No external data fetching library (no SWR, no React Query)

**Styling:**
- Tailwind CSS with `clsx` + `tailwind-merge` via `cn()` utility in `src/lib/utils.ts`
- CSS custom properties for theming (HSL color variables via `--primary`, `--background`, etc.)
- Dark mode via `next-themes` with `class` strategy (default theme: `dark`)
- Semantic color tokens: `primary`, `secondary`, `destructive`, `muted`, `accent`, `success`, `warning`, `info`

**Component structure:**
```typescript
'use client'

interface ComponentProps {
  // typed props
}

export function ComponentName({ prop1, prop2 }: ComponentProps) {
  // hooks at top
  const { storeValue } = useMissionControl()
  const [localState, setLocalState] = useState(initial)

  // callbacks
  const handleAction = useCallback(async () => { ... }, [deps])

  // effects
  useEffect(() => { ... }, [deps])

  // render
  return <div className="...">...</div>
}
```

---

*Convention analysis: 2026-03-09*
