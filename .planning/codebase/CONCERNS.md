# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**Duplicated Zustand Store (Critical):**
- Issue: Two nearly-identical Zustand store files exist with diverging type definitions
- Files: `src/index.ts` (760 lines), `src/store/index.ts` (795 lines)
- Impact: All components import from `@/store` (the canonical path), making `src/index.ts` dead code. However the two files have **diverging types**: `src/index.ts` uses `priority: 'low' | 'medium' | 'high' | 'urgent'` while `src/store/index.ts` uses `priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent'`. `src/store/index.ts` also has additional `CronJob` fields (`id`, `model`, `agentId`, `timezone`, `delivery`) missing from the duplicate. If any code accidentally imports from the wrong path, types will silently mismatch.
- Fix approach: Delete `src/index.ts` entirely. Verify no imports reference it (none found in grep). The canonical store is `src/store/index.ts`.

**Duplicated Type Definitions (Server vs Client):**
- Issue: Entity types like `Task`, `Agent`, `Comment`, `Notification`, `Activity` are defined independently in `src/lib/db.ts` (server) and `src/store/index.ts` (client). These definitions have already drifted -- the server `Task.priority` allows `'urgent'` but not `'critical'`, while the client store allows both `'critical'` and `'urgent'`.
- Files: `src/lib/db.ts` (lines 161-297), `src/store/index.ts` (lines 89-257)
- Impact: Type mismatches between API responses and client expectations can cause runtime errors or silent data corruption. Shared types would catch drift at compile time.
- Fix approach: Create a `src/types/shared.ts` module with canonical entity types. Import from both server and client code. Remove duplicate definitions.

**In-Memory Rate Limiter (Not Horizontally Scalable):**
- Issue: Rate limiters use a per-process `Map<string, RateLimitEntry>` with periodic cleanup. Each Next.js server process has its own independent counter.
- Files: `src/lib/rate-limit.ts`
- Impact: In multi-process/multi-instance deployments, rate limits are per-instance, not per-client. An attacker could distribute requests across instances to bypass limits. Single-instance deployments (SQLite-based app) are not affected today, but the architecture limits future scaling.
- Fix approach: Acceptable for single-process SQLite deployments. If scaling to multiple processes, move rate limit counters to SQLite or Redis.

**Spawn History Not Persisted:**
- Issue: The spawn GET endpoint reads log files on disk to reconstruct history rather than storing spawn records in the database. Comment on line 138 says "In a real implementation, you'd store spawn history in a database."
- Files: `src/app/api/spawn/route.ts` (lines 129-211)
- Impact: Spawn history is fragile, incomplete, and depends on log file availability. Log rotation or missing log directories cause empty results.
- Fix approach: Add a `spawn_requests` table to the database. Store spawn records on POST, update status on completion.

**Duplicated `safeCompare` Function:**
- Issue: Timing-safe string comparison is implemented identically in two places with subtly different length-mismatch behavior.
- Files: `src/lib/auth.ts` (lines 8-18, compares against dummy buffer on length mismatch), `src/proxy.ts` (lines 6-12, returns false immediately on length mismatch)
- Impact: The proxy version leaks string length via timing. The auth version is correct. Code duplication makes it easy to introduce the wrong one.
- Fix approach: Export `safeCompare` from `src/lib/auth.ts` and import it in `src/proxy.ts`. Remove the duplicate.

**Large Panel Components:**
- Issue: Several panel components are monoliths exceeding 1000 lines with mixed concerns (data fetching, state management, rendering, animation).
- Files:
  - `src/components/panels/office-panel.tsx` (2380 lines)
  - `src/components/panels/agent-detail-tabs.tsx` (1794 lines)
  - `src/components/panels/task-board-panel.tsx` (1683 lines)
  - `src/components/panels/super-admin-panel.tsx` (1113 lines)
  - `src/components/panels/cron-management-panel.tsx` (993 lines)
  - `src/components/panels/agent-squad-panel-phase3.tsx` (926 lines)
- Impact: Hard to maintain, test, or modify without risk of regressions. Component rendering performance may suffer due to large re-render scope.
- Fix approach: Extract data-fetching into custom hooks, break rendering into smaller sub-components, isolate animation logic in `office-panel.tsx`.

**Monolithic Store (795 lines):**
- Issue: The entire application state lives in a single Zustand store with 60+ actions and 30+ state slices.
- Files: `src/store/index.ts`
- Impact: Every `useMissionControl()` call subscribes to the entire store. Despite using `subscribeWithSelector`, component authors must manually use selectors or face unnecessary re-renders. The `MissionControlStore` interface at 150+ fields is unwieldy.
- Fix approach: Split into domain-specific slices (e.g., `useTaskStore`, `useAgentStore`, `useChatStore`). Zustand supports this natively.

**`any` Type Usage:**
- Issue: 90 occurrences of `any` across 22 files in `src/lib/`, primarily in catch blocks (`catch (err: any)`), JSON parsing, and database query results.
- Files: Broadly across `src/lib/` -- highest in `src/lib/super-admin.ts` (12), `src/lib/websocket.ts` (9), `src/lib/cron-occurrences.ts` (8), `src/lib/scheduler.ts` (5)
- Impact: Bypasses TypeScript's type safety. Errors from catch blocks are assumed to have `.message` without guard checks.
- Fix approach: Use `unknown` for catch blocks. Use typed database result interfaces. Add `as const` assertions where applicable.

## Known Bugs

**Agent Squad Panel Phase3 Exists Alongside Phase2:**
- Symptoms: Both `agent-squad-panel.tsx` (621 lines) and `agent-squad-panel-phase3.tsx` (926 lines) exist. Unclear which is active or if phase3 fully supersedes phase2.
- Files: `src/components/panels/agent-squad-panel.tsx`, `src/components/panels/agent-squad-panel-phase3.tsx`
- Trigger: Navigation to the agent squad view may load the wrong version depending on how it is wired.
- Workaround: Check `nav-rail.tsx` or route configuration to confirm which version is active.

## Security Considerations

**Command Execution Exposure:**
- Risk: Several API routes execute system commands via `runCommand`, `runOpenClaw`, and `runClawdbot`. While inputs are validated via Zod schemas, the `src/app/api/cron/route.ts` trigger action calls `openclaw cron trigger <id>` with user-provided job IDs. The terminal endpoint (`src/app/api/local/terminal/route.ts`) opens a Terminal window at a user-specified path.
- Files: `src/lib/command.ts`, `src/app/api/spawn/route.ts`, `src/app/api/cron/route.ts`, `src/app/api/local/terminal/route.ts`, `src/app/api/local/flight-deck/route.ts`
- Current mitigation: `shell: false` in `spawn()` prevents shell injection. Terminal endpoint restricts directories to `/Users/`, `/tmp/`, `/var/folders/`. Cron trigger requires `MISSION_CONTROL_ALLOW_COMMAND_TRIGGER=1`. All endpoints require `operator` or `admin` role.
- Recommendations: The terminal path allowlist (`/Users/`, `/tmp/`, `/var/folders/`) is macOS-specific and too broad for production Linux servers. Add a configurable allowlist or disable terminal/flight-deck endpoints in non-local deployments.

**Integrations API Writes to .env File:**
- Risk: The integrations endpoint at `src/app/api/integrations/route.ts` can read and write environment variable values to the `.env` file on disk, including API keys. It also invokes `execFileSync` to call 1Password CLI (`op`).
- Files: `src/app/api/integrations/route.ts`
- Current mitigation: Requires admin role. Blocks system vars (`PATH`, `HOME`, `LD_*`, `DYLD_*`). Backs up the file before writes.
- Recommendations: Audit log all `.env` writes. Consider restricting this endpoint to local-mode deployments only. The `execFileSync` call for `op` is synchronous and blocks the event loop.

**Session Token Stored in Cookie Without Encryption:**
- Risk: Session tokens are 32-byte random hex strings stored as plaintext in the `mc-session` cookie. While HttpOnly and SameSite=Strict are set, the token is the raw database lookup key.
- Files: `src/lib/session-cookie.ts`, `src/lib/auth.ts` (line 124)
- Current mitigation: HttpOnly, Secure (in production), SameSite=Strict. 7-day expiration. Expired session cleanup on login.
- Recommendations: Consider hashing the session token before database lookup (store hash, send raw). This protects against database dump attacks revealing valid session tokens.

**CSP Allows unsafe-inline for Scripts:**
- Risk: Content-Security-Policy includes `'unsafe-inline'` for `script-src`, weakening XSS protection.
- Files: `src/next.config.js` (line 14)
- Current mitigation: No `dangerouslySetInnerHTML` usage found in the codebase. React's JSX provides baseline XSS protection.
- Recommendations: Remove `'unsafe-inline'` from script-src. Use Next.js's nonce-based CSP support to allow inline scripts from the framework while blocking injected scripts.

**CSRF Protection Gap:**
- Risk: CSRF validation in `src/proxy.ts` only checks when `Origin` header is present. Many browsers omit the Origin header on same-origin navigations. The check compares `Origin` host to `Host` header, which may not match behind certain proxy configurations.
- Files: `src/proxy.ts` (lines 91-105)
- Current mitigation: SameSite=Strict cookies prevent most CSRF attacks. API key auth does not use cookies, so is not vulnerable.
- Recommendations: Add a double-submit CSRF token for cookie-authenticated mutation requests. The existing E2E test suite includes `csrf-validation.spec.ts` which should be reviewed.

**Memory Browser File Operations:**
- Risk: The memory API allows reading, writing, creating, and deleting files within the configured memory directory. Path traversal is protected, but the API effectively gives filesystem write access.
- Files: `src/app/api/memory/route.ts`
- Current mitigation: `resolveWithin` path containment check, symlink rejection, allowed-prefix restrictions, operator/admin role requirements.
- Recommendations: The protections are solid. Ensure `MEMORY_PATH` does not point to sensitive directories. Consider adding file size limits for writes.

## Performance Bottlenecks

**Synchronous SQLite in Async API Routes:**
- Problem: All database operations use synchronous `better-sqlite3` calls within Next.js API route handlers (which are async). While better-sqlite3 is fast, a long-running query or migration blocks the entire Node.js event loop.
- Files: `src/lib/db.ts`, all `src/app/api/*/route.ts` files
- Cause: SQLite queries run synchronously on the main thread. WAL mode helps concurrent reads but writes still serialize.
- Improvement path: This is a known tradeoff of using better-sqlite3 (chosen for its simplicity and reliability). Monitor query times. For long-running operations (backup, cleanup), consider using `db.backup()` (which is async) and batching deletes.

**Memory Search Is Sequential File Scanning:**
- Problem: The memory search endpoint reads every `.md` and `.txt` file sequentially, loading each into memory for substring matching.
- Files: `src/app/api/memory/route.ts` (lines 207-285)
- Cause: No search index exists. Files are read one-by-one with `readFile`.
- Improvement path: Add a file size cap (already capped at 1MB per file). For large memory directories, consider building a simple inverted index or using SQLite FTS5.

**Event Bus Max Listeners:**
- Problem: The `ServerEventBus` has `setMaxListeners(50)`, but each SSE client connection adds a listener. Under sustained load, exceeding 50 concurrent SSE connections will trigger Node.js warnings.
- Files: `src/lib/event-bus.ts` (line 40)
- Cause: Hard-coded limit does not scale with deployment size.
- Improvement path: Increase the limit or use a different broadcast mechanism (e.g., write to a shared SQLite table and poll, or use a message queue for multi-process).

**Token Usage Stored in JSON File:**
- Problem: Token usage data is stored in a flat JSON file (`mission-control-tokens.json`) that is loaded/parsed entirely for cleanup. The scheduler reads the entire file, filters, and rewrites it.
- Files: `src/lib/scheduler.ts` (lines 116-131), `src/lib/config.ts` (tokensPath)
- Cause: Legacy data format. A `token_usage` SQLite table exists (migration 018) but the JSON file is still used for some code paths.
- Improvement path: Migrate all token usage to the SQLite `token_usage` table. Remove the JSON file code path.

## Fragile Areas

**Migration System:**
- Files: `src/lib/migrations.ts` (855 lines)
- Why fragile: The first migration (`001_init`) reads `src/lib/schema.sql` from disk using `process.cwd()`. In standalone Next.js deployments, `process.cwd()` may not resolve to the source root. The migration uses `readFileSync` with a hardcoded path.
- Safe modification: Test any migration changes against both `next dev` and `next start --standalone`. Add new migrations at the bottom of the array. Never modify existing migrations that have been applied.
- Test coverage: `src/lib/__tests__/db-helpers.test.ts` covers DB helper functions but not the full migration sequence. E2E tests exercise migrations implicitly.

**WebSocket Handshake Protocol:**
- Files: `src/lib/websocket.ts` (732 lines)
- Why fragile: The WebSocket client implements a multi-step handshake protocol (connect.challenge -> connect request -> connect response) with device identity signing, nonce handling, protocol version negotiation, and compatibility fallbacks. The `handleGatewayFrame` function has complex branching for different frame types and error conditions.
- Safe modification: Changes to the handshake must be coordinated with gateway server changes. Test with both gateway and local modes. The `useCallback` dependency arrays must be kept in sync.
- Test coverage: E2E tests in `tests/gateway-connect.spec.ts` cover the connection flow. No unit tests for the WebSocket hook internals.

**Database Initialization Side Effects:**
- Files: `src/lib/db.ts` (lines 547-559)
- Why fragile: The database initializes on module import (`if (typeof window === 'undefined') { getDatabase() }`). This triggers migrations, admin seeding, webhook listener, and scheduler initialization. Any import of any module that transitively imports `db.ts` triggers all of these side effects. Process exit handlers are registered globally.
- Safe modification: Do not import `db.ts` in client-side code. Be aware that importing `db.ts` in tests will create/modify a real database file unless `MISSION_CONTROL_DB_PATH` is overridden.
- Test coverage: Tests set `MISSION_CONTROL_DB_PATH` to `:memory:` or temp paths.

**Scheduler Tick Loop:**
- Files: `src/lib/scheduler.ts`
- Why fragile: Background scheduler runs via `setInterval(tick, 60_000)` inside the Next.js server process. If the process restarts (common in dev), the scheduler reinitializes but stale timers from the previous process are not cleaned up. The scheduler uses a module-level `Map` for task state, which is not shared across Next.js hot-reload boundaries.
- Safe modification: Use `initScheduler()` idempotency check (`if (tickInterval) return`) to prevent duplicate schedulers. The `globalThis` pattern used for `eventBus` could be applied here too.
- Test coverage: No dedicated scheduler tests. Cleanup and backup are tested only through manual trigger endpoints.

## Scaling Limits

**SQLite Single-Writer Bottleneck:**
- Current capacity: Adequate for single-team (1-20 agents) deployments with moderate write volume.
- Limit: SQLite WAL mode allows concurrent reads but serializes writes. Under heavy concurrent write load (many agents reporting heartbeats + task updates + activity logging simultaneously), write contention will increase latency.
- Scaling path: The workspace isolation migrations (021-023) prepare for multi-tenant operation. For true horizontal scaling, migrate to PostgreSQL and replace `better-sqlite3` with a connection-pooling client.

**SSE/EventBus In-Process Only:**
- Current capacity: Works for single-process deployments.
- Limit: The `ServerEventBus` uses Node.js `EventEmitter` -- events are in-process only. If Next.js runs multiple workers, SSE clients connected to different workers will not receive each other's events.
- Scaling path: Use a shared pub/sub mechanism (Redis Pub/Sub, PostgreSQL LISTEN/NOTIFY) for cross-process event distribution.

## Dependencies at Risk

**Dual React Flow Libraries:**
- Risk: Both `@xyflow/react` (^12.10.0) and `reactflow` (^11.11.4) are listed as dependencies. `reactflow` is the deprecated predecessor of `@xyflow/react`. Both bundles are shipped to the client.
- Impact: Increased bundle size. Potential version conflicts. The deprecated `reactflow` package receives no new features.
- Migration plan: Migrate all `reactflow` imports to `@xyflow/react`. Remove `reactflow` from `package.json`.
- Files: `package.json` (lines 27, 36)

**`eslint` in `dependencies` Instead of `devDependencies`:**
- Risk: `eslint` and `eslint-config-next` are listed under `dependencies` rather than `devDependencies`, causing them to be installed in production builds.
- Impact: Inflated Docker image size and `node_modules` in production. No runtime impact.
- Fix: Move `eslint` and `eslint-config-next` to `devDependencies`.
- Files: `package.json` (lines 28-29)

## Missing Critical Features

**No Database Backup Restore UI:**
- Problem: Automatic backups are created by the scheduler to `.data/backups/`, but there is no API endpoint or UI to list or restore from backups.
- Blocks: Disaster recovery requires manual SQLite file manipulation.

**No Rate-Limit Feedback to Clients:**
- Problem: Rate-limited responses return `429` with a JSON error message but no `Retry-After` header or rate limit remaining/reset headers.
- Blocks: API consumers cannot implement intelligent backoff. Agents may retry immediately and stay rate-limited.
- Files: `src/lib/rate-limit.ts`

## Test Coverage Gaps

**No Component Tests:**
- What's not tested: Zero React component tests exist. All 30+ panel components, layout components, chat components, and UI components have no test coverage.
- Files: All `src/components/**/*.tsx` files
- Risk: UI regressions go undetected until E2E tests catch them. Refactoring large components (like the 2380-line office-panel) is high-risk without component tests.
- Priority: Medium. E2E tests via Playwright provide some coverage.

**No WebSocket/SSE Tests:**
- What's not tested: The WebSocket client hook (`src/lib/websocket.ts`, 732 lines) and SSE event system (`src/lib/event-bus.ts`, `src/lib/use-server-events.ts`) have no unit or integration tests.
- Files: `src/lib/websocket.ts`, `src/lib/event-bus.ts`, `src/lib/use-server-events.ts`
- Risk: Gateway protocol changes or reconnect logic bugs could break real-time features silently.
- Priority: High. The WebSocket handshake protocol is complex and fragile.

**No Scheduler Tests:**
- What's not tested: The scheduler (`src/lib/scheduler.ts`, 375 lines) including backup, cleanup, heartbeat check, and task tick logic.
- Files: `src/lib/scheduler.ts`
- Risk: Backup/cleanup failures or missed heartbeats could go unnoticed. The tick loop's interaction with settings table is untested.
- Priority: Medium. Manual trigger endpoint allows ad-hoc verification.

**No Super-Admin / Provisioner Tests:**
- What's not tested: The super-admin provisioning system (`src/lib/super-admin.ts`, 886 lines) which generates and executes Linux system administration commands (useradd, systemd units, directory creation).
- Files: `src/lib/super-admin.ts`, `src/lib/provisioner-client.ts`
- Risk: Provisioning commands run as root on production servers. Untested command generation could create invalid or dangerous system commands.
- Priority: High. This code executes privileged system operations.

**Limited API Route Testing:**
- What's not tested: Most API routes are only tested through E2E Playwright tests. No dedicated unit tests for route handlers, meaning the test suite requires a running server.
- Files: All `src/app/api/*/route.ts` files (80+ API routes)
- Risk: E2E tests are slow and coarse-grained. Subtle API behavior (edge cases in query parsing, error handling branches) is not covered.
- Priority: Medium. The existing E2E suite (30+ spec files) provides good functional coverage.

---

*Concerns audit: 2026-03-09*
