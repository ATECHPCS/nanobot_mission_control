# External Integrations

**Analysis Date:** 2026-03-09

## APIs & External Services

**OpenClaw Gateway (Primary Integration):**
- Purpose: AI agent orchestration gateway - manages sessions, spawning, cron, logs
- Protocol: WebSocket (browser-side) with custom JSON-RPC framing (protocol v3)
- Client: `src/lib/websocket.ts` (React hook `useWebSocket`)
- Auth: Ed25519 device identity challenge-response (`src/lib/device-identity.ts`)
- Connection config:
  - `OPENCLAW_GATEWAY_HOST` (default: `127.0.0.1`)
  - `OPENCLAW_GATEWAY_PORT` (default: `18789`)
  - `NEXT_PUBLIC_GATEWAY_*` vars for browser-side
  - `NEXT_PUBLIC_GATEWAY_CLIENT_ID` (default: `openclaw-control-ui`)
- Features consumed: session management, log streaming, agent spawning, cron jobs, chat messages, token usage, agent status updates
- URL builder: `src/lib/gateway-url.ts`

**OpenClaw Config File (Server-side):**
- Purpose: Agent definitions synced from `openclaw.json` into MC database
- Client: `src/lib/agent-sync.ts` (reads `openclaw.json` on startup and via `/api/agents/sync`)
- Config path: `OPENCLAW_CONFIG_PATH` or `~/.openclaw/openclaw.json`
- Agent workspace files: soul templates, memory, logs read from filesystem

**GitHub API:**
- Purpose: Issue sync - pull GitHub issues as MC tasks, post comments, update issue state
- SDK/Client: Native `fetch` with auth wrapper (`src/lib/github.ts`)
- Auth: `GITHUB_TOKEN` env var (Bearer token)
- API base: `https://api.github.com`
- Endpoints used:
  - `GET /repos/{owner}/{repo}/issues` - Fetch issues
  - `GET /repos/{owner}/{repo}/issues/{number}` - Single issue
  - `POST /repos/{owner}/{repo}/issues/{number}/comments` - Post comment
  - `PATCH /repos/{owner}/{repo}/issues/{number}` - Update state
- Timeout: 15s
- Validation schema: `src/lib/validation.ts` (`githubSyncSchema`)
- Sync records stored in: `github_syncs` table (migration `017_github_sync`)

**GitHub Releases API:**
- Purpose: Check for Mission Control updates
- Client: Native `fetch` (`src/app/api/releases/check/route.ts`)
- Endpoint: `https://api.github.com/repos/builderz-labs/mission-control/releases/latest`
- Auth: None (public endpoint)
- Caching: ISR 1 hour via `next: { revalidate: 3600 }`

**Google OAuth:**
- Purpose: Google Sign-In for user authentication (approval workflow)
- Client: Native `fetch` to Google tokeninfo endpoint (`src/lib/google-auth.ts`)
- Endpoint: `https://oauth2.googleapis.com/tokeninfo?id_token={token}`
- Auth: `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (audience verification)
- API route: `src/app/api/auth/google/route.ts`
- Creates access request for admin approval, or auto-approves if configured
- Migration: `014_auth_google_approvals`

## Data Storage

**Database:**
- SQLite via `better-sqlite3` ^12.6.2
  - Location: `${MISSION_CONTROL_DATA_DIR}/.data/mission-control.db` (configurable via `MISSION_CONTROL_DB_PATH`)
  - Client: `src/lib/db.ts` (singleton `getDatabase()`)
  - WAL mode, foreign keys enabled, cache_size=1000
  - Migration system: `src/lib/migrations.ts` (27 migrations, `001_init` through `027_agent_api_keys`)
  - Schema: `src/lib/schema.sql` (base), extended by migrations
  - Tables: tasks, agents, comments, activities, notifications, task_subscriptions, standup_reports, quality_reviews, messages, users, user_sessions, workflow_templates, audit_log, webhooks, webhook_deliveries, workflow_pipelines, pipeline_runs, settings, alert_rules, direct_connections, github_syncs, token_usage, claude_sessions, workspaces, projects, provision_jobs, provision_events, tenants, agent_api_keys, access_requests, schema_migrations
  - Multi-workspace support via `workspace_id` column on most tables
  - Backup: SQLite `db.backup()` to `.data/backups/` (daily at 3 AM UTC)

**Token Usage File:**
- Location: `${MISSION_CONTROL_TOKENS_PATH}` (default: `.data/mission-control-tokens.json`)
- Format: JSON array of token usage records
- Cleaned by retention scheduler

**File Storage:**
- Local filesystem only
- Agent memory files: read from `OPENCLAW_MEMORY_DIR` / OpenClaw workspace dirs
- Soul templates: read from `OPENCLAW_SOUL_TEMPLATES_DIR`
- Gateway logs: read from `OPENCLAW_LOG_DIR`
- Claude session data: read from `~/.claude/` (configurable via `MC_CLAUDE_HOME`)

**Caching:**
- In-memory only:
  - Rate limiter stores (`src/lib/rate-limit.ts`, `Map<string, RateLimitEntry>`)
  - Provider subscription detection cache (30s TTL, `src/lib/provider-subscriptions.ts`)
  - Client-side: Zustand store (`src/store/index.ts`), localStorage for UI preferences

## Authentication & Identity

**Auth Provider: Multi-strategy custom implementation**

1. **Session Cookie Auth (Primary):**
   - Implementation: `src/lib/auth.ts`
   - Cookie: `mc-session` (7-day expiry, HttpOnly)
   - Cookie config: `MC_COOKIE_SECURE`, `MC_COOKIE_SAMESITE`
   - Session cookie: `src/lib/session-cookie.ts`
   - Password hashing: scrypt (N=16384, salt=16 bytes, key=32 bytes) (`src/lib/password.ts`)
   - Roles: `admin` > `operator` > `viewer`
   - Admin user seeded from `AUTH_USER`/`AUTH_PASS` env on first run

2. **System API Key Auth:**
   - Header: `X-API-Key` or `Authorization: Bearer {key}`
   - Config: `API_KEY` env var
   - Constant-time comparison via `crypto.timingSafeEqual`
   - Returns synthetic admin user

3. **Agent API Keys:**
   - Prefix: `mca_` (detected in proxy middleware)
   - Stored: `agent_api_keys` table (SHA-256 hash)
   - Scoped: per-agent with configurable scopes/expiry
   - Route-level validation against DB

4. **Google OAuth:**
   - ID token verification via Google tokeninfo endpoint
   - Approval workflow: creates `access_requests` record for admin review
   - Config: `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

**Middleware:**
- `src/proxy.ts` - Network ACL + CSRF origin check + auth gating
  - Host allowlist: `MC_ALLOWED_HOSTS` (default-deny in production)
  - CSRF: Origin header validation on mutating requests
  - Public paths: `/login`, `/api/auth/*`, `/api/docs`, `/docs`
  - API paths: require session cookie, system API key, or agent API key candidate

**Device Identity (Browser):**
- Ed25519 key pair for gateway WebSocket handshake (`src/lib/device-identity.ts`)
- Stored in localStorage (`mc-device-id`, `mc-device-pubkey`, `mc-device-privkey`)
- Device token cached after successful gateway connect

## Real-Time Communication

**Server-Sent Events (SSE):**
- Endpoint: `GET /api/events` (`src/app/api/events/route.ts`)
- Event bus: `src/lib/event-bus.ts` (singleton `ServerEventBus` extending `EventEmitter`)
- Event types: task.*, chat.*, notification.*, activity.*, agent.*, audit.security, connection.*, github.synced
- Heartbeat: every 30s
- Survives HMR via `globalThis.__eventBus`

**WebSocket (to OpenClaw Gateway):**
- Client: `src/lib/websocket.ts` (React hook)
- Protocol: JSON-RPC framing (v3)
- Handshake: connect challenge -> device identity signing -> connect response
- Heartbeat: ping/pong every 30s, max 3 missed pongs before reconnect
- Auto-reconnect: exponential backoff (up to 10 attempts, max 30s delay)
- Non-retryable errors detected and surfaced to user

## Webhooks (Outgoing)

**Implementation:** `src/lib/webhooks.ts`
- Triggered by: event bus events (activity, notification, agent status, audit security)
- Delivery: HTTP POST with JSON payload
- Signing: HMAC-SHA256 (`X-MC-Signature` header) when secret configured
- Retry: up to 5 attempts with exponential backoff (30s, 5m, 30m, 2h, 8h) + jitter
- Circuit breaker: auto-disable webhook after exhausting all retries
- Delivery logging: `webhook_deliveries` table (keep last 200 per webhook)
- Retry processing: scheduler runs every 60s
- User-Agent: `MissionControl-Webhook/1.0`
- Timeout: 10s per delivery

**Webhook Event Types:**
- `activity.*` (task_created, task_updated, etc.)
- `notification.*`
- `agent.status_change`, `agent.error`
- `security.*` (login_failed, user_created, etc.)

## Monitoring & Observability

**Logging:**
- Server: Pino ^10.3.1 (`src/lib/logger.ts`)
  - JSON output in production, pretty-print in development
  - Level: `LOG_LEVEL` env var (default: `info`)
- Client: Custom logger (`src/lib/client-logger.ts`)

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Audit Log:**
- `audit_log` table (migration `007_audit_log`)
- Tracks: login failures, user CRUD, password changes, auto-backup, auto-cleanup, heartbeat checks
- Logged via `logAuditEvent()` in `src/lib/db.ts`
- Retention: `MC_RETAIN_AUDIT_DAYS` (default: 365 days)

**Health Check:**
- Docker HEALTHCHECK: `curl -f http://localhost:${PORT}/login`
- No dedicated `/health` endpoint

## Scheduled Jobs

**Built-in Scheduler:** `src/lib/scheduler.ts`
- Tick interval: 60s
- Jobs:
  - `auto_backup` - Daily at ~3 AM UTC (SQLite backup)
  - `auto_cleanup` - Daily at ~4 AM UTC (retention-based data pruning)
  - `agent_heartbeat` - Every 5 minutes (mark stale agents offline)
  - `webhook_retry` - Every 60s (process failed webhook deliveries)
  - `claude_session_scan` - Every 60s (sync Claude Code sessions from `~/.claude`)
- Agent sync from `openclaw.json` on startup
- Each job can be enabled/disabled via `settings` table

## Provisioner (Super Admin)

**Purpose:** Multi-tenant provisioning via Unix socket daemon
- Client: `src/lib/provisioner-client.ts`
- Daemon: `ops/mc-provisioner-daemon.js`
- Socket: `MC_PROVISIONER_SOCKET` (default: `/run/mc-provisioner.sock`)
- Auth: `MC_PROVISIONER_TOKEN` env var
- Protocol: JSON over Unix socket (newline-delimited)
- Tables: `tenants`, `provision_jobs`, `provision_events`
- API routes: `src/app/api/super/tenants/`, `src/app/api/super/provision-jobs/`

## CI/CD & Deployment

**Hosting:**
- Docker (standalone Next.js, `docker-compose.yml`)
- Self-hosted (no cloud platform dependency)

**CI Pipeline:**
- Not detected in repo (no `.github/workflows/`, no CI config files)
- Quality gate script: `pnpm quality:gate` (lint + typecheck + test + build + e2e)

## Environment Configuration

**Required env vars (minimum for operation):**
- `AUTH_PASS` or `AUTH_PASS_B64` - Admin password (blocks seeding if not set or insecure)
- `API_KEY` - For headless/API access

**Optional but commonly needed:**
- `OPENCLAW_HOME` or `OPENCLAW_STATE_DIR` - For OpenClaw integration features
- `OPENCLAW_GATEWAY_HOST` / `OPENCLAW_GATEWAY_PORT` - For gateway WebSocket
- `GITHUB_TOKEN` - For GitHub issue sync
- `GOOGLE_CLIENT_ID` - For Google Sign-In
- `MC_PROVISIONER_TOKEN` / `MC_PROVISIONER_SOCKET` - For super admin provisioning

**Secrets location:**
- `.env` file (gitignored, optional)
- `.env.example` documents all vars with safe defaults
- Docker env_file with `required: false`

## Rate Limiting

**Implementation:** `src/lib/rate-limit.ts`
- IP-based, in-memory `Map` per limiter instance
- Trusted proxy support: `MC_TRUSTED_PROXIES` (XFF parsing)
- Limiters:
  - `loginLimiter` - 5 req/min (critical, cannot be disabled)
  - `mutationLimiter` - 60 req/min
  - `readLimiter` - 120 req/min
  - `heavyLimiter` - 10 req/min
- Bypass: `MC_DISABLE_RATE_LIMIT=1` (non-critical limiters only, for E2E tests)
- Cleanup: every 60s automatic purge of expired entries

## OpenAPI Documentation

**Spec:** `openapi.json` (OpenAPI 3.1.0, version 1.3.0)
- UI: Scalar API Reference via `@scalar/api-reference-react` at `/docs`
- Route: `src/app/api/docs/route.ts`

---

*Integration audit: 2026-03-09*
