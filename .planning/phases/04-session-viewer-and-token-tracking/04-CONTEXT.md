# Phase 4: Session Viewer and Token Tracking - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Browse agent JSONL conversation sessions as a chat-style timeline and visualize per-agent, per-model token usage with Recharts charts. This phase adds two new full-width panels (Sessions and Tokens) accessible from the left nav rail. Session data is cached in SQLite with periodic sync from filesystem JSONL files. Token data is sourced from both nanobot agent sessions and Claude Code sessions.

</domain>

<decisions>
## Implementation Decisions

### Session viewer location
- Separate full-width panel with its own "Sessions" nav item in the left rail
- Three-column layout: agent list | session list | chat viewer
- Agent list sidebar is collapsible (collapses to icons or hides after agent selection, toggle to expand) — gives more room to chat viewer
- "View Sessions" link in agent slide-out panel navigates to Sessions panel pre-filtered and expanded to that agent (agent sidebar collapsed)
- URL reflects selection for deep linking: `/sessions/{agent}/{session}` — bookmarkable
- Empty state prompt on load ("Select an agent to browse sessions") until agent is clicked

### Session list sidebar
- Sessions grouped by channel type (Telegram, Cron, etc.) — channel name as group header, no counts on headers
- Channel + readable name for session identifiers: parse filename to show channel type badge + human name (e.g., "💬 Telegram · 6432548537", "⏰ Cron · Email Receipt Check")
- Each session row shows: name, last activity timestamp, first ~60 chars of last user message as snippet, message count badge (e.g., "42 msgs")
- Search bar above session list filters by session name and metadata (not full content search)
- Date filter using quick presets dropdown: Today, Last 7 days, Last 30 days, All time

### Chat timeline display
- Chat bubble style — user messages on right, agent messages on left
- Agent messages show the agent's custom icon/avatar from config.json; user messages show generic user icon
- Markdown rendering enabled for agent responses (tables, code blocks, bold/italic) — reuse existing markdown-renderer.tsx
- Timestamp shown on every message bubble
- Start at bottom (newest messages) — scroll up for history
- Floating "jump to bottom" button appears when scrolled away from bottom
- Bubble colors use existing Tailwind semantic tokens (primary tint for user, muted for agent)

### Tool call display
- Tool calls always expanded inline — show tool name, arguments, and result. No collapse/expand toggle
- Long tool results (over ~20 lines) truncated with "Show full result (N lines)" expand link
- No color distinction between tool success/failure — errors visible from result content text

### In-session search
- Search bar above the chat viewer area for find-within-session
- Simple scroll-to-first-match behavior — no match counting or prev/next navigation

### Data architecture
- SQLite cache with periodic sync — scan and index session metadata in SQLite (like existing claude-sessions.ts pattern)
- Session list served from DB for fast loading; full session content read from filesystem JSONL on demand
- Token data merged from both nanobot agent sessions AND Claude Code sessions (~/.claude/projects/) for unified view

### Token charts panel
- Dedicated full-width "Tokens" nav item in the left rail — separate from Sessions panel
- Summary stats cards row at top: Total Tokens, Total Sessions, Most Active Agent, Avg Tokens/Session
- Line chart for usage over time (trend lines) — Recharts LineChart
- Bar chart for per-agent token comparison — Recharts BarChart
- Per-model breakdown shows input tokens and output tokens separately
- Time range selector with calendar-aligned presets: Today, Week, Month, Year (default: Week)

### Claude's Discretion
- Exact collapsible sidebar animation and toggle button design
- SQLite schema for session cache (table structure, indexes)
- Sync interval for session scanning
- How to parse channel type and human name from JSONL filenames
- Large JSONL file streaming/virtualization strategy (10MB+ requirement)
- Exact stats card layout and formatting
- How to handle sessions with no token data
- Mobile/responsive behavior for three-column layout

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/claude-sessions.ts`: Parses Claude Code JSONL sessions with token extraction — pattern for nanobot session parser
- `src/components/panels/token-dashboard-panel.tsx`: Existing Recharts token visualization with LineChart, BarChart, PieChart — reference patterns
- `src/components/panels/agent-cost-panel.tsx`: Another Recharts usage panel — reusable chart patterns
- `src/lib/agent-health.ts`: `readLastLines()` for efficient partial file reads — reuse for large JSONL files
- `src/components/markdown-renderer.tsx`: Markdown rendering component — reuse for agent message rendering
- `src/lib/agent-discovery.ts`: Agent discovery service — reuse agent listing for session panel sidebar
- `src/types/agent-health.ts`: `DiscoveredAgent` type with agent metadata
- `src/store/index.ts`: Zustand store — extend with session viewer and token state
- `src/lib/use-smart-poll.ts`: Visibility-aware polling hook — use for session sync intervals
- `src/lib/event-bus.ts`: SSE broadcast — use for real-time session updates

### Established Patterns
- API routes: `requireRole()` + `validateBody()` + `getDatabase()` pattern
- Zustand single store with `useMissionControl` hook
- SSE via `eventBus.broadcast()` for real-time updates
- `'use client'` directive on all components
- `cn()` utility for Tailwind class merging
- Dark mode default via `next-themes` with `class` strategy
- ContentRouter in `src/app/[[...panel]]/page.tsx` maps URL segments to panels

### Integration Points
- `src/app/[[...panel]]/page.tsx`: Add Sessions and Tokens panel cases to ContentRouter
- `src/components/layout/nav-rail.tsx`: Add Sessions and Tokens nav items
- `src/store/index.ts`: Add session viewer state (selected agent, selected session, chat messages) and token state
- `src/app/api/`: New API routes for session listing, session content, token aggregation
- `src/lib/validation.ts`: Zod schemas for session/token API request parameters
- `src/lib/migrations.ts`: New migration for nanobot_sessions table

</code_context>

<specifics>
## Specific Ideas

- Three-column layout inspired by mockup: agent list | session list | chat viewer, with collapsible agent sidebar
- Chat bubbles like iMessage/Telegram — user on right, agent on left
- Channel badges with icons: 💬 for Telegram, ⏰ for Cron sessions
- Nanobot JSONL format: `{"role": "user/assistant/tool", "content": "...", "timestamp": "...", "tool_calls": [...]}` with metadata line at top
- Token charts follow existing Recharts patterns from token-dashboard-panel.tsx
- Stats cards row similar to existing stats-grid.tsx pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-session-viewer-and-token-tracking*
*Context gathered: 2026-03-10*
