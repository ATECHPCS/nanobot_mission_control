# Phase 6: Overview Dashboard and Remote Access - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the legacy Overview page with a nanobot-agent-centric landing page. Merge the current Overview and Agents panels into a single unified landing page showing agent status cards, real-time activity feed, and error summary. Remove the legacy dashboard content (system health, GitHub stats, backups, pipelines). Remove the live-feed sidebar (activity moves inline). Cloudflare Tunnel integration is deferred — not part of this phase.

</domain>

<decisions>
## Implementation Decisions

### Landing page composition
- Replace the current `dashboard.tsx` entirely — gut legacy MC content (system health, GitHub, backups, pipelines, Claude Code stats)
- Merge Overview and Agents into one page — remove separate "Agents" nav item, landing page IS the agents page
- Reuse the existing agent card grid and slide-out panel from Phase 2 (same full cards, not mini-cards)
- Stacked layout: summary metric strip → agent card grid → activity feed + error summary (two-column row below grid)
- Quick action buttons updated for nanobot context: Tasks, Sessions, Tokens, Settings

### Summary metric strip
- Expanded summary strip above the agent grid (not just agent counts)
- Shows: agent count + status breakdown, total tokens today, total errors (24h), uptime/sessions active
- One-line glanceable overview of fleet health

### Token display on agent cards
- Show token count AND cached token count on each agent card
- Data source: gateway API query (when available), message count as fallback
- Compact label format on card (e.g., "42K tokens · 12K cached")

### Activity feed (embedded in landing page)
- All four event types shown: status changes, session activity, lifecycle actions, error events
- Real-time via SSE (existing eventBus infrastructure)
- Lives in the left column of the two-column row below the agent grid
- Remove the live-feed sidebar drawer entirely — activity is inline on the landing page now

### Error display
- Errors grouped by agent (agent name as group header, collapse/expand per agent)
- Count badge per agent showing error count
- Shows last 24h by default
- Lives in the right column of the two-column row below the agent grid

### Nav rail cleanup
- Merge Overview + Agents into single landing page (remove "Agents" nav item)
- Remove Webhooks nav item
- Remove Spawn nav item (redundant with Phase 3 lifecycle controls)
- Keep everything else: Tasks, Sessions, Office, Documents, Activity, Logs, Tokens, Agent Costs, Memory, Cron, Alerts, GitHub, Users, Audit, History, Integrations, Settings

### Cloudflare Tunnel
- NOT included in this phase — deferred entirely per user decision
- REMT-01, REMT-02, REMT-03 requirements deferred to future phase

### Claude's Discretion
- Exact metric strip layout and formatting
- Activity feed event formatting and icons
- Error grouping collapse/expand animation
- How to query gateway API for token/cached token counts
- Quick action button selection and layout
- What to do with the live-feed toggle button in the header after sidebar removal
- How to handle the `dashboardMode` (local vs full) distinction in the new layout

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/agents/agents-panel.tsx`: Full agent card grid + slide-out — reuse directly on landing page
- `src/components/dashboard/dashboard.tsx`: Current 770-line legacy overview — will be replaced entirely
- `src/components/layout/live-feed.tsx`: SSE activity sidebar — will be removed, feed logic moves inline
- `src/components/dashboard/stats-grid.tsx`: Grid layout pattern — reference for metric strip
- `src/lib/event-bus.ts`: SSE event broadcasting — powers activity feed
- `src/lib/use-server-events.ts`: SSE client hook — dispatches events to Zustand
- `src/store/index.ts`: Zustand store with discoveredAgents, health status, SSE handlers
- `src/lib/use-smart-poll.ts`: Visibility-aware polling — for metric refresh

### Established Patterns
- ContentRouter in `src/app/[[...panel]]/page.tsx` maps URL segments to panels
- Nav rail groups in `src/components/layout/nav-rail.tsx` with navGroups array
- Agent cards with slide-out pattern from Phase 2
- SSE via eventBus.broadcast() for real-time updates
- MetricCard component in current dashboard.tsx — pattern for summary strip

### Integration Points
- `src/app/[[...panel]]/page.tsx`: Change 'overview' case to render new landing page, remove 'agents' case
- `src/components/layout/nav-rail.tsx`: Remove 'agents', 'webhooks', 'spawn' items; update 'overview' to be the merged landing
- `src/components/dashboard/dashboard.tsx`: Replace entirely with new agent-centric landing
- `src/components/layout/live-feed.tsx`: Remove component and sidebar toggle
- `src/store/index.ts`: Remove liveFeedOpen state and toggleLiveFeed action

</code_context>

<specifics>
## Specific Ideas

- Landing page should feel like the mockup: summary strip at top, agent cards in the middle, activity + errors below
- Agent cards are the SAME cards from the existing Agents panel — not duplicated, just moved to be the landing page
- Activity feed format: timestamp + agent icon + event description (e.g., "2:45 PM 🧠 Stefany started processing receipts")
- Error groups: click agent header to expand/collapse, badge shows count (e.g., "Root [3]")

</specifics>

<deferred>
## Deferred Ideas

- Cloudflare Tunnel integration (REMT-01, REMT-02, REMT-03) — user decided not to include
- Claude Code CLI OAuth integration with plan-based daily remaining token usage tracking — new capability, own phase
- Webhooks panel — removed from nav, may return in future if needed
- Spawn panel — redundant with Phase 3 lifecycle, removed from nav

</deferred>

---

*Phase: 06-overview-dashboard-and-remote-access*
*Context gathered: 2026-03-10*
