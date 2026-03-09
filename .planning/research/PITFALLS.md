# Domain Pitfalls

**Domain:** AI agent operations dashboard (brownfield fork of builderz-labs/mission-control)
**Researched:** 2026-03-09

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Fork Drift — Stripping Too Little from the OpenClaw Codebase

**What goes wrong:** The forked MC codebase has OpenClaw protocol concepts deeply embedded across 46+ source files: `openclaw.json` config parsing, Ed25519 device identity handshake, OpenClaw gateway WebSocket protocol (v3 challenge-response), OpenClaw CLI invocations (`openclaw gateway sessions_send`), and `OPENCLAW_*` environment variables threaded through `config.ts`. Teams commonly leave "harmless" dead code in place during a fork, thinking they'll clean it later. They never do. The dead code becomes a confusion multiplier: new contributors don't know which code paths are live, TypeScript types reference phantom concepts, and bugs hide behind interfaces that look functional but connect to nothing.

**Why it happens:** The existing MC codebase has 186 commits, 148 E2E tests, and 28 feature panels. The interconnections are non-obvious. `agent-sync.ts` reads `openclaw.json` and calls `parseJsonRelaxed`. `websocket.ts` implements a full OpenClaw gateway protocol v3 handshake with Ed25519 signing. `device-identity.ts` generates Ed25519 keypairs for a protocol that nanobot agents don't use. The temptation is to "just get it working" and leave dead code paths guarded by feature flags or unreachable conditionals.

**Consequences:** Every future developer (including your future self) wastes time understanding code that does nothing. TypeScript compilation succeeds but semantic understanding fails. Bugs in nanobot-native code get masked by OpenClaw code paths that silently swallow errors. The test suite tests phantom features, giving false confidence.

**Prevention:**
1. Create a deletion manifest before writing any new code. Audit every file in `src/lib/` and categorize: KEEP (auth, db, event-bus, paths, webhooks), REWRITE (agent-sync, config, websocket), DELETE (device-identity, gateway-url, provisioner-client, codex-sessions, google-auth).
2. Delete `device-identity.ts`, `gateway-url.ts`, `provisioner-client.ts` entirely in the first commit. These implement OpenClaw-specific protocols with zero nanobot relevance.
3. Rewrite `config.ts` to remove all `OPENCLAW_*` environment variables and replace with nanobot paths (`NANOBOT_WORKSPACE_DIR`, `NANOBOT_AGENT_HOMES`). Do this before building any new feature.
4. Rewrite `agent-sync.ts` to scan `~/.nanobot/workspace/agents/` filesystem instead of parsing `openclaw.json`.
5. Replace the entire WebSocket client (`websocket.ts`) with simple HTTP polling or SSE against nanobot gateway HTTP endpoints. Nanobot agents expose REST endpoints, not WebSocket gateway protocols.

**Detection:** If any file still imports from `device-identity`, `gateway-url`, or references `OPENCLAW_`, the strip is incomplete. Run `grep -r "openclaw\|OpenClaw\|OPENCLAW" src/` after stripping — zero results is the target.

**Phase:** Phase 1 (Foundation). Must be the first thing done. Every subsequent feature builds on top of the stripped/rewired foundation.

---

### Pitfall 2: Fork Drift — Stripping Too Much and Breaking the Proven Foundation

**What goes wrong:** In the eagerness to remove OpenClaw, developers accidentally gut the battle-tested infrastructure that makes the dashboard valuable: the auth system (proxy.ts middleware + session cookies + API keys), RBAC roles, the SSE event bus, the SQLite migration system, the webhook delivery pipeline, or the Kanban board. These systems have been refined over 186 commits and 148 E2E tests. Rebuilding them from scratch introduces bugs that the upstream already solved.

**Why it happens:** The codebase has tight coupling between OpenClaw-specific and infrastructure code. `db.ts` initializes webhooks and the scheduler alongside schema migrations. `config.ts` mixes OpenClaw paths with data directory configuration. `agent-sync.ts` has database transaction patterns that are reusable but wrapped in OpenClaw-specific mapping logic. A developer doing a quick `git rm` based on filenames will break dependency chains.

**Consequences:** Auth bypass vulnerabilities. Lost audit logging. Broken task board. Missing webhook delivery. Weeks spent re-implementing what already worked, introducing regressions in security-critical paths (the existing `proxy.ts` has constant-time string comparison, CSRF origin validation, host allowlisting — all easy to lose).

**Prevention:**
1. Map dependencies before deleting. For each file marked DELETE, check what imports it. For each file marked REWRITE, extract the infrastructure patterns first.
2. Keep the entire auth chain intact: `proxy.ts` (middleware), `auth.ts`, `session-cookie.ts`, `password.ts`, `rate-limit.ts`. These have zero OpenClaw coupling.
3. Keep the event bus (`event-bus.ts`) — it's already clean infrastructure. Just add nanobot-specific event types.
4. Keep the database layer (`db.ts`, `migrations.ts`, `schema.sql`) and add nanobot tables via new migrations, don't modify existing ones.
5. Keep webhooks (`webhooks.ts`) — the delivery/retry system is protocol-agnostic.
6. Run the existing E2E test suite after every stripping commit. If auth tests break, you stripped too deep.

**Detection:** After each stripping commit, run `pnpm build && pnpm test`. Build failures in non-OpenClaw modules mean you broke a dependency chain. Audit the import graph of deleted files.

**Phase:** Phase 1 (Foundation). Concurrent with Pitfall 1 — strip and verify in alternating commits.

---

### Pitfall 3: Zombie and Orphan Agent Processes from Node.js Process Management

**What goes wrong:** The dashboard needs to start/stop/restart nanobot agents by spawning shell scripts (`launch-stefany.sh`, `launch-cody.sh`). Node.js `child_process.spawn()` does not reliably kill process trees. When the dashboard restarts, crashes, or the user clicks "stop agent," the child process dies but its grandchildren (the actual Claude agent process, the gateway HTTP server) survive as orphans. Over time, orphaned gateway processes accumulate, binding ports that new instances can't claim, and zombie processes consume PID table entries.

**Why it happens:** Node.js `child.kill()` sends SIGTERM to the direct child process only. Launch scripts typically `exec` or background the actual agent process, creating a process tree. `child.kill()` does not propagate to the process group by default. The `killed` property on the ChildProcess object is unreliable (GitHub issue nodejs/node#27490). On macOS (the target platform), there's no `/proc` filesystem to enumerate child PIDs.

**Consequences:** Port conflicts prevent agent restart ("EADDRINUSE on port 18793"). Multiple instances of the same agent run simultaneously, corrupting shared state. Memory leaks from accumulated zombie processes. Dashboard shows "stopped" but the agent is still running (and responding to messages).

**Prevention:**
1. Spawn with `detached: true` and use `process.kill(-child.pid, 'SIGTERM')` to kill the entire process group (negative PID sends signal to the group on Unix).
2. Record the PID file for each agent in a known location (`~/.nanobot/workspace/agents/{name}/gateway.pid`). On "stop," read the PID file and kill that PID directly, then clean up the file.
3. Before starting an agent, check if the gateway port is already bound (`net.createServer().listen(port)` — if it fails with EADDRINUSE, the previous instance is still alive). Kill it first.
4. Register a `process.on('exit')` handler in the dashboard that kills all managed child processes.
5. Implement a startup sweep: on dashboard boot, check all known agent PID files and reconcile against running processes. Kill orphans.
6. Never use `child_process.exec()` for long-running processes — it buffers all stdout/stderr into memory. Use `spawn()` with stream piping.

**Detection:** After stopping an agent from the dashboard, run `lsof -i :18793` (or the agent's port). If anything is listening, the kill failed. Check `ps aux | grep nanobot` for orphans after dashboard restart.

**Phase:** Phase 2 (Agent Lifecycle). This is the core of the lifecycle management feature and must be solved before shipping start/stop controls.

---

### Pitfall 4: Synchronous Filesystem Reads Blocking the Event Loop

**What goes wrong:** The dashboard reads agent state from the filesystem: JSONL session files (potentially megabytes), MEMORY.md, SOUL.md, IDENTITY.md, agent config JSON, and directory listings for agent discovery. Using `readFileSync` (which the existing codebase already does in `agent-sync.ts`, `claude-sessions.ts`) blocks the Node.js event loop. When multiple agents have large session files, a single "view sessions" request can block the server for hundreds of milliseconds, causing SSE connections to stall and the dashboard to appear frozen.

**Why it happens:** `readFileSync` is convenient and avoids callback complexity. The existing codebase uses it extensively (`readFileSync` appears in `agent-sync.ts` lines 149, 187). For small OpenClaw config files this was fine. But nanobot JSONL session files grow continuously and can reach tens of megabytes for long-running agents. Reading a 20MB JSONL file synchronously blocks the event loop for 50-200ms.

**Consequences:** Dashboard becomes sluggish as agents accumulate session history. SSE connections time out during large file reads. Multiple concurrent users amplify the problem (each user's request blocks the single thread). "Session viewer" feature becomes unusable for active agents.

**Prevention:**
1. Use `fs.promises.readFile` (async) for all agent state reads. Never use `readFileSync` in API routes or server actions.
2. For JSONL session files, use streaming reads with `readline.createInterface()` on a `createReadStream()`. Parse line by line, never load the entire file into memory.
3. Implement pagination for session viewing: read only the last N entries from a JSONL file (seek to end, scan backward for newlines).
4. Cache agent metadata (name, status, config) in SQLite on a poll interval (every 30s). Serve dashboard requests from the cache, not from live filesystem reads.
5. Use `fs.watch` or `chokidar` for change detection, but restrict watch scope to specific files (agent.json, MEMORY.md), not entire directory trees. Chokidar v5 is ESM-only and requires Node 20+, which matches the project's engine requirement.

**Detection:** Add request timing middleware. Any API route taking >100ms is a red flag. Profile with `--inspect` and look for synchronous filesystem calls in the flame chart.

**Phase:** Phase 2-3 (Agent monitoring, Session viewer). Design the file access patterns correctly from the start.

---

### Pitfall 5: Cloudflare Tunnel Exposing Dashboard Without Proper Authentication Layering

**What goes wrong:** A Cloudflare Tunnel makes the dashboard accessible from the internet. The existing auth system (session cookies + API keys) was designed for localhost access. When exposed via tunnel, the dashboard becomes a remote control for local agent processes with filesystem read/write access. A stolen session cookie or brute-forced password gives an attacker the ability to: read all agent memory files, inject tasks, start/stop agents, and potentially execute arbitrary commands via agent dispatch.

**Why it happens:** Cloudflare Tunnels are "zero config" — they just work. The ease of setup masks the security implications. The existing `proxy.ts` middleware has host allowlisting (`MC_ALLOWED_HOSTS`) but it's only enforced in production mode. The API key authentication uses a single shared key (`API_KEY` env var) with no rate limiting on the key itself (only session auth is rate-limited). Agent API keys (`mca_` prefix) are passed through the proxy to route handlers without validation at the middleware level.

**Consequences:** Remote code execution via agent task dispatch. Data exfiltration of agent memory and conversation history. Denial of service by repeatedly stopping agents. The Cloudflare Tunnel token itself, if compromised, allows anyone to run the tunnel and access the dashboard.

**Prevention:**
1. Layer Cloudflare Access (Zero Trust) in front of the tunnel. Require email-based authentication (one-time PIN or IdP) before the request even reaches the dashboard. This is free for up to 50 users.
2. Enable `MC_ALLOWED_HOSTS` in production with the specific Cloudflare Tunnel hostname.
3. Replace the single shared `API_KEY` with per-user API keys stored in SQLite (the `mca_` prefix system already exists but needs enforcement).
4. Add rate limiting to all authentication endpoints, not just session login.
5. Audit all API routes that perform filesystem writes or process management — these need explicit RBAC checks (admin role only for start/stop/restart, operator for task dispatch, viewer for read-only).
6. Store the Cloudflare Tunnel token in a secrets manager or at minimum restrict file permissions (`chmod 600`). Never commit it to the repo.
7. Add an audit log entry for every agent lifecycle action (start/stop/restart) and every memory file write, viewable from the dashboard.

**Detection:** Run the dashboard through a security scanner (e.g., `nikto`, `OWASP ZAP`) via the tunnel URL. Test that unauthenticated requests to `/api/agents` return 401. Test that viewer-role users cannot access `/api/agents/{id}/wake`.

**Phase:** Phase 4 (Remote Access). But auth hardening should begin in Phase 1 — the Cloudflare Access layer must be documented as a prerequisite for tunnel deployment.

---

### Pitfall 6: SSE Connection Exhaustion and Stale Connections

**What goes wrong:** The existing codebase uses Server-Sent Events (SSE) via the `event-bus.ts` singleton for real-time updates. Each browser tab opens a persistent SSE connection. HTTP/1.1 browsers are limited to 6 concurrent connections per domain. With 3 tabs open (dashboard, kanban, session viewer), half the browser's connection budget is consumed by SSE. Additional API requests queue behind the SSE connections, making the dashboard feel slow. Stale connections from crashed tabs are not cleaned up, leaking memory in the EventEmitter.

**Why it happens:** The event bus sets `maxListeners` to 50 but doesn't track or clean up disconnected listeners. When a browser tab crashes (not closed gracefully), the SSE connection stays open on the server until a TCP timeout (potentially minutes). The `EventEmitter` accumulates listeners. The existing codebase uses `globalThis` to survive HMR, which means stale listeners from development reloads accumulate too.

**Consequences:** Browser connection pool exhaustion — the dashboard stops loading new data. Server memory leak from accumulated EventEmitter listeners. In extreme cases, the Node.js process runs out of memory from buffered SSE data for dead connections.

**Prevention:**
1. Implement connection heartbeat in the SSE endpoint: send a comment line (`: heartbeat\n\n`) every 30 seconds. Detect write failures and clean up the listener.
2. Track active SSE connections with a `Set<WritableStream>`. On `close` event, remove from the set and remove the EventEmitter listener.
3. Use a single SSE connection per browser session (share via `SharedWorker` or `BroadcastChannel`), not per tab.
4. Set `maxListeners` based on expected concurrent connections (not a magic number like 50). Log a warning if the limit is approached.
5. Add a `/api/health` endpoint that reports the number of active SSE connections for monitoring.
6. If deploying behind Cloudflare Tunnel, ensure the tunnel configuration doesn't buffer SSE responses (Cloudflare generally passes through streaming responses, but verify with `content-type: text/event-stream` and `cache-control: no-cache`).

**Detection:** Open 7+ tabs to the dashboard. If the 7th tab fails to load, you've hit the HTTP/1.1 connection limit. Check `eventBus.listenerCount('server-event')` — it should match the number of open tabs, not grow unbounded.

**Phase:** Phase 2-3 (Real-time monitoring). The event bus infrastructure is inherited from the fork, but the connection management needs hardening before adding more SSE consumers.

## Moderate Pitfalls

### Pitfall 7: better-sqlite3 WAL Mode and Concurrent Access Conflicts

**What goes wrong:** The dashboard uses better-sqlite3 in WAL mode, which allows concurrent reads but only single-writer access. If the dashboard process and a background job (scheduler, webhook delivery) both try to write simultaneously, one gets `SQLITE_BUSY`. The existing codebase doesn't handle this error in all write paths. Additionally, better-sqlite3 is a native addon that requires compilation — it won't work in Edge Runtime or serverless environments if the project is ever deployed beyond localhost.

**Prevention:**
1. Wrap all database writes in a retry loop with exponential backoff for `SQLITE_BUSY` errors.
2. Set `PRAGMA busy_timeout = 5000` to let SQLite automatically retry for 5 seconds before throwing.
3. Keep better-sqlite3 for the self-hosted use case (it's fast and correct). Don't try to make it work in serverless — the project is designed for local/self-hosted deployment.
4. Use database transactions (the existing `db.transaction()` pattern in `agent-sync.ts`) for multi-statement writes.

**Phase:** Phase 1 (Foundation). Add `busy_timeout` pragma alongside the existing WAL mode setup in `db.ts`.

### Pitfall 8: JSONL Session File Corruption from Concurrent Reads/Writes

**What goes wrong:** Nanobot agents write to JSONL session files continuously while the dashboard reads them for the session viewer. If the dashboard reads a file at the exact moment an agent is writing a line, it can get a partial JSON line at the end of the file. `JSON.parse()` on a truncated line throws an error that, if not caught, crashes the session viewer.

**Prevention:**
1. Always wrap the last line of JSONL parsing in a try/catch. If the last line fails to parse, discard it (it's being written).
2. Read JSONL files with `O_RDONLY` flag explicitly — never open for read-write.
3. Consider using file locking (`flock`) for writes if the dashboard ever needs to write to agent JSONL files (it shouldn't, but if task dispatch results are appended).
4. Parse JSONL files from the end backward for "latest N entries" views — this avoids reading potentially corrupted data at the write cursor.

**Phase:** Phase 3 (Session Viewer). Must be handled before the session viewer ships.

### Pitfall 9: Filesystem Watcher Resource Exhaustion

**What goes wrong:** Using `fs.watch` or `chokidar` to monitor agent directories for state changes (new sessions, memory updates, process status) seems ideal for real-time updates. But watching `~/.nanobot/workspace/agents/` recursively, plus each agent's HOME directory, plus `~/.claude/projects/` for Claude session files, can easily exceed the OS file descriptor limit. macOS has a default `kern.maxfilesperproc` of 10,240, and recursive watching creates one descriptor per file/directory.

**Prevention:**
1. Watch only specific files, not entire directory trees. Watch `agent.json`, `MEMORY.md`, and `gateway.pid` per agent — not every file in the agent's workspace.
2. Use polling (`fs.stat` on a 30-second interval) for directories that change infrequently (agent discovery). Reserve `fs.watch` for files that need sub-second update detection (gateway PID file for health monitoring).
3. If using chokidar, set `depth: 0` for directory watches and use explicit file paths for file watches. Never use `depth: Infinity` on home directories.
4. Implement a watcher budget: track the number of active watchers and refuse to add more beyond a configurable limit (default: 100).

**Phase:** Phase 2 (Agent Monitoring). Design the watching strategy before implementing it.

### Pitfall 10: E2E Test Suite Rot After Fork Modifications

**What goes wrong:** The upstream MC has 148 E2E tests built around OpenClaw flows: gateway connection, session management via WebSocket protocol, OpenClaw agent sync, device identity handshake. After stripping OpenClaw code, these tests will fail. The temptation is to delete all failing tests. But some of these tests exercise infrastructure that's being kept (auth, RBAC, kanban, webhooks, activity feed). Deleting them creates a coverage gap that lets regressions in.

**Prevention:**
1. Before stripping code, run the full E2E suite and record which tests pass. Categorize tests: KEEP (auth, kanban, webhook, RBAC), REWRITE (agent sync, gateway), DELETE (device identity, OpenClaw-specific protocol).
2. For KEEP tests, verify they still pass after each stripping commit. If they break, fix them immediately — don't defer.
3. For REWRITE tests, write nanobot-equivalent tests before deleting the OpenClaw versions. The test intent (e.g., "agent sync discovers new agents") stays the same, only the implementation changes.
4. Set a quality gate: `pnpm quality:gate` (lint + typecheck + test + build + E2E) must pass after every stripping PR. The existing `quality-gate.yml` GitHub Action enforces this.
5. Add new E2E tests for nanobot-specific features (filesystem agent discovery, HTTP gateway health check, process lifecycle) as they're built.

**Phase:** Phase 1 (Foundation). Test categorization happens before the first code deletion.

### Pitfall 11: Nanobot Gateway HTTP API Compatibility Assumptions

**What goes wrong:** The dashboard assumes nanobot agents expose a consistent HTTP API on their gateway ports. But each agent's gateway is an independent process — there's no shared API specification. If Stefany's gateway is updated while Cody's is not, the dashboard could work for one agent and break for another. API version mismatches cause silent failures: the dashboard shows "healthy" based on a successful TCP connection but the agent is actually in an error state because the health endpoint changed.

**Prevention:**
1. Define a minimal health check contract that all nanobot gateways must implement: `GET /health` returns `{"status": "ok", "agent": "{name}", "version": "{ver}"}`. Validate the response schema, not just the HTTP status code.
2. Implement graceful degradation: if an agent's gateway doesn't respond to a known endpoint, mark it as "unknown" (not "healthy" or "dead"). Show the raw response to the operator.
3. Version the dashboard's expected gateway API. If an agent returns an unexpected schema, surface a warning: "Agent X gateway API mismatch — expected v1, got unknown."
4. Do not assume gateway availability means agent health. The gateway HTTP server might be running while the Claude agent process has crashed. Check both the gateway port AND the agent's PID file.

**Phase:** Phase 2 (Agent Monitoring). Must be designed into the health check system from the start.

## Minor Pitfalls

### Pitfall 12: Hardcoded Port Numbers Limiting Agent Scalability

**What goes wrong:** Agent gateway ports (18793 for Stefany, 18792 for Cody) are hardcoded in launch scripts and referenced in the dashboard. Adding a third agent requires manually assigning a unique port and updating configuration in multiple places. This doesn't scale and creates port conflict risks.

**Prevention:**
1. Store each agent's gateway port in its agent config (`~/.nanobot/workspace/agents/{name}/agent.json`) and read it dynamically.
2. Implement auto-port assignment: scan a port range (18790-18890), find the first available port, write it to the agent's config on startup.
3. Never hardcode port numbers in the dashboard source — always read from agent config or the running process.

**Phase:** Phase 2 (Agent Registry). Design the agent discovery system to read ports from config, not constants.

### Pitfall 13: Memory File Editor Creating Data Races with Running Agents

**What goes wrong:** The dashboard allows editing agent memory files (MEMORY.md, SOUL.md). If an agent is actively running and using its memory, the dashboard write can overwrite changes the agent is about to make, or the agent can overwrite dashboard edits. Markdown files don't have built-in locking or merge semantics.

**Prevention:**
1. Show a warning when editing memory of a running agent: "This agent is currently active. Your changes may be overwritten by the agent's next memory update."
2. Implement optimistic concurrency: read the file's `mtime` before editing, check `mtime` again before writing, reject the write if the file changed.
3. Keep a backup of the pre-edit version in a `.bak` file or in the dashboard's SQLite database.
4. Consider making memory editing available only when the agent is stopped, at least for v1.

**Phase:** Phase 3 (Memory Editor). This is a UX problem as much as a technical one.

### Pitfall 14: Dashboard Process Crashes Leaving Agents in Unmonitored State

**What goes wrong:** If the dashboard crashes or is restarted, agents continue running but their status in the dashboard is stale (shows "last seen: 5 minutes ago" forever). The dashboard has no mechanism to recover the state of running agents after a restart.

**Prevention:**
1. On startup, reconcile agent state: scan PID files, check port bindings, and update SQLite status records.
2. Design agent monitoring to be pull-based (poll agent health endpoints) not push-based (wait for agents to report in). This way, a dashboard restart automatically recovers state on the next poll cycle.
3. Store the "last known state" in SQLite so the dashboard can display it immediately on restart while the first health poll completes.

**Phase:** Phase 2 (Agent Monitoring). Build the reconciliation logic into the startup sequence.

### Pitfall 15: Upstream Fork License and Attribution Violations

**What goes wrong:** The forked MC codebase is MIT licensed by Builderz Labs. MIT requires preserving the copyright notice and license text. If the fork removes the LICENSE file, strips the copyright from file headers, or changes the license without upstream permission, it creates legal risk.

**Prevention:**
1. Keep the `LICENSE` file from the original repo intact.
2. Add a notice in README.md: "Forked from builderz-labs/mission-control (MIT License)."
3. Don't change the license. MIT is permissive and allows this exact use case.
4. If publishing the fork publicly, ensure the original copyright notice is preserved alongside any new copyright.

**Phase:** Phase 1 (Foundation). Address in the first commit alongside the fork setup.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Foundation (Fork Strip) | Stripping too much breaks auth/RBAC (Pitfall 2) | Run E2E after every deletion commit |
| Phase 1: Foundation (Fork Strip) | Stripping too little leaves OpenClaw ghosts (Pitfall 1) | grep audit for "openclaw" after stripping |
| Phase 1: Foundation (Fork Strip) | License violation (Pitfall 15) | Keep LICENSE, add attribution |
| Phase 2: Agent Monitoring | Zombie processes from lifecycle control (Pitfall 3) | Process group kills, PID files, startup sweep |
| Phase 2: Agent Monitoring | Filesystem watcher exhaustion (Pitfall 9) | Watch specific files, not trees |
| Phase 2: Agent Monitoring | Gateway API version mismatch (Pitfall 11) | Schema validation, graceful degradation |
| Phase 2: Agent Monitoring | Sync filesystem reads blocking event loop (Pitfall 4) | Async reads, streaming JSONL, SQLite cache |
| Phase 3: Session/Memory Viewer | JSONL corruption from concurrent access (Pitfall 8) | Try/catch last line, read-only mode |
| Phase 3: Memory Editor | Data races with running agents (Pitfall 13) | Optimistic concurrency, mtime checks |
| Phase 3: Real-time Updates | SSE connection exhaustion (Pitfall 6) | Heartbeat, cleanup, SharedWorker |
| Phase 4: Remote Access | Tunnel without auth layer (Pitfall 5) | Cloudflare Access required before tunnel |
| Phase 4: Remote Access | SQLite busy errors under load (Pitfall 7) | busy_timeout pragma, write retry loops |
| All Phases | E2E test rot (Pitfall 10) | Categorize tests before deleting any |

## Sources

- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) - Process spawning, kill semantics, detached mode
- [nodejs/node#40438 - Kill all descendant processes](https://github.com/nodejs/node/issues/40438) - Process tree management limitations
- [nodejs/node#27490 - childProcess.killed inconsistency](https://github.com/nodejs/node/issues/27490) - Kill status reliability
- [nodejs/help#1389 - Correct way to kill child process](https://github.com/nodejs/help/issues/1389) - Community guidance on process cleanup
- [nodejs/help#1790 - Child not killed on parent SIGKILL](https://github.com/nodejs/help/issues/1790) - Orphan process creation
- [Killing process families with Node](https://medium.com/@almenon214/killing-processes-with-node-772ffdd19aad) - Process group kill patterns
- [5 Tips for Cleaning Orphaned Node.js Processes](https://medium.com/@arunangshudas/5-tips-for-cleaning-orphaned-node-js-processes-196ceaa6d85e) - Orphan cleanup strategies
- [chokidar GitHub - paulmillr/chokidar](https://github.com/paulmillr/chokidar) - File watcher resource usage, v5 ESM-only change
- [Next.js SSE Discussion #48427](https://github.com/vercel/next.js/discussions/48427) - SSE compatibility issues in Next.js API routes
- [SSE production readiness concerns](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie) - Connection management, proxy buffering, production failure modes
- [Building Production-Ready SSE in Next.js](https://xiouyang.medium.com/building-production-ready-sse-in-next-js-a-complete-guide-18450fb74b7a) - SSE connection limits, heartbeat patterns
- [Cloudflare Tunnel abuse in 2025](https://thecodebeast.com/cloudflare-tunnel-abuse-in-2025-more-common-than-you-think/) - Tunnel token security, attacker exploitation
- [Cloudflare Tunnel misuse patterns](https://www.xda-developers.com/cloudflare-tunnels-are-powerful-but-you-should-never-use-them-for-these-things/) - Services that should not be exposed via tunnels
- [Cloudflare Access documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/) - Zero Trust application protection layer
- [Fork drift in open source adoption](https://preset.io/blog/stop-forking-around-the-hidden-dangers-of-fork-drift-in-open-source-adoption/) - Long-term fork maintenance risks
- [How to fork an open-source project](https://www.heavybit.com/library/article/how-to-fork-an-open-source-project) - Fork governance and sustainability
- [Securing open source forks](https://patchstack.com/articles/securing-open-source-forks/) - Security patch propagation in forks
- [stream-json npm](https://www.npmjs.com/package/stream-json) - Streaming JSON/JSONL parsing for large files
