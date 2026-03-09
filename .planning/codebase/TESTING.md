# Testing Patterns

**Analysis Date:** 2026-03-09

## Test Framework

**Unit Test Runner:**
- Vitest 2.x
- Config: `vitest.config.ts`
- Environment: `jsdom` (for React component testing support)
- Globals: `true` (describe/it/expect available without import, but test files import them explicitly from `vitest`)
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`)
- Plugin: `@vitejs/plugin-react` + `vite-tsconfig-paths` (supports `@/` path alias in tests)

**E2E Test Runner:**
- Playwright 1.51+
- Config: `playwright.config.ts` (main), `playwright.openclaw.local.config.ts`, `playwright.openclaw.gateway.config.ts`
- Browser: Chromium only
- Serial execution: `fullyParallel: false`, `workers: 1`
- Timeout: 60s per test, 10s for assertions
- Trace: `retain-on-failure`
- Web server: auto-starts `node .next/standalone/server.js` on port 3005

**Assertion Libraries:**
- Vitest built-in: `expect`, `toBe`, `toEqual`, `toBeCloseTo`, `toContain`, etc.
- `@testing-library/jest-dom`: DOM-specific matchers (available but unit tests are mostly logic-only)
- `@testing-library/react` + `@testing-library/dom`: available for component tests (not widely used yet)
- Playwright: `expect(res.status()).toBe(200)`, `expect(body).toHaveProperty('tasks')`

**Run Commands:**
```bash
pnpm test                # Run all unit tests (vitest run)
pnpm test:watch          # Watch mode (vitest)
pnpm test:ui             # Vitest UI
pnpm test:e2e            # Run all E2E tests (playwright)
pnpm test:e2e:openclaw   # OpenClaw offline harness tests
pnpm test:e2e:openclaw:local    # Local mode (no gateway)
pnpm test:e2e:openclaw:gateway  # Gateway mode (mock gateway)
pnpm test:all            # Full quality gate: lint + typecheck + test + build + e2e
pnpm quality:gate        # Alias for test:all
```

## Test File Organization

**Unit tests location:**
- Primary: `src/lib/__tests__/<module-name>.test.ts` (dedicated test directory)
- Co-located: `src/lib/google-auth.test.ts` (one exception, test sits next to source)

**E2E tests location:**
- `tests/<feature-name>.spec.ts`
- `tests/helpers.ts` (shared factory functions and auth helpers)
- `tests/fixtures/openclaw/` (fixture data for OpenClaw harness tests)
- `tests/README.md` (test documentation)

**Naming:**
- Unit: `<module-name>.test.ts` (matches source file name)
- E2E: `<feature-name>.spec.ts` (describes the feature area, not file)

**Structure:**
```
src/
  lib/
    __tests__/
      auth.test.ts
      validation.test.ts
      rate-limit.test.ts
      webhooks.test.ts
      task-status.test.ts
      token-pricing.test.ts
      db-helpers.test.ts
      db-seed-auth-pass.test.ts
      json-relaxed.test.ts
      gateway-url.test.ts
      cron-occurrences.test.ts
      task-costs.test.ts
    google-auth.test.ts        # co-located exception
tests/
  helpers.ts                   # shared test utilities
  tasks-crud.spec.ts
  agents-crud.spec.ts
  webhooks-crud.spec.ts
  alerts-crud.spec.ts
  workflows-crud.spec.ts
  user-management.spec.ts
  task-comments.spec.ts
  task-outcomes.spec.ts
  task-queue.spec.ts
  task-regression.spec.ts
  auth-guards.spec.ts
  login-flow.spec.ts
  rate-limiting.spec.ts
  timing-safe-auth.spec.ts
  csrf-validation.spec.ts
  quality-review.spec.ts
  notifications.spec.ts
  mentions.spec.ts
  search-and-export.spec.ts
  workload-signals.spec.ts
  delete-body.spec.ts
  limit-caps.spec.ts
  openapi.spec.ts
  agent-api-keys.spec.ts
  agent-attribution.spec.ts
  agent-costs.spec.ts
  agent-diagnostics.spec.ts
  device-identity.spec.ts
  gateway-connect.spec.ts
  github-sync.spec.ts
  direct-cli.spec.ts
  actor-identity-hardening.spec.ts
  legacy-cookie-removed.spec.ts
  docs-knowledge.spec.ts
  openclaw-harness.spec.ts     # isolated by testIgnore in main config
  fixtures/openclaw/           # fixture data
```

## Unit Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'
import { someFunction } from '@/lib/module-name'

describe('functionName', () => {
  it('does expected thing with valid input', () => {
    const result = someFunction(validInput)
    expect(result).toBe(expectedOutput)
  })

  it('rejects invalid input', () => {
    const result = someFunction(invalidInput)
    expect(result).toBe(false)
  })
})
```

**Patterns:**
- Group by function/concept using `describe()` blocks
- Test descriptions use present tense: `'accepts valid input'`, `'rejects missing title'`, `'returns empty array when no mentions'`
- One assertion concept per test (but multiple `expect()` calls are fine for validating a single result object)
- `safeParse` pattern for Zod schema tests -- check `result.success` then access `result.data`
- No nested `describe` blocks (flat structure within a `describe`)

**Setup/Teardown pattern (when needed):**
```typescript
describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // tests...
})
```

**Environment variable testing:**
```typescript
describe('requireRole', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, API_KEY: 'test-api-key-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // tests...
})
```

## E2E Test Structure

**Suite Organization:**
```typescript
import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestTask, deleteTestTask } from './helpers'

test.describe('Feature Name', () => {
  const cleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of cleanup) {
      await deleteTestTask(request, id).catch(() => {})
    }
    cleanup.length = 0
  })

  test('POST creates resource', async ({ request }) => {
    const { id, res, body } = await createTestTask(request)
    cleanup.push(id)

    expect(res.status()).toBe(201)
    expect(body.task).toBeDefined()
  })

  // Section divider comments: // ── POST /api/tasks ──────────────────────────
})
```

**Key patterns:**
- API-only E2E tests (no browser UI tests) -- uses Playwright's `request` fixture directly
- Cleanup array pattern: track created resource IDs, delete in `afterEach`
- `catch(() => {})` on cleanup calls to avoid cascading failures
- Tests organized by HTTP method sections with divider comments
- Full lifecycle tests: `create -> read -> update -> delete -> confirm gone`
- Use factory helpers from `tests/helpers.ts` for consistent resource creation

**Authentication:**
- All E2E requests include `API_KEY_HEADER` (`{ 'x-api-key': 'test-api-key-e2e-12345' }`)
- Auth-guard tests explicitly omit the header to verify 401 responses
- Rate limiting disabled via `MC_DISABLE_RATE_LIMIT=1` env var (except login limiter which is `critical: true`)

## Mocking

**Framework:** Vitest's built-in `vi.mock()` and `vi.fn()`

**Module mocking pattern:**
```typescript
// Mock dependencies before importing the module under test
vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn((p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(() => false),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn(), on: vi.fn(), emit: vi.fn() },
}))

// Import after mocks
import { db_helpers } from '@/lib/db'
```

**Hoisted mocks (for shared references):**
```typescript
const { mockBroadcast, mockRun, mockPrepare } = vi.hoisted(() => {
  const mockRun = vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }))
  const mockPrepare = vi.fn(() => ({
    run: mockRun,
    get: vi.fn((): any => ({ count: 1 })),
    all: vi.fn(() => []),
  }))
  const mockBroadcast = vi.fn()
  return { mockBroadcast, mockRun, mockPrepare }
})
```

Use `vi.hoisted()` when mock variables need to be referenced inside `vi.mock()` factory functions.

**Global stubbing (for fetch):**
```typescript
vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  json: async () => ({ email: 'user@example.com', sub: 'sub', email_verified: true }),
} as any)))

// After test:
vi.unstubAllGlobals()
```

**Fake timers:**
```typescript
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// In test:
vi.advanceTimersByTime(11_000)
```

**What to mock:**
- Native modules: `better-sqlite3` (to avoid compiled bindings in test env)
- Side-effect singletons: `event-bus`, `logger`, `scheduler`
- External HTTP calls: `fetch` via `vi.stubGlobal`
- Config modules: `@/lib/config` (to use `:memory:` db path)
- Password hashing: `@/lib/password` (deterministic output for assertions)

**What NOT to mock:**
- The module under test itself
- Zod schemas (test the actual schema validation)
- Pure utility functions (`parseJsonRelaxed`, `buildGatewayWebSocketUrl`, etc.)
- Crypto functions used in the module under test (e.g., `createHmac` in webhook tests)

## Fixtures and Factories

**E2E Factory Functions (in `tests/helpers.ts`):**
```typescript
export async function createTestTask(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const title = `e2e-task-${uid()}`
  const res = await request.post('/api/tasks', {
    headers: API_KEY_HEADER,
    data: { title, ...overrides },
  })
  const body = await res.json()
  return { id: body.task?.id as number, title, res, body }
}

export async function deleteTestTask(request: APIRequestContext, id: number) {
  return request.delete(`/api/tasks/${id}`, { headers: API_KEY_HEADER })
}
```

Available factories:
- `createTestTask()` / `deleteTestTask()` -- Tasks
- `createTestAgent()` / `deleteTestAgent()` -- Agents
- `createTestWorkflow()` / `deleteTestWorkflow()` -- Workflows
- `createTestWebhook()` / `deleteTestWebhook()` -- Webhooks
- `createTestAlert()` / `deleteTestAlert()` -- Alerts
- `createTestUser()` / `deleteTestUser()` -- Users

All factories:
- Generate unique names with `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
- Accept `overrides` parameter for customizing fields
- Return `{ id, name/title, res, body }` tuple
- Use `API_KEY_HEADER` for authentication

**Unit test data:**
- Inline test data (no fixture files for unit tests)
- Zod schema tests use minimal valid/invalid payloads
- Numeric/timing tests use explicit values for deterministic assertions

**E2E Fixtures:**
- `tests/fixtures/openclaw/` -- OpenClaw configuration fixtures
  - `openclaw.json` -- main config
  - `agents/` -- agent session data
  - `workspaces/` -- agent workspace files (identity.md, soul.md, TOOLS.md)
  - `cron/jobs.json` -- cron job definitions

## Coverage

**Requirements:**
- Enforced thresholds (in `vitest.config.ts`):
  - Lines: 60%
  - Functions: 60%
  - Branches: 60%
  - Statements: 60%
- Provider: `v8`
- Coverage scope: `src/lib/**/*.ts` only (excludes components, API routes, store)
- Excluded from coverage: `src/lib/__tests__/**`, `src/**/*.test.ts`

**View Coverage:**
```bash
pnpm test -- --coverage     # Generate coverage report
```

## Test Types

**Unit Tests (13 test files):**
- Location: `src/lib/__tests__/*.test.ts` + `src/lib/google-auth.test.ts`
- Scope: Pure business logic in `src/lib/` -- validation schemas, crypto functions, rate limiting, task status normalization, token pricing, cron parsing, URL building, mention parsing, database helpers
- No database or network I/O (all mocked)
- Fast execution (no jsdom rendering needed for most)
- Example tested modules: `validation.ts`, `auth.ts`, `rate-limit.ts`, `webhooks.ts`, `task-status.ts`, `token-pricing.ts`, `json-relaxed.ts`, `gateway-url.ts`, `cron-occurrences.ts`, `task-costs.ts`, `db.ts` (helpers only)

**E2E / Integration Tests (40+ spec files):**
- Location: `tests/*.spec.ts`
- Scope: Full API request/response lifecycle against running Next.js server
- Categories documented in `tests/README.md`:
  - **Security & Auth:** auth guards, CSRF, rate limiting, timing-safe comparison, cookie handling
  - **CRUD Lifecycle:** tasks, agents, workflows, webhooks, alerts, users, comments
  - **Features:** notifications, quality reviews, search/export, mentions
  - **Infrastructure:** limit caps, DELETE body standardization, OpenAPI spec validation
- Run against a production build (`node .next/standalone/server.js`)
- Serial execution to avoid database contention (SQLite)

**Component Tests:**
- `@testing-library/react` and `@testing-library/dom` are installed as dev dependencies
- `jsdom` environment configured in Vitest
- `@testing-library/jest-dom` setup in `src/test/setup.ts`
- No component test files exist yet -- infrastructure is ready but unused

## Common Patterns

**Schema Validation Testing:**
```typescript
describe('createTaskSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = createTaskSchema.safeParse({ title: 'Fix bug' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Fix bug')
      expect(result.data.status).toBe('inbox')
    }
  })

  it('rejects missing title', () => {
    const result = createTaskSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
```

**Rate Limiter Testing (with fake timers):**
```typescript
it('resets after the window expires', () => {
  const limiter = createRateLimiter({ windowMs: 10_000, maxRequests: 1 })
  expect(limiter(makeRequest())).toBeNull()
  expect(limiter(makeRequest())).not.toBeNull()

  vi.advanceTimersByTime(11_000)

  expect(limiter(makeRequest())).toBeNull()
})
```

**Crypto/Security Testing:**
```typescript
it('returns true for a correct signature', () => {
  const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  expect(verifyWebhookSignature(secret, body, sig)).toBe(true)
})
```

**E2E CRUD Lifecycle:**
```typescript
test('full lifecycle: create -> read -> update -> delete -> confirm gone', async ({ request }) => {
  const { id } = await createTestTask(request, { description: 'lifecycle test' })

  const readRes = await request.get(`/api/tasks/${id}`, { headers: API_KEY_HEADER })
  expect(readRes.status()).toBe(200)

  const updateRes = await request.put(`/api/tasks/${id}`, {
    headers: API_KEY_HEADER,
    data: { status: 'in_progress' },
  })
  expect(updateRes.status()).toBe(200)

  const deleteRes = await request.delete(`/api/tasks/${id}`, { headers: API_KEY_HEADER })
  expect(deleteRes.status()).toBe(200)

  const goneRes = await request.get(`/api/tasks/${id}`, { headers: API_KEY_HEADER })
  expect(goneRes.status()).toBe(404)
})
```

**E2E Auth Guard Sweep:**
```typescript
const PROTECTED_GET_ENDPOINTS = ['/api/agents', '/api/tasks', ...]

for (const endpoint of PROTECTED_GET_ENDPOINTS) {
  test(`GET ${endpoint} returns 401 without auth`, async ({ request }) => {
    const res = await request.get(endpoint)
    expect(res.status()).toBe(401)
  })
}
```

**Async Error Testing:**
```typescript
it('rejects missing credentials', async () => {
  await expect(verifyGoogleIdToken('')).rejects.toThrow(/Missing Google credential/i)
})
```

## E2E Test Environment

**Required environment variables:**
- `API_KEY=test-api-key-e2e-12345`
- `AUTH_USER=testadmin`
- `AUTH_PASS=testpass1234!`
- `MC_DISABLE_RATE_LIMIT=1` (bypasses non-critical rate limits)

**Web server configuration (in `playwright.config.ts`):**
- Command: `node .next/standalone/server.js`
- Base URL: `http://127.0.0.1:3005`
- Reuse existing server: `true`
- Startup timeout: 120s
- Workload throttle/shed limits raised high for E2E

---

*Testing analysis: 2026-03-09*
