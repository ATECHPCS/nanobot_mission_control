---
phase: 04-session-viewer-and-token-tracking
verified: 2026-03-10T17:34:55Z
status: human_needed
score: 10/10 must-haves verified
human_verification:
  - test: "Browse Sessions panel visually"
    expected: "Three-column layout: agent sidebar, session list, chat viewer. Sessions grouped by channel with badges."
    why_human: "Visual layout, responsive behavior, and scroll-to-bottom on load cannot be verified programmatically"
  - test: "Chat viewer scroll management and jump-to-bottom"
    expected: "Chat starts scrolled to bottom, jump-to-bottom appears when scrolled up, load-more on scroll to top"
    why_human: "Scroll behavior requires live DOM interaction"
  - test: "In-session search highlights and scrolls to first match"
    expected: "Typing a word scrolls to the matching message and highlights with yellow mark tag"
    why_human: "Visual highlighting and scroll behavior require live UI"
  - test: "Token dashboard charts render with real data"
    expected: "Line chart, bar chart, per-model breakdown, stats cards all render with Recharts"
    why_human: "Chart rendering and visual accuracy require browser"
  - test: "Deep link bookmarkability"
    expected: "Copy /nanobot-sessions/{agent}/{session} URL, open in new tab, same agent+session loads"
    why_human: "URL routing and state hydration from URL need browser test"
---

# Phase 4: Session Viewer and Token Tracking -- Verification Report

**Phase Goal:** Users can browse agent conversation history from JSONL session files and see per-agent, per-model token usage visualized over time
**Verified:** 2026-03-10T17:34:55Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can select an agent and browse its JSONL conversation sessions rendered as a chat-style timeline with user messages, agent responses, and tool calls | VERIFIED | `nanobot-session-panel.tsx` (102 lines) wires AgentSidebar -> SessionList -> ChatViewer. ChatViewer fetches from `/api/nanobot-sessions/{agent}/{session}` and renders MessageBubble components with role-based alignment. ToolCallDisplay renders inline tool calls. |
| 2 | User can search sessions by keyword and filter by date to find specific conversations | VERIFIED | SessionList has debounced search input and date range dropdown (Today/7d/30d/All). Fetch params include `search` and `dateRange`. API route queries SQLite with LIKE clauses and datetime filters. In-session search in ChatViewer scrolls to first match with `<mark>` highlighting. |
| 3 | Session viewer handles large JSONL files (10MB+) without freezing the browser (streaming or virtualized rendering) | VERIFIED | `readSessionContentStream` in nanobot-sessions.ts uses `readline.createInterface(createReadStream(...))` for files >=1MB. API route in `[agent]/[session]/route.ts` checks `file_size_bytes` and delegates to streaming reader. Pagination (offset/limit) prevents loading all messages at once. |
| 4 | Dashboard displays per-agent and per-model token usage charts (Recharts) with trend lines showing usage over time | VERIFIED | `nanobot-token-panel.tsx` (422 lines) renders LineChart (usage over time with dual Y-axis), BarChart (per-agent), and per-model stacked horizontal bars. Time range selector (Today/Week/Month/Year) filters all data. Token aggregation API merges claude_sessions + token_usage + nanobot_sessions. |
| 5 | Nanobot JSONL session files are scanned per agent and metadata cached in SQLite | VERIFIED | `scanAgentSessions` reads .jsonl files, parses metadata lines, counts messages. `syncNanobotSessions` upserts into `nanobot_sessions` table. Migration 028 creates table with indexes. |
| 6 | Session content is parsed correctly with user/assistant/tool message roles | VERIFIED | `readSessionContent` and `readSessionContentStream` both parse JSONL lines, skip `_type: 'metadata'`, extract role/content/timestamp/tool_calls/tool_call_id/name. 22 unit tests verify parsing behavior. |
| 7 | Sessions can be filtered by date range and searched by name/metadata | VERIFIED | API route builds dynamic WHERE clauses for agent_id, channel_type, date range (datetime('now', ?)), and LIKE search on session_key/channel_identifier/last_user_message. Zod schema validates query params. |
| 8 | API routes serve session list from SQLite cache and session content from filesystem | VERIFIED | GET `/api/nanobot-sessions` queries nanobot_sessions table. POST triggers sync. GET `/api/nanobot-sessions/{agent}/{session}` reads file from disk via readSessionContent/readSessionContentStream. |
| 9 | Token aggregation merges claude_sessions, token_usage, and nanobot_sessions tables | VERIFIED | `aggregateTokenStats` in token-aggregation.ts runs 6 SQL queries across 3 tables, merges byAgent, byModel, timeline. 14 unit tests verify aggregation logic. |
| 10 | Chat viewer renders user/assistant/tool messages with correct role-based alignment | VERIFIED | MessageBubble uses `ml-auto flex-row-reverse` for user (right-aligned, primary tint), `mr-auto` for assistant/tool (left-aligned, muted bg). MarkdownRenderer for assistant content. Tool messages show wrench icon + name. Timestamps on all bubbles. |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/nanobot-session.ts` | Type definitions, helpers, CHANNEL_ICONS | VERIFIED (117 lines) | Exports NanobotSessionMeta, NanobotSessionMessage, NanobotSessionMetadata, SessionListResponse, SessionContentResponse, CHANNEL_ICONS, parseSessionFilename, parseMetadataKey |
| `src/lib/nanobot-sessions.ts` | JSONL parser, SQLite sync, streaming reader | VERIFIED (349 lines) | Exports scanAgentSessions, readSessionContent, readSessionContentStream, syncNanobotSessions. Imports types, discoverAgents, getDatabase, logger |
| `src/lib/migrations.ts` | Migration 028 for nanobot_sessions table | VERIFIED | Migration 028_nanobot_sessions creates table with UNIQUE(agent_id, filename), 3 indexes |
| `src/lib/validation.ts` | Zod schemas for session queries | VERIFIED | sessionListQuerySchema (agent, channel, search, dateRange, limit, offset), sessionContentQuerySchema (offset, limit) |
| `src/app/api/nanobot-sessions/route.ts` | GET session list, POST trigger sync | VERIFIED (137 lines) | GET with requireRole('viewer'), Zod validation, SQLite query. POST with requireRole('operator'), sync trigger |
| `src/app/api/nanobot-sessions/[agent]/[session]/route.ts` | GET session content with pagination | VERIFIED (111 lines) | requireRole('viewer'), DB lookup, discoverAgents for homePath, streaming for large files |
| `src/lib/__tests__/nanobot-sessions.test.ts` | Unit tests for scan/parse/filter/stream | VERIFIED (200 lines) | 22 tests: parseSessionFilename (4), parseMetadataKey (3), scanAgentSessions (6), readSessionContent (6), readSessionContentStream (3) |
| `src/test/fixtures/sample-session.jsonl` | Test fixture (5 messages) | VERIFIED (938 bytes) | Telegram channel, metadata + 5 messages |
| `src/test/fixtures/sample-session-large.jsonl` | Test fixture (20 messages) | VERIFIED (3101 bytes) | Cron channel, metadata + 20 messages for pagination testing |
| `src/components/panels/nanobot-session-panel.tsx` | Three-column session browser | VERIFIED (102 lines) | URL deep linking, Zustand state, AgentSidebar + SessionList + ChatViewer composition |
| `src/components/sessions/agent-sidebar.tsx` | Collapsible agent list | VERIFIED (125 lines) | Collapse/expand toggle, health dots, agent icons, discovery fetch |
| `src/components/sessions/session-list.tsx` | Session list with search/filter | VERIFIED (205 lines) | Debounced search, date range dropdown, channel grouping with CHANNEL_ICONS, relative timestamps, message count badges |
| `src/components/sessions/chat-viewer.tsx` | Chat timeline with scroll management | VERIFIED (256 lines) | useLayoutEffect scroll-to-bottom, load-more on scroll-up, floating jump button, in-session search with scrollIntoView |
| `src/components/sessions/message-bubble.tsx` | Role-based message bubbles | VERIFIED (147 lines) | User right-aligned, assistant left-aligned with MarkdownRenderer, tool with wrench icon, search highlighting via mark tag, timestamps |
| `src/components/sessions/tool-call-display.tsx` | Tool call inline display | VERIFIED (71 lines) | Formatted JSON args, truncated results (20-line threshold), expand toggle |
| `src/app/api/token-stats/route.ts` | Unified token aggregation API | VERIFIED (45 lines) | GET with requireRole('viewer'), range validation, syncClaudeSessions refresh, aggregateTokenStats |
| `src/lib/token-aggregation.ts` | Pure-query aggregation module | VERIFIED (359 lines) | UnifiedTokenStats interface, 6 SQL queries, range cutoff helpers, byAgent/byModel/timeline merging |
| `src/components/panels/nanobot-token-panel.tsx` | Recharts token dashboard | VERIFIED (422 lines) | LineChart, BarChart, per-model stacked bars, stats cards, time range selector, cleanAgentName, formatNumber |
| `src/lib/__tests__/token-aggregation.test.ts` | Token aggregation unit tests | VERIFIED (321 lines) | 14 tests: summary totals, session counts, message counts, most active agent, avg tokens, byAgent, byModel, timeline, date filtering (today/month/year), empty tables, nanobot-only |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `nanobot-sessions.ts` | `nanobot-session.ts` | import types | WIRED | `import type { NanobotSessionMeta, ... } from '@/types/nanobot-session'` and `import { parseMetadataKey } from '@/types/nanobot-session'` |
| `api/nanobot-sessions/route.ts` | `nanobot-sessions.ts` | syncNanobotSessions + getDatabase | WIRED | `import { syncNanobotSessions } from '@/lib/nanobot-sessions'` and `import { getDatabase } from '@/lib/db'` |
| `api/nanobot-sessions/[agent]/[session]/route.ts` | `nanobot-sessions.ts` | readSessionContent/Stream | WIRED | `import { readSessionContent, readSessionContentStream } from '@/lib/nanobot-sessions'` |
| `nanobot-session-panel.tsx` | `/api/nanobot-sessions` | fetch for session list | WIRED | SessionList fetches `fetch('/api/nanobot-sessions?...')` at line 71 |
| `chat-viewer.tsx` | `/api/nanobot-sessions/[agent]/[session]` | fetch for session content | WIRED | `fetch('/api/nanobot-sessions/${agentId}/${sessionFilename}?...')` at lines 42 and 86 |
| `page.tsx` (ContentRouter) | `nanobot-session-panel.tsx` | case for 'nanobot-sessions' | WIRED | `if (tab === 'nanobot-sessions' \|\| tab.startsWith('nanobot-sessions/')) return <NanobotSessionPanel />` at line 181 |
| `store/index.ts` | `nanobot-session-panel.tsx` | Zustand sessionViewer state | WIRED | sessionViewerAgent, sessionViewerSession, sessionViewerAgentSidebarOpen with setters. Panel reads via `useMissionControl()` |
| `nanobot-token-panel.tsx` | `/api/token-stats` | fetch for token data | WIRED | `fetch('/api/token-stats?range=${range}')` at line 94 |
| `api/token-stats/route.ts` | `claude_sessions` table | SQL query | WIRED | `aggregateTokenStats(db, range)` queries claude_sessions table |
| `api/token-stats/route.ts` | `token_usage` table | SQL query | WIRED | `aggregateTokenStats` queries token_usage table with epochCutoff |
| `page.tsx` (ContentRouter) | `nanobot-token-panel.tsx` | case for 'nanobot-tokens' | WIRED | `if (tab === 'nanobot-tokens') return <NanobotTokenPanel />` at line 186 |
| `nav-rail.tsx` | `nanobot-sessions` panel | nav item routing | WIRED | `{ id: 'nanobot-sessions', label: 'Sessions', ... }` at line 28 |
| `nav-rail.tsx` | `nanobot-tokens` panel | nav item routing | WIRED | `{ id: 'nanobot-tokens', label: 'Tokens', ... }` at line 39 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SESS-01 | 04-01, 04-02 | User can browse JSONL conversation sessions per agent | SATISFIED | Agent sidebar selects agent, session list fetches from API, sessions displayed per agent with metadata |
| SESS-02 | 04-01, 04-02 | Sessions render as chat-style timeline with user messages, agent responses, and tool calls | SATISFIED | ChatViewer renders MessageBubble components with user/assistant/tool roles, ToolCallDisplay for tool calls |
| SESS-03 | 04-01, 04-02 | User can search and filter sessions by date and keyword | SATISFIED | SessionList has search input (debounced) and date range dropdown. API supports LIKE search and date filtering. In-session search scrolls to match |
| SESS-04 | 04-01, 04-02 | Session viewer handles large JSONL files without blocking | SATISFIED | readSessionContentStream uses readline for files >=1MB. Pagination (offset/limit) on both API and UI |
| TOKN-01 | 04-03 | Dashboard extracts token counts from JSONL session data | SATISFIED | aggregateTokenStats queries claude_sessions table for token data. syncClaudeSessions refreshes before query |
| TOKN-02 | 04-03 | Dashboard displays per-agent token usage with Recharts visualizations | SATISFIED | BarChart in nanobot-token-panel.tsx shows per-agent usage. Nanobot agents show message counts |
| TOKN-03 | 04-03 | Dashboard shows per-model token breakdown | SATISFIED | Per-model stacked horizontal bars with input/output split and numeric labels |
| TOKN-04 | 04-03 | Dashboard shows token usage trends over time | SATISFIED | LineChart with inputTokens (purple) and outputTokens (green) lines, dual Y-axis, date-bucketed timeline |

No orphaned requirements found. All 8 requirement IDs (SESS-01 through SESS-04, TOKN-01 through TOKN-04) are claimed by plans and have implementation evidence.

Note: REQUIREMENTS.md traceability table shows SESS-01 through SESS-04 as "In Progress (data layer complete, UI pending 04-02)" which is stale -- these are now complete per 04-02-SUMMARY.md and verified artifacts.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No blocker or warning-level anti-patterns found |

All 15+ source files scanned. No TODO/FIXME/HACK/PLACEHOLDER markers. No empty implementations. No stub return values. No console.log-only handlers.

### Human Verification Required

### 1. Sessions Panel Visual Layout and Interaction

**Test:** Open dev server, navigate to Sessions via nav rail. Click an agent, then a session.
**Expected:** Three-column layout (agent sidebar 200px/48px, session list 320px, chat viewer flex-1). Sessions grouped by channel type with icon badges. Chat bubbles show user on right (blue tint), assistant on left (muted bg) with markdown rendering. Tool calls inline with formatted JSON.
**Why human:** Visual layout, CSS transitions, responsive behavior, and markdown rendering quality require browser rendering.

### 2. Scroll Management

**Test:** Open a session with many messages. Verify chat starts scrolled to bottom. Scroll up until "Jump to bottom" button appears. Click it. Scroll to very top to trigger load-more.
**Expected:** Initial scroll-to-bottom without flicker (useLayoutEffect). Floating jump button at bottom-center. Load-more spinner at top while fetching. Scroll position preserved after prepend.
**Why human:** Scroll behavior depends on live DOM measurements (scrollTop, scrollHeight, clientHeight).

### 3. In-Session Search

**Test:** In chat viewer, type a word that appears in a message in the search bar.
**Expected:** After 300ms debounce, the chat scrolls to the first matching message. The matched text is highlighted with a yellow mark tag.
**Why human:** Visual scroll animation and text highlighting require visual confirmation.

### 4. Token Dashboard Charts

**Test:** Navigate to Tokens via nav rail. Switch between Today/Week/Month/Year.
**Expected:** Summary stats cards update. LineChart shows usage trend. BarChart shows per-agent. Per-model bars show input/output split. Empty states handled gracefully.
**Why human:** Recharts rendering, tooltip display, and responsive grid layout require browser rendering.

### 5. URL Deep Linking

**Test:** Select an agent and session. Copy the browser URL (/nanobot-sessions/{agent}/{session}). Open in a new tab.
**Expected:** The new tab loads with the same agent selected, session loaded, and sidebar collapsed.
**Why human:** URL parsing, state hydration, and Next.js routing require browser test.

### Gaps Summary

No gaps found. All 10 observable truths verified. All 19 artifacts exist, are substantive (well above min_lines thresholds), and are wired. All 13 key links verified. All 8 requirement IDs satisfied. No anti-patterns detected.

The only remaining verification is visual/behavioral testing in the browser (5 items listed above). Both Plan 02 and Plan 03 summaries report that human-verify checkpoints were "approved" by the user, which provides confidence but was not independently re-verified here.

---

_Verified: 2026-03-10T17:34:55Z_
_Verifier: Claude (gsd-verifier)_
