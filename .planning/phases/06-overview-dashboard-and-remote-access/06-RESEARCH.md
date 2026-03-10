# Phase 6: Overview Dashboard and Remote Access - Research

**Researched:** 2026-03-10
**Domain:** React dashboard UI refactoring (Next.js + Zustand + SSE)
**Confidence:** HIGH

## Summary

Phase 6 replaces the legacy `Dashboard` component with an agent-centric landing page. The existing codebase already contains all the building blocks: `AgentsPanel` (card grid + slide-out), `AgentSummaryBar` (status counts), `LiveFeed` (SSE activity sidebar), and `eventBus` (SSE broadcasting). The work is primarily UI restructuring -- composing existing components into a new layout, adding a metric strip, embedding the activity feed inline, and adding an error summary panel. No new backend APIs are needed; all data sources already exist.

The nav rail needs cleanup (remove agents, webhooks, spawn items) and the live-feed sidebar must be removed entirely (activity moves inline). The ContentRouter switch maps 'overview' to the new landing page instead of the legacy Dashboard.

**Primary recommendation:** Compose the new landing page from existing components (AgentCardGrid, AgentSlideOut, AgentSummaryBar) plus two new components (ActivityFeedInline, ErrorSummaryPanel) and an expanded MetricStrip. Do NOT rewrite agent discovery or SSE infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace the current `dashboard.tsx` entirely -- gut legacy MC content (system health, GitHub, backups, pipelines, Claude Code stats)
- Merge Overview and Agents into one page -- remove separate "Agents" nav item, landing page IS the agents page
- Reuse the existing agent card grid and slide-out panel from Phase 2 (same full cards, not mini-cards)
- Stacked layout: summary metric strip -> agent card grid -> activity feed + error summary (two-column row below grid)
- Quick action buttons updated for nanobot context: Tasks, Sessions, Tokens, Settings
- Expanded summary strip above the agent grid: agent count + status breakdown, total tokens today, total errors (24h), uptime/sessions active
- Show token count AND cached token count on each agent card (gateway API query when available, message count as fallback)
- Activity feed embedded in landing page left column: all four event types (status changes, session activity, lifecycle actions, error events), real-time via SSE
- Remove the live-feed sidebar drawer entirely -- activity is inline on the landing page now
- Errors grouped by agent (agent name as group header, collapse/expand per agent), count badge per agent, shows last 24h by default
- Nav rail: remove 'agents', 'webhooks', 'spawn' items; update 'overview' to be the merged landing
- Cloudflare Tunnel NOT included -- REMT-01, REMT-02, REMT-03 deferred entirely

### Claude's Discretion
- Exact metric strip layout and formatting
- Activity feed event formatting and icons
- Error grouping collapse/expand animation
- How to query gateway API for token/cached token counts
- Quick action button selection and layout
- What to do with the live-feed toggle button in the header after sidebar removal
- How to handle the `dashboardMode` (local vs full) distinction in the new layout

### Deferred Ideas (OUT OF SCOPE)
- Cloudflare Tunnel integration (REMT-01, REMT-02, REMT-03)
- Claude Code CLI OAuth integration with plan-based daily remaining token usage tracking
- Webhooks panel -- removed from nav, may return in future if needed
- Spawn panel -- redundant with Phase 3 lifecycle, removed from nav
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Landing page shows all agents with composite status cards | Existing `AgentCardGrid` + `AgentSlideOut` reused directly; new `OverviewLanding` wrapper component |
| DASH-02 | Each agent card shows: name, status, last activity, channel health, token usage | Existing cards already show name/status/activity/channels; token display added via gateway API query or message count fallback |
| DASH-03 | Activity feed shows real-time nanobot agent events via SSE | Existing `eventBus` + `useServerEvents` infrastructure; new `ActivityFeedInline` component replaces sidebar `LiveFeed` |
| DASH-04 | Error/failure counts displayed prominently with filtering capability | New `ErrorSummaryPanel` component; data from `AgentHealthSnapshot.errors` array already available in Zustand store |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14.x | App router, SSR | Already in use |
| React | 18.x | UI components | Already in use |
| Zustand | 4.x | State management | Already in use with subscribeWithSelector |
| Tailwind CSS | 3.x | Styling | Already in use throughout |
| EventSource (native) | Browser API | SSE client | Already used via useServerEvents |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx/cn | - | Conditional classes | Already used everywhere via `@/lib/utils` |
| useSmartPoll | custom hook | Visibility-aware polling | Metric strip refresh |

### No New Dependencies Needed
This phase is pure UI restructuring. All required infrastructure exists. No new npm packages.

## Architecture Patterns

### New Component Structure
```
src/components/dashboard/
  overview-landing.tsx      # NEW: Main landing page wrapper (replaces dashboard.tsx)
  metric-strip.tsx          # NEW: Expanded summary metrics bar
  activity-feed-inline.tsx  # NEW: Embedded activity feed (replaces LiveFeed sidebar)
  error-summary-panel.tsx   # NEW: Error grouping by agent with collapse/expand
  dashboard.tsx             # DELETE: Legacy overview (770 lines)
```

### Pattern 1: Composing from Existing Components
**What:** The new landing page imports and renders existing agent components directly.
**When to use:** When existing components already implement the needed UI.
**Example:**
```typescript
// overview-landing.tsx
import { AgentCardGrid } from '@/components/agents/agent-card-grid'
import { AgentSlideOut } from '@/components/agents/agent-slide-out'
import { MetricStrip } from './metric-strip'
import { ActivityFeedInline } from './activity-feed-inline'
import { ErrorSummaryPanel } from './error-summary-panel'

export function OverviewLanding() {
  const { discoveredAgents, selectedDiscoveredAgentId, setSelectedDiscoveredAgentId } = useMissionControl()
  // Reuse AgentsPanel fetch logic (useSmartPoll + fetchAgents)
  // Layout: MetricStrip -> AgentCardGrid -> [ActivityFeedInline | ErrorSummaryPanel]
}
```

### Pattern 2: SSE Event Consumption for Activity Feed
**What:** The inline activity feed subscribes to the same SSE events the sidebar used, but renders inline.
**When to use:** Activity feed component.
**How it works:**
- `useServerEvents()` already dispatches events to Zustand (agent.status_changed, agent.lifecycle, agent.created, etc.)
- The inline feed subscribes to Zustand store slices for activities, logs, and lifecycle history
- Events are merged, sorted by timestamp, and rendered as a scrollable list
- The existing `LiveFeed` component's data merging logic (lines 13-42) is the template

### Pattern 3: Metric Derivation from Zustand Store
**What:** Summary metrics computed from existing Zustand state, no new API calls needed.
**When to use:** Metric strip component.
**Data sources:**
- Agent count + status breakdown: `discoveredAgents` array, count by `health.overall`
- Total errors (24h): sum `discoveredAgents[].errors.length` (already filtered server-side)
- Active sessions: `discoveredAgents[].health.dimensions.process.level === 'green'` count
- Total tokens today: requires new fetch to `/api/agents/discover` which already returns token data, OR gateway API

### Pattern 4: ContentRouter Update
**What:** Change the 'overview' case and remove 'agents' case in the switch statement.
**Integration points:**
```typescript
// page.tsx ContentRouter
case 'overview':
  return <OverviewLanding />  // was: <Dashboard />
// REMOVE: case 'agents': return <AgentsPanel />
```

### Anti-Patterns to Avoid
- **Duplicating AgentsPanel logic:** Do NOT copy fetchAgents/polling logic into OverviewLanding. Extract it to a shared hook or import AgentsPanel's fetch logic directly.
- **Creating a new SSE connection:** Do NOT create a second EventSource. The existing `useServerEvents()` in page.tsx handles all SSE. New components subscribe to Zustand.
- **Keeping legacy Dashboard state:** Do NOT retain `systemStats`, `dbStats`, `claudeStats`, `githubStats` state -- all legacy fetches are removed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent health data | New health API | `discoveredAgents` from Zustand (populated by existing `/api/agents/discover`) | Data already fetched and polled |
| SSE event stream | New EventSource | Existing `useServerEvents()` + Zustand subscriptions | Infrastructure exists since Phase 1 |
| Agent card UI | New card components | Existing `AgentCardGrid` + `AgentSlideOut` | Already built in Phase 2 |
| Status color coding | Custom color logic | Existing `HealthLevel` type + color maps in `agent-summary-bar.tsx` | Consistent with existing UI |
| Visibility-aware polling | Custom interval logic | Existing `useSmartPoll` hook | Handles tab visibility, backoff |

## Common Pitfalls

### Pitfall 1: Agent Data Fetch Duplication
**What goes wrong:** OverviewLanding and the old AgentsPanel both call `/api/agents/discover` independently, causing double fetches.
**Why it happens:** AgentsPanel has its own `useSmartPoll` + `fetchAgents`. If OverviewLanding wraps AgentsPanel components but adds its own polling, you get duplicates.
**How to avoid:** Extract `fetchAgents` + `useSmartPoll` into OverviewLanding (which replaces AgentsPanel as the host). The card grid and slide-out are pure display components -- they receive data via props or Zustand.
**Warning signs:** Network tab shows duplicate `/api/agents/discover` calls.

### Pitfall 2: LiveFeed Removal Breaking Page Layout
**What goes wrong:** Removing the LiveFeed sidebar from page.tsx changes the flex layout. The main content area may not expand to fill the freed space.
**Why it happens:** The current layout is `NavRail | Content | LiveFeed` (three-column flex). Removing LiveFeed changes it to two-column.
**How to avoid:** Simply remove the `{liveFeedOpen && ...}` block and the toggle button from page.tsx. The `flex-1` on the content div already handles expansion. Also remove the `liveFeedOpen` and `toggleLiveFeed` from the store destructure.

### Pitfall 3: Nav Rail Item Removal Breaking URL Routing
**What goes wrong:** Removing 'agents' from navGroups means users can't navigate to /agents, but the ContentRouter still handles that case. Old bookmarks break silently.
**Why it happens:** Nav removal and router removal happen independently.
**How to avoid:** In ContentRouter, redirect 'agents' to 'overview': `case 'agents': return <OverviewLanding />` (or redirect). Remove the case for 'spawn' and 'webhooks' as well (they can fall through to default).

### Pitfall 4: Token Data Not Available Yet
**What goes wrong:** Agent cards promise token display, but gateway API may not return token counts. The JSONL parsing (Phase 4) tracks message counts not token counts.
**Why it happens:** As noted in decision [04-03]: "Nanobot agents in byAgent with message counts (NOT token counts) -- JSONL lacks token fields."
**How to avoid:** Use message count as the primary metric with "messages" label. If gateway API returns token data, show it. The card should gracefully handle both cases: `"42K tokens" | "128 messages"`.

### Pitfall 5: Store Cleanup Breaking HeaderBar
**What goes wrong:** Removing `liveFeedOpen` / `toggleLiveFeed` from the store breaks the HeaderBar if it references them.
**Why it happens:** The header has a toggle button for the live feed sidebar.
**How to avoid:** Check HeaderBar for liveFeedOpen references and remove them. The toggle button in the header should be removed entirely since the sidebar is gone.

## Code Examples

### Metric Strip Data Derivation
```typescript
// Compute metrics from existing Zustand state
function useMetrics(agents: AgentHealthSnapshot[]) {
  const total = agents.length
  const healthy = agents.filter(a => a.health.overall === 'green').length
  const degraded = agents.filter(a => a.health.overall === 'yellow').length
  const errors = agents.filter(a => a.health.overall === 'red').length
  const totalErrors24h = agents.reduce((sum, a) => sum + (a.errors?.length ?? 0), 0)
  const alive = agents.filter(a => a.health.dimensions.process.level === 'green').length

  return { total, healthy, degraded, errors, totalErrors24h, alive }
}
```

### Activity Feed Event Merging (from existing LiveFeed pattern)
```typescript
// Merge multiple event sources into unified feed (pattern from live-feed.tsx lines 13-42)
const feedItems = [
  ...activities.map(act => ({
    id: `act-${act.id}`,
    type: 'activity' as const,
    message: act.description,
    source: act.actor,
    timestamp: act.created_at * 1000,
  })),
  ...lifecycleHistory.slice(0, 20).map(op => ({
    id: `life-${op.agentId}-${op.startedAt}`,
    type: 'lifecycle' as const,
    message: `${op.action} ${op.agentId}: ${op.status}`,
    source: op.agentId,
    timestamp: op.startedAt,
  })),
  // ... status changes from discoveredAgents
].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)
```

### Error Grouping by Agent
```typescript
// Group errors from all agents
function groupErrorsByAgent(agents: AgentHealthSnapshot[]) {
  return agents
    .filter(a => a.errors && a.errors.length > 0)
    .map(a => ({
      agentId: a.id,
      agentName: a.name,
      agentIcon: a.icon,
      errors: a.errors, // AgentError[] from agent-health types
      count: a.errors.length,
    }))
    .sort((a, b) => b.count - a.count)
}
```

### Nav Rail Cleanup
```typescript
// Remove these items from navGroups:
// core group: remove { id: 'agents', ... }
// automate group: remove { id: 'spawn', ... } and { id: 'webhooks', ... }
```

## Key Integration Points

### Files to Modify
| File | Change | Why |
|------|--------|-----|
| `src/app/[[...panel]]/page.tsx` | Remove LiveFeed import/render, remove liveFeedOpen toggle button, update ContentRouter 'overview' case, add 'agents' redirect, remove 'spawn'/'webhooks' cases | Landing page replaces Dashboard + removes sidebar |
| `src/components/layout/nav-rail.tsx` | Remove 'agents', 'spawn', 'webhooks' from navGroups | Nav cleanup per user decision |
| `src/components/layout/header-bar.tsx` | Remove live-feed toggle button if present | Sidebar no longer exists |
| `src/store/index.ts` | Remove `liveFeedOpen` and `toggleLiveFeed` (after verifying no other consumers) | Dead code cleanup |

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/dashboard/overview-landing.tsx` | New landing page wrapper |
| `src/components/dashboard/metric-strip.tsx` | Expanded summary metrics |
| `src/components/dashboard/activity-feed-inline.tsx` | Inline activity feed |
| `src/components/dashboard/error-summary-panel.tsx` | Error grouping panel |

### Files to Delete
| File | Reason |
|------|--------|
| `src/components/dashboard/dashboard.tsx` | Replaced by overview-landing.tsx |
| `src/components/layout/live-feed.tsx` | Sidebar removed, activity is inline |

### Files to Preserve (imports move to overview-landing)
| File | Reason |
|------|--------|
| `src/components/agents/agent-card-grid.tsx` | Reused on landing page |
| `src/components/agents/agent-slide-out.tsx` | Reused on landing page |
| `src/components/agents/agent-summary-bar.tsx` | Pattern reference for metric strip |
| `src/components/agents/agents-panel.tsx` | Fetch logic extracted; component may become thin wrapper or be removed |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy MC overview (system health, GitHub, backups) | Agent-centric landing page | Phase 6 | Dashboard shows nanobot agents as primary content |
| Separate Overview + Agents pages | Merged single landing page | Phase 6 | One fewer nav item, agent cards on landing |
| LiveFeed sidebar drawer | Inline activity feed | Phase 6 | Activity visible by default, no toggle needed |

## Open Questions

1. **Gateway API token query format**
   - What we know: Gateway runs on agent's configured port, health endpoint exists
   - What's unclear: Exact endpoint/response format for token usage data
   - Recommendation: Try `GET http://localhost:{gatewayPort}/status` and check if token fields exist. Fall back to message count from JSONL session data (already implemented in Phase 4).

2. **agents-panel.tsx disposition**
   - What we know: Its fetch logic + polling is needed by OverviewLanding. Its card grid and slide-out are separate components.
   - What's unclear: Whether to keep agents-panel.tsx as a thin wrapper or inline its logic into overview-landing.tsx.
   - Recommendation: Extract the fetch + poll logic into OverviewLanding directly. If agents-panel.tsx has no other consumers after the nav merge, it can be deleted or kept as a re-export.

3. **dashboardMode handling**
   - What we know: Current dashboard checks `isLocal` to conditionally fetch Claude sessions and GitHub stats. New landing doesn't need those fetches.
   - What's unclear: Whether `dashboardMode` affects any remaining landing page behavior.
   - Recommendation: The new landing page is agent-centric and always works the same regardless of dashboardMode. Remove the distinction from the landing page entirely.

## Sources

### Primary (HIGH confidence)
- Codebase inspection of all referenced files (dashboard.tsx, agents-panel.tsx, live-feed.tsx, event-bus.ts, use-server-events.ts, nav-rail.tsx, page.tsx, store/index.ts, agent-health.ts, agent-summary-bar.tsx)
- CONTEXT.md user decisions (locked choices)
- REQUIREMENTS.md requirement definitions (DASH-01 through DASH-04)
- STATE.md project history and accumulated decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing tech
- Architecture: HIGH - composition of existing components, clear integration points
- Pitfalls: HIGH - derived from direct codebase inspection of actual code paths

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- internal project, no external dependency changes)
