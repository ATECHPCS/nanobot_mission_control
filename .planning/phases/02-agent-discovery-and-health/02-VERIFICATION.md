---
phase: 02-agent-discovery-and-health
verified: 2026-03-09T17:12:00Z
status: gaps_found
score: 34/35 must-haves verified
gaps:
  - truth: "Server can detect new agent directories appearing between scans without restart"
    status: partial
    reason: "AREG-04 test fails due to discoverRootAgent() regression -- root agent appears in mock results, test expects 1 agent but gets 2"
    artifacts:
      - path: "src/lib/__tests__/agent-discovery.test.ts"
        issue: "Test 'detects new agent when directory is added between calls (AREG-04)' fails: expected length 1 but got 2 because discoverRootAgent() was added in Plan 03 without updating the test mock to exclude the root config path"
    missing:
      - "Update AREG-04 test to mock existsSync for root config path (~/.nanobot/config.json) to return false, isolating the sub-agent discovery test"
---

# Phase 2: Agent Discovery and Health Verification Report

**Phase Goal:** Build the agent discovery scanning, health monitoring backend, agent card grid UI, and agent detail slide-out panel with real-time updates.
**Verified:** 2026-03-09T17:12:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

#### Plan 01: Backend

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server can scan ~/.nanobot/workspace/agents/ and return a list of discovered agents | VERIFIED | `discoverAgents()` in `src/lib/agent-discovery.ts` lines 22-41 scans with `fs.readdirSync` using `withFileTypes`, skips hidden dirs, builds `DiscoveredAgent[]` |
| 2 | Server reads each agent's config from their isolated HOME/.nanobot/config.json (parsed from launch script) | VERIFIED | `parseHomeFromLaunchScript()` extracts HOME from `export HOME=` lines; `readAgentConfig()` reads JSON from that path |
| 3 | Each discovered agent includes name, model, gateway port, workspace path, channels, and optional icon | VERIFIED | `DiscoveredAgent` interface in `src/types/agent-health.ts` has all fields; `buildAgentFromDirectory()` populates them |
| 4 | Server can detect new agent directories appearing between scans without restart | PARTIAL | Logic is correct (each `discoverAgents()` call rescans filesystem), but the AREG-04 unit test fails due to regression from root agent discovery addition |
| 5 | Server checks gateway port liveness via TCP connect for each agent | VERIFIED | `checkPortAlive()` in `src/lib/agent-health.ts` uses `net.Socket` with connect/error/timeout events |
| 6 | Server reads last activity timestamp from most recent JSONL session file | VERIFIED | `getLatestActivity()` sorts .jsonl files by mtime, reads last bytes with `readLastLines()`, walks backward for assistant messages, skips metadata |
| 7 | Server detects errors from JSONL sessions and error log files | VERIFIED | `detectErrors()` reads JSONL for tool_error/rate_limit; reads error log for Python tracebacks and telegram.error.Conflict |
| 8 | Server determines channel status from config + error log analysis | VERIFIED | `getChannelStatuses()` derives connected from portAlive, maps channel errors to specific channels |
| 9 | Server computes composite green/yellow/red health score per agent | VERIFIED | `computeCompositeHealth()` evaluates 4 dimensions with worst-dimension-wins logic |
| 10 | Health monitor runs checks on a configurable interval (default 30 seconds) | VERIFIED | `HealthMonitor` class in `src/lib/health-monitor.ts` with `intervalMs = 30_000`, `setInterval()` method, idempotent `start()` |
| 11 | Health monitor broadcasts status changes via eventBus for SSE consumption | VERIFIED | `tick()` compares current vs previous snapshots, broadcasts `agent.created`, `agent.status_changed`, `agent.deleted` via `eventBus.broadcast()` |
| 12 | API endpoint returns full agent health snapshots | VERIFIED | `GET /api/agents/discover` returns `{ agents: AgentHealthSnapshot[], checkedAt, count }` with auth and rate limiting |

#### Plan 02: Card Grid UI

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 13 | Agents panel shows a card grid with all discovered agents | VERIFIED | `AgentsPanel` fetches from `/api/agents/discover`, renders `AgentCardGrid` with snapshots |
| 14 | Each card shows: name, custom icon or initials, status dot, activity text, last active timestamp, channel labels | VERIFIED | `AgentCard` renders all 4 rows: icon+name+dot, activity text, relative time, channel labels with connected/disconnected |
| 15 | Cards are sorted by status -- unhealthy/errored agents bubble to top | VERIFIED | `setDiscoveredAgents` in store sorts with `{ red: 0, yellow: 1, green: 2 }` order |
| 16 | Summary bar above grid shows text counts with colored dots | VERIFIED | `AgentSummaryBar` counts by `health.overall`, renders colored dots + "N healthy M error" format |
| 17 | Skeleton cards appear during initial loading | VERIFIED | `AgentSkeletonGrid` renders shimmer cards with `animate-pulse` during `discoveredAgentsLoading` |
| 18 | Empty state shows helpful message with path hint when no agents found | VERIFIED | `AgentsPanel` renders "No agents discovered" with `~/.nanobot/workspace/agents/` path hint when array empty |
| 19 | Agent data refreshes automatically via polling with useSmartPoll | VERIFIED | `useSmartPoll(fetchAgents, healthCheckInterval, ...)` in `AgentsPanel` with configurable interval |
| 20 | SSE events update agent status in real time without manual refresh | VERIFIED | `use-server-events.ts` dispatches `agent.status_changed/created/deleted` to store; store updates trigger re-render |
| 21 | Toast notifications appear when agents are discovered/removed and on red status transitions | VERIFIED | `AgentsPanel` compares previous vs current via `useRef`, calls `show()` for new/removed/red transitions |
| 22 | Nav rail 'Agents' item navigable and works without requiresGateway restriction | VERIFIED | Nav item has no `requiresGateway` property; red dot badge renders when `hasRedAgent` |
| 23 | 'Last checked: X sec ago' footer text and 'Refresh Now' button visible | VERIFIED | Footer div with relative time text updated every 1s, manual refresh button calling `manualRefresh()` |

#### Plan 03: Slide-Out Panel

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 24 | Clicking an agent card opens a slide-out panel from the right | VERIFIED | `AgentSlideOut` rendered in `AgentsPanel` with `selectedDiscoveredAgentId`; card click sets selection in store |
| 25 | Slide-out panel has tabs: Overview, Errors, Channels | VERIFIED | Tab bar with `['overview', 'errors', 'channels']` tabs; state-based switching renders corresponding components |
| 26 | Overview tab shows full agent profile: name, icon, status, model, gateway port, workspace path, activity text, last seen | VERIFIED | `AgentOverviewTab` renders all fields: name, icon/avatar, health dot + label, model, activity, last seen, health dimensions, RBAC-gated technical details |
| 27 | Errors tab shows scrollable list of recent errors with timestamps | VERIFIED | `AgentErrorsTab` filters to 24h/50 max, sorts by timestamp, renders type badges + relative time + expandable messages |
| 28 | Channels tab shows per-channel status cards | VERIFIED | `AgentChannelsTab` renders cards with channel name, connected/disconnected status, error messages |
| 29 | Viewer role cannot see filesystem paths and process PIDs in detail panel | VERIFIED | `isViewer = currentUser?.role === 'viewer'` gates technical details; viewer sees "Technical details hidden for viewer role" |
| 30 | Dismiss/acknowledge button clears error badge (requires operator role) | VERIFIED | `handleDismiss` calls `POST /api/agents/{id}/errors/dismiss` then `dismissAgentErrors(agentId)`; button disabled for viewer role |
| 31 | Click outside panel, X button, or Escape closes the slide-out | VERIFIED | Backdrop `onClick={onClose}`, X button, Escape keydown listener all call `onClose` |
| 32 | Card grid remains interactive when panel is open -- clicking different agent switches panel content | VERIFIED | Backdrop is semi-transparent; `AgentSlideOut` re-renders with new `agentId` prop; tab resets to overview |
| 33 | Slide-out becomes full-screen overlay on mobile | VERIFIED | Panel styled `w-full md:w-[400px]` -- full width on mobile, 400px on desktop |
| 34 | Tab focuses cards, Enter opens slide-out | VERIFIED | Cards have `tabIndex={0}`, `onKeyDown` handles Enter; `focus-visible:ring-2` for visual feedback |

**Score:** 34/35 truths verified (1 partial due to test regression)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/agent-health.ts` | DiscoveredAgent, HealthLevel, CompositeHealth, AgentHealthSnapshot, AgentError, ChannelStatus types | VERIFIED | 132 lines, all 8 interfaces/types exported with full field definitions |
| `src/lib/agent-discovery.ts` | Filesystem scanning, config reading, launch script parsing | VERIFIED | 239 lines, exports discoverAgents, findLaunchScript, parseHomeFromLaunchScript, readAgentConfig + root agent discovery |
| `src/lib/agent-health.ts` | Port liveness, JSONL activity, error detection, channel status, composite health | VERIFIED | 391 lines, exports checkPortAlive, readLastLines, getLatestActivity, detectErrors, getChannelStatuses, computeCompositeHealth, checkAgentHealth |
| `src/lib/health-monitor.ts` | Singleton health check loop with eventBus broadcasting | VERIFIED | 163 lines, HMR-safe singleton on globalThis, start/stop/setInterval/tick/getSnapshot/getAgentSnapshot/dismissErrors |
| `src/app/api/agents/discover/route.ts` | GET /api/agents/discover endpoint | VERIFIED | 47 lines, requireRole(viewer), readLimiter, healthMonitor.start(), ?refresh=true support |
| `src/app/api/agents/[id]/errors/route.ts` | GET /api/agents/{id}/errors | VERIFIED | 47 lines, requireRole(viewer), readLimiter, 404 handling |
| `src/app/api/agents/[id]/errors/dismiss/route.ts` | POST /api/agents/{id}/errors/dismiss | VERIFIED | 48 lines, requireRole(operator), mutationLimiter, 404 handling |
| `src/app/api/agents/[id]/channels/route.ts` | GET /api/agents/{id}/channels | VERIFIED | 46 lines, requireRole(viewer), readLimiter, 404 handling |
| `src/components/agents/agents-panel.tsx` | Main agents panel with grid, summary bar, and footer | VERIFIED | 170 lines, useSmartPoll + toast notifications + loading/empty/grid states + slide-out + footer |
| `src/components/agents/agent-card.tsx` | Individual agent card with activity-first layout | VERIFIED | 112 lines, 4-row layout: icon+name+dot, activity, last active, channels + error badge |
| `src/components/agents/agent-card-grid.tsx` | Responsive grid layout for agent cards | VERIFIED | 25 lines, CSS grid 1-4 columns responsive |
| `src/components/agents/agent-health-dot.tsx` | Color-coded status dot with tooltip | VERIFIED | 62 lines, green/yellow/red dots, pulse on red, hover tooltip with degraded reasons |
| `src/components/agents/agent-summary-bar.tsx` | Summary counts above grid | VERIFIED | 50 lines, "N agents: X healthy Y error" with colored dots |
| `src/components/agents/agent-skeleton.tsx` | Shimmer loading skeleton card | VERIFIED | 37 lines, animate-pulse skeleton matching card dimensions |
| `src/components/agents/agent-slide-out.tsx` | Right-side slide-out panel with tabs and close behavior | VERIFIED | 175 lines, fixed right-0, backdrop, Escape, X, tabs, requestAnimationFrame animation, dialog role |
| `src/components/agents/agent-overview-tab.tsx` | Full agent profile with RBAC-gated technical details | VERIFIED | 171 lines, full profile + health dimensions + RBAC gating for viewer role |
| `src/components/agents/agent-errors-tab.tsx` | Scrollable error list with dismiss button | VERIFIED | 177 lines, 24h filter, 50 max, type badges, dismiss button with operator gating, expand/collapse |
| `src/components/agents/agent-channels-tab.tsx` | Per-channel status cards | VERIFIED | 73 lines, channel cards with connected/disconnected + error display + empty state |
| `src/components/ui/toast.tsx` | Minimal toast notification component | VERIFIED | 48 lines, slide-in animation, auto-dismiss, 4 types |
| `src/components/ui/toast-provider.tsx` | Toast context provider | VERIFIED | 40 lines, context with show(), fixed bottom-right container |
| `src/lib/__tests__/agent-discovery.test.ts` | Agent discovery unit tests | VERIFIED | 16 tests, 15 pass, 1 regression (AREG-04) |
| `src/lib/__tests__/agent-health.test.ts` | Agent health unit tests | VERIFIED | 28 tests, all pass |
| `src/lib/__tests__/health-monitor.test.ts` | Health monitor unit tests | VERIFIED | 7 tests, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/agent-discovery.ts` | `~/.nanobot/workspace/agents/` | `fs.readdirSync` with `withFileTypes` | WIRED | Line 32: `fs.readdirSync(agentsDir, { withFileTypes: true })` |
| `src/lib/agent-health.ts` | agent gateway port | `net.Socket` TCP connect | WIRED | Line 42: `socket.connect(port, host)` with connect/error/timeout handlers |
| `src/lib/health-monitor.ts` | `src/lib/event-bus.ts` | `eventBus.broadcast` on status changes | WIRED | Lines 76, 86, 100: broadcasts `agent.created`, `agent.status_changed`, `agent.deleted` |
| `src/app/api/agents/discover/route.ts` | `src/lib/health-monitor.ts` | `healthMonitor.getSnapshot()` | WIRED | Line 33: `healthMonitor.getSnapshot()` returns cached snapshots |
| `src/components/agents/agents-panel.tsx` | `/api/agents/discover` | `useSmartPoll` fetch | WIRED | Line 33: `fetch('/api/agents/discover')` in `fetchAgents` callback |
| `src/store/index.ts` | `src/types/agent-health.ts` | `AgentHealthSnapshot[]` in store | WIRED | Line 68: `discoveredAgents: AgentHealthSnapshot[]` |
| `src/lib/use-server-events.ts` | `src/store/index.ts` | SSE dispatch for agent health events | WIRED | Lines 128, 143, 151: dispatches to `addDiscoveredAgent`, `updateDiscoveredAgent`, `removeDiscoveredAgent` |
| `src/app/[[...panel]]/page.tsx` | `src/components/agents/agents-panel.tsx` | ContentRouter `case 'agents'` | WIRED | Line 183-184: `case 'agents': return <AgentsPanel />` |
| `src/components/agents/agents-panel.tsx` | `src/components/agents/agent-slide-out.tsx` | `selectedDiscoveredAgentId` triggers render | WIRED | Line 150-153: `<AgentSlideOut agentId={selectedDiscoveredAgentId} onClose={...} />` |
| `src/components/agents/agent-errors-tab.tsx` | `/api/agents/{id}/errors/dismiss` | fetch POST | WIRED | Line 63: `fetch(\`/api/agents/${snapshot.id}/errors/dismiss\`, { method: 'POST' })` |
| `src/components/agents/agent-overview-tab.tsx` | `src/store/index.ts` | `currentUser.role` for RBAC gating | WIRED | Line 45: `const isViewer = currentUser?.role === 'viewer'` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AREG-01 | 02-01 | Dashboard auto-discovers agents by scanning ~/.nanobot/workspace/agents/ | SATISFIED | `discoverAgents()` scans directory with `fs.readdirSync` |
| AREG-02 | 02-01 | Dashboard reads agent config from each agent's isolated HOME directory config.json | SATISFIED | `parseHomeFromLaunchScript()` + `readAgentConfig()` pipeline |
| AREG-03 | 02-01, 02-02, 02-03 | Dashboard displays discovered agents with name, model, gateway port, workspace path | SATISFIED | Agent cards show name + model in overview; RBAC-gated paths/ports in slide-out |
| AREG-04 | 02-01, 02-02 | Dashboard detects new agents without restart (polling) | SATISFIED (implementation) | Each `discoverAgents()` call rescans filesystem; 30s polling interval. Test has regression but behavior works. |
| HLTH-01 | 02-01 | Dashboard shows process alive/dead status via gateway port liveness | SATISFIED | `checkPortAlive()` with TCP socket; process dimension in composite health |
| HLTH-02 | 02-01 | Dashboard shows last activity timestamp from JSONL session files | SATISFIED | `getLatestActivity()` reads most recent .jsonl by mtime; displayed on card and overview tab |
| HLTH-03 | 02-01, 02-03 | Dashboard shows error state per agent (crashes, tool errors, rate limits) | SATISFIED | `detectErrors()` from JSONL + error logs; errors tab with type badges and dismiss |
| HLTH-04 | 02-01, 02-03 | Dashboard shows channel status per agent (connected/disconnected/error) | SATISFIED | `getChannelStatuses()` derives from port liveness; channels tab with per-channel cards |
| HLTH-05 | 02-01, 02-02 | Health checks run on configurable interval (default 30 seconds) | SATISFIED | `healthCheckInterval: 30000` in store; `HealthMonitor.setInterval()` method |
| HLTH-06 | 02-01, 02-02, 02-03 | Agent cards display color-coded status indicators (green/yellow/red) | SATISFIED | `AgentHealthDot` with `bg-success/bg-warning/bg-destructive`; pulse on red; tooltip on hover |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/__tests__/agent-discovery.test.ts` | 195 | Test regression: expects 1 agent but gets 2 due to root agent discovery addition | Warning | AREG-04 test fails; implementation is correct but test is stale |

No TODOs, FIXMEs, placeholders, console.logs, or empty implementations found in any Phase 2 production files.

### Human Verification Required

### 1. Visual Agent Card Grid Layout

**Test:** Navigate to http://localhost:3000/agents with agents running
**Expected:** Cards show activity-first layout: icon+name+dot, activity text, last active, channel labels. Cards sorted by health status. Summary bar above with colored dot counts.
**Why human:** Visual layout, spacing, typography, and color correctness cannot be verified programmatically.

### 2. Slide-Out Panel Interaction

**Test:** Click an agent card, verify slide-out opens from right with smooth animation. Check tabs switch correctly. Click different card while open.
**Expected:** Smooth slide-in, three tabs with correct content, content switches without close/reopen.
**Why human:** Animation smoothness, panel transition feel, and interactive behavior require visual observation.

### 3. Dark/Light Theme Colors

**Test:** Toggle dark/light mode while viewing agents panel
**Expected:** Green/yellow/red status indicators remain visible and distinguishable in both themes.
**Why human:** Color contrast and visual distinction depend on theme rendering.

### 4. Mobile Responsive Layout

**Test:** Resize browser to mobile width (<768px)
**Expected:** Single column cards, full-screen slide-out overlay.
**Why human:** Responsive breakpoints and mobile layout require visual verification.

### 5. Real-Time SSE Updates

**Test:** Start/stop an agent while viewing the agents panel
**Expected:** Card status updates in real time (within seconds) without manual refresh; toast notification appears.
**Why human:** Real-time behavior and SSE connectivity require live observation.

### Gaps Summary

One gap found: the AREG-04 unit test (detecting new agents between scans) fails due to a test regression. When `discoverRootAgent()` was added in Plan 03 to discover the root workspace agent, the existing test mock was not updated to exclude the root config path from `existsSync`. The mock returns `true` for all paths, causing the root agent to appear alongside the mocked sub-agent, resulting in 2 agents instead of the expected 1.

The underlying implementation is correct -- `discoverAgents()` rescans the filesystem on each call and will detect new directories. Only the test needs to be updated to mock `existsSync` to return `false` for the root config path (`~/.nanobot/config.json`).

This is a minor, non-blocking test regression. All 50 other tests pass. TypeScript compiles cleanly. The functional goal is achieved.

---

_Verified: 2026-03-09T17:12:00Z_
_Verifier: Claude (gsd-verifier)_
