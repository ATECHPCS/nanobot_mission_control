# Phase 2: Agent Discovery and Health - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-discover nanobot agents from `~/.nanobot/workspace/agents/` and continuously monitor their process liveness, last activity, error state, and channel connection health. Display agents in a card grid with composite health status. Click to open a detail slide-out panel. This phase covers discovery + read-only monitoring only — agent lifecycle control (start/stop/restart) belongs in Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Agent card layout
- Responsive card grid layout — shows all agents at once, each card self-contained
- Activity-first info hierarchy: name + custom icon + status dot at top, then activity text ("Processing receipts..."), last active timestamp, channel labels as text
- Technical details (port, workspace path, model, PID) go in the slide-out detail panel, NOT on the card
- Custom icon read from optional `icon` field in agent's config.json (e.g., `"icon": "🧠"`), fallback to color-coded initials (reuse existing agent-avatar.tsx pattern)
- Error count badge on card when errors exist (e.g., "[3 err]")
- Channel indicators as text labels on card ("Telegram: connected", "Discord: disconnected")
- Cards sorted by status — unhealthy/errored agents bubble to top
- Summary bar above the grid: text counts ("3 agents: ● 2 healthy ● 1 error")
- Current activity text shown on card, derived from latest JSONL session entry

### Navigation and detail panel
- New "Agents" nav item in the left nav rail (separate from Overview)
- Click agent card opens a slide-out panel from the right (overlay style, fixed width ~400px)
- Slide-out uses tabs: Overview, Errors, Channels (extensible for Phase 3+ with Lifecycle, Sessions tabs)
- Overview tab: full agent profile (name, icon, status, model, gateway port, process PID, uptime, workspace path, activity text, last seen)
- Errors tab: scrollable list of recent errors with timestamps (last 24 hours or last 50, whichever smaller)
- Channels tab: per-channel status cards (connected/disconnected, last message time, error info)
- Click outside panel or X button or Escape to close
- Card grid remains interactive when panel is open — click different agent to switch panel content

### Status indicator logic
- Composite health score: green/yellow/red, worst dimension wins
- Green: process alive + no errors + channels OK + recent activity
- Yellow: process alive but degraded (channel down, no activity > 1 hour, non-critical errors)
- Red: process dead, critical errors, or gateway unreachable
- 1 hour without JSONL session activity = stale (yellow)
- Tooltip on hover over status dot explains why it's yellow/red
- Status transitions: brief pulse animation on card + toast notification for red transitions. Yellow only pulses, no toast.
- Health check interval configurable via Dashboard Settings panel (default 30 seconds)
- "Last checked: X sec ago" subtle footer text below card grid
- Manual "Refresh Now" button near the footer

### Agent discovery and removal
- Toast notification + card appears when new agent directory discovered
- Toast notification + card disappears when agent directory removed
- No highlight badge on new agent cards — toast is sufficient
- Filesystem as source of truth — always scan filesystem for agent list, no DB caching of agent registry

### Error handling
- Detect: process crashes (was alive, now dead), rate limits in JSONL, failed tool calls in JSONL, channel disconnection
- Error badge shows count from last 24 hours, auto-ages out
- Dismiss/acknowledge button in slide-out clears error badge (requires operator role)

### RBAC
- All roles (viewer/operator/admin) see full health data: status, errors, channels, activity
- Viewers cannot see: filesystem paths and process PIDs (hidden in detail panel)
- Dismiss/acknowledge errors requires operator or admin role

### Nav rail indicator
- Red notification dot on Agents nav icon when any agent has red (critical) status
- Yellow/degraded does NOT trigger the nav dot — only red
- Dot clears when all agents return to green/yellow

### Empty and loading states
- Empty state: helpful message with path hint ("No agents discovered. Add agent directories to ~/.nanobot/workspace/agents/. Scanning every 30s...")
- Initial loading: skeleton cards that shimmer while first scan runs

### Theming and responsive
- Cards follow existing dashboard theme (Tailwind semantic tokens, dark mode via next-themes)
- Status colors: vivid on dark mode, muted on light mode (use existing success/warning/destructive tokens)
- Mobile: single column stack, slide-out becomes full-screen overlay
- Basic keyboard navigation: Tab to focus cards, Enter to open slide-out, Escape to close

### Claude's Discretion
- Exact card dimensions and spacing
- Skeleton card design details
- Slide-out panel animation timing/easing
- How to parse "current activity" from JSONL session entries
- Process liveness detection mechanism (port check, PID file, ps)
- Filesystem watching implementation (chokidar, fs.watch, or polling)
- Error categorization logic (what counts as "critical" vs "non-critical")
- Toast notification library/component choice

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/agent-avatar.tsx`: Color-coded avatar component — extend with custom icon support
- `src/components/ui/online-status.tsx`: Status indicator component — basis for health dot
- `src/lib/use-smart-poll.ts`: Visibility-aware polling hook — perfect for health check intervals
- `src/lib/use-server-events.ts`: SSE hook for real-time updates — agent status changes can broadcast via SSE
- `src/lib/event-bus.ts`: Server-side event bus — broadcast agent health changes to connected clients
- `src/store/index.ts`: Zustand store already has agent state (agents array, selectedAgent, CRUD actions)
- `src/components/panels/agent-detail-tabs.tsx`: Existing tabbed agent detail view — pattern to follow for slide-out tabs
- `src/components/dashboard/stats-grid.tsx`: Grid layout pattern — reuse for agent card grid

### Established Patterns
- API routes: `requireRole()` + `validateBody()` + `getDatabase()` pattern
- All mutations through API routes, never direct DB from client
- SSE via `eventBus.broadcast()` for real-time updates
- Zustand single store with `useMissionControl` hook
- `'use client'` directive on all components
- `cn()` utility for Tailwind class merging
- Dark mode default via `next-themes` with `class` strategy

### Integration Points
- `src/app/[[...panel]]/page.tsx`: ContentRouter — add Agents panel case
- `src/components/layout/nav-rail.tsx`: Add Agents nav item with red dot indicator
- `src/store/index.ts`: Extend with agent health state (status, errors, channels)
- `src/app/api/`: New agent discovery and health API routes
- `src/lib/config.ts`: NANOBOT_* env vars for workspace path configuration

</code_context>

<specifics>
## Specific Ideas

- Activity-first card layout inspired by the mockup: name + icon + status dot, activity text, last active, channel labels
- Slide-out panel modeled after existing agent-detail-tabs pattern but with right-side slide animation
- Summary bar format: "3 agents: ● 2 healthy ● 1 error" with colored dots
- Toast messages for agent discovery/removal and red status transitions
- Pulse animation on card when status transitions to red

</specifics>

<deferred>
## Deferred Ideas

- Push notifications to mobile via Pushover or ntfy.sh — maps to v2 NOTF-01/NOTF-02. User wants research on both services as notification delivery method.

</deferred>

---

*Phase: 02-agent-discovery-and-health*
*Context gathered: 2026-03-09*
