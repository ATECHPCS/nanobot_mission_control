# Phase 4: Session Viewer and Token Tracking - Research

**Researched:** 2026-03-10
**Domain:** JSONL session parsing, chat UI, Recharts visualization, SQLite caching, virtualized rendering
**Confidence:** HIGH

## Summary

Phase 4 adds two full-width panels (Sessions and Tokens) to the existing Mission Control dashboard. The Sessions panel provides a three-column layout for browsing nanobot agent JSONL conversation files as a chat-style timeline. The Tokens panel consolidates token usage from both nanobot sessions and Claude Code sessions into Recharts visualizations.

The project already has substantial infrastructure to build on: `claude-sessions.ts` demonstrates JSONL parsing with token extraction and SQLite caching; `token-dashboard-panel.tsx` shows working Recharts patterns (LineChart, BarChart, PieChart); `agent-discovery.ts` provides agent listing; `markdown-renderer.tsx` handles markdown in messages; `readLastLines()` in `agent-health.ts` efficiently reads file tails. The new work is primarily: (1) a nanobot JSONL parser analogous to `claude-sessions.ts`, (2) a new `nanobot_sessions` SQLite table with sync, (3) the three-column session browser UI, (4) the unified token aggregation panel, and (5) handling the URL routing for deep links.

**Primary recommendation:** Build the server-side data layer first (JSONL parser, SQLite schema, API routes), then the Sessions panel UI, then the Tokens panel (which reuses existing Recharts patterns and extends the existing token infrastructure).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Session viewer is a separate full-width panel with its own "Sessions" nav item in the left rail
- Three-column layout: agent list | session list | chat viewer, with collapsible agent sidebar
- URL deep linking: `/sessions/{agent}/{session}` -- bookmarkable
- "View Sessions" link in agent slide-out panel navigates to Sessions panel pre-filtered
- Sessions grouped by channel type (Telegram, Cron, etc.) with channel name as group header
- Channel + readable name for session identifiers: channel type badge + human name
- Each session row: name, last activity timestamp, first ~60 chars snippet, message count badge
- Search bar above session list filters by session name and metadata (not full content)
- Date filter using quick presets dropdown: Today, Last 7 days, Last 30 days, All time
- Chat bubble style: user on right, agent on left
- Agent messages show agent's custom icon/avatar from config.json; user messages show generic icon
- Markdown rendering enabled for agent responses (reuse markdown-renderer.tsx)
- Timestamp on every message bubble
- Start at bottom (newest), scroll up for history
- Floating "jump to bottom" button when scrolled away
- Bubble colors use existing Tailwind semantic tokens
- Tool calls always expanded inline: tool name, arguments, result
- Long tool results (>20 lines) truncated with "Show full result" expand link
- In-session search with scroll-to-first-match (no match counting or prev/next)
- SQLite cache with periodic sync for session metadata
- Session list from DB; full content from filesystem JSONL on demand
- Token data merged from nanobot sessions AND Claude Code sessions
- Token charts in dedicated "Tokens" nav item (separate panel from Sessions)
- Summary stats cards: Total Tokens, Total Sessions, Most Active Agent, Avg Tokens/Session
- Line chart for usage over time, Bar chart for per-agent comparison
- Per-model breakdown shows input and output tokens separately
- Time range: Today, Week, Month, Year (default: Week)

### Claude's Discretion
- Exact collapsible sidebar animation and toggle button design
- SQLite schema for session cache (table structure, indexes)
- Sync interval for session scanning
- How to parse channel type and human name from JSONL filenames
- Large JSONL file streaming/virtualization strategy (10MB+ requirement)
- Exact stats card layout and formatting
- How to handle sessions with no token data
- Mobile/responsive behavior for three-column layout

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | User can browse JSONL conversation sessions per agent | Nanobot JSONL format documented, filename parsing strategy, SQLite schema for session index, API route design |
| SESS-02 | Sessions render as chat-style timeline with user/agent/tool messages | JSONL entry structure (role, content, tool_calls, tool_call_id), markdown-renderer reuse, bubble layout patterns |
| SESS-03 | Search and filter sessions by date and keyword | Search bar filters session metadata from SQLite, date presets, in-session content search via scroll-to-match |
| SESS-04 | Session viewer handles large JSONL files without blocking | Streaming read strategy, chunked pagination, DOM virtualization for message lists |
| TOKN-01 | Extract token counts from JSONL session data | Nanobot JSONL lacks per-message token fields -- aggregate from Claude Code sessions and estimate for nanobot |
| TOKN-02 | Per-agent token usage Recharts visualizations | Existing Recharts patterns from token-dashboard-panel.tsx and agent-cost-panel.tsx |
| TOKN-03 | Per-model token breakdown | Model field from both session sources, input/output split |
| TOKN-04 | Token usage trends over time | LineChart with time-series aggregation, existing trend pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.0.1 | UI framework | Already installed, project standard |
| Next.js | ^16.1.6 | Full-stack framework, API routes | Already installed, project standard |
| Recharts | ^3.7.0 | Charts (LineChart, BarChart) | Already installed, used in token-dashboard-panel and agent-cost-panel |
| better-sqlite3 | ^12.6.2 | SQLite database | Already installed, used for all data caching |
| Zustand | ^5.0.11 | State management | Already installed, single store pattern |
| Zod | ^4.3.6 | API validation | Already installed, used in all API routes |
| react-markdown | ^10.1.0 | Markdown rendering | Already installed, used in markdown-renderer.tsx |
| remark-gfm | ^4.0.1 | GitHub Flavored Markdown tables/code | Already installed |
| Tailwind CSS | ^3.4.17 | Styling | Already installed, project standard |
| tailwind-merge | ^3.4.0 | Class merging (cn utility) | Already installed |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js fs | built-in | JSONL file reading | Server-side session parsing |
| Node.js readline | built-in | Line-by-line streaming for large files | 10MB+ JSONL files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| No new virtualization lib | @tanstack/react-virtual | Would handle 10K+ messages, but simple CSS overflow-y + chunked loading is sufficient for JSONL files. Reserve for future if needed |
| No new search lib | Fuse.js | Session metadata search is simple string matching on SQLite -- no fuzzy search needed |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    nanobot-sessions.ts           # JSONL parser + SQLite sync (analogous to claude-sessions.ts)
  app/
    api/
      nanobot-sessions/
        route.ts                  # GET: list sessions, POST: trigger sync
      nanobot-sessions/[agent]/[session]/
        route.ts                  # GET: full session content (JSONL -> JSON messages)
      token-stats/
        route.ts                  # GET: unified token stats (nanobot + Claude Code)
  components/
    panels/
      nanobot-session-panel.tsx   # Main three-column session browser panel
      nanobot-token-panel.tsx     # Unified token dashboard panel
    sessions/
      agent-sidebar.tsx           # Collapsible agent list sidebar
      session-list.tsx            # Session list with search/filter
      chat-viewer.tsx             # Chat timeline with message bubbles
      message-bubble.tsx          # Individual message bubble (user/assistant/tool)
      tool-call-display.tsx       # Tool call inline display with truncation
  types/
    nanobot-session.ts            # Type definitions for session data
```

### Pattern 1: Nanobot JSONL File Format
**What:** Nanobot session JSONL files have a metadata line followed by message lines
**When to use:** All session parsing logic
**Example:**
```typescript
// Line 1: Metadata (always first line)
// {"_type": "metadata", "key": "telegram:6432548537", "created_at": "...", "updated_at": "...", "metadata": {}, "last_consolidated": 153}

// Subsequent lines: Messages
// {"role": "user", "content": "...", "timestamp": "2026-03-09T09:44:39.564860"}
// {"role": "assistant", "content": "...", "tool_calls": [...], "timestamp": "..."}
// {"role": "tool", "tool_call_id": "u5f6z92re", "name": "cron", "content": "...", "timestamp": "..."}

interface NanobotSessionMetadata {
  _type: 'metadata'
  key: string             // "channel:identifier" e.g. "telegram:6432548537"
  created_at: string      // ISO datetime
  updated_at: string      // ISO datetime
  metadata: Record<string, unknown>
  last_consolidated: number
}

interface NanobotSessionMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string   // Present on role: "tool" responses
  name?: string           // Tool name on role: "tool" responses
}
```

### Pattern 2: Filename Parsing for Channel Type and Human Name
**What:** Extract channel type and readable identifier from JSONL filenames
**When to use:** Building session list display
**Example:**
```typescript
// Filename format: {channel}_{identifier}.jsonl
// Examples:
//   telegram_6432548537.jsonl    -> channel: "telegram", id: "6432548537"
//   cron_daily-financial-summary.jsonl -> channel: "cron", id: "daily-financial-summary"
//   paperclip_paperclip_test-001.jsonl -> channel: "paperclip", id: "paperclip:test-001"

function parseSessionFilename(filename: string): { channel: string; identifier: string } {
  const base = filename.replace('.jsonl', '')
  const underscoreIdx = base.indexOf('_')
  if (underscoreIdx === -1) return { channel: 'unknown', identifier: base }
  return {
    channel: base.slice(0, underscoreIdx),
    identifier: base.slice(underscoreIdx + 1),
  }
}

// Cross-reference with metadata line "key" field for authoritative channel:id
// The metadata key format is "channel:identifier" (colon-separated)
function parseMetadataKey(key: string): { channel: string; identifier: string } {
  const colonIdx = key.indexOf(':')
  if (colonIdx === -1) return { channel: 'unknown', identifier: key }
  return {
    channel: key.slice(0, colonIdx),
    identifier: key.slice(colonIdx + 1),
  }
}

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '\u{1F4AC}',   // speech bubble
  cron: '\u{23F0}',        // alarm clock
  paperclip: '\u{1F4CE}',  // paperclip
  discord: '\u{1F47E}',    // alien
}
```

### Pattern 3: URL Deep Linking via Catch-All Route
**What:** The existing `[[...panel]]` catch-all route captures all path segments. `/sessions/stefany/telegram_6432548537` arrives as panel segments.
**When to use:** URL-based session selection
**Example:**
```typescript
// Current page.tsx parses: const panelFromUrl = pathname === '/' ? 'overview' : pathname.slice(1)
// For /sessions/stefany/telegram_6432548537, panelFromUrl = 'sessions/stefany/telegram_6432548537'

// ContentRouter needs to handle this:
// 1. Extract panel type from first segment
// 2. Pass remaining segments as props to the panel component

// In ContentRouter:
const segments = tab.split('/')
const panel = segments[0]
// For 'sessions' panel:
// segments[1] = agentId ('stefany')
// segments[2] = sessionId ('telegram_6432548537')

// The panel component receives these via URL parsing:
// const pathname = usePathname()
// const segments = pathname.split('/').filter(Boolean)
// const agentId = segments[1] || null
// const sessionId = segments[2] || null
```

### Pattern 4: SQLite Session Cache Schema
**What:** Store nanobot session metadata in SQLite for fast listing
**When to use:** Session list API
**Example:**
```sql
-- Migration: 028_nanobot_sessions
CREATE TABLE IF NOT EXISTS nanobot_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,           -- e.g. 'stefany'
  filename TEXT NOT NULL,           -- e.g. 'telegram_6432548537.jsonl'
  session_key TEXT NOT NULL,        -- from metadata line: 'telegram:6432548537'
  channel_type TEXT NOT NULL,       -- 'telegram', 'cron', 'paperclip'
  channel_identifier TEXT NOT NULL, -- '6432548537', 'daily-financial-summary'
  message_count INTEGER NOT NULL DEFAULT 0,
  first_message_at TEXT,            -- ISO datetime
  last_message_at TEXT,             -- ISO datetime
  last_user_message TEXT,           -- first ~60 chars for snippet
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  scanned_at INTEGER NOT NULL,     -- unix epoch
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(agent_id, filename)
);
CREATE INDEX IF NOT EXISTS idx_nanobot_sessions_agent ON nanobot_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_nanobot_sessions_channel ON nanobot_sessions(channel_type);
CREATE INDEX IF NOT EXISTS idx_nanobot_sessions_last_message ON nanobot_sessions(last_message_at);
```

### Pattern 5: Chunked JSONL Reading for Large Files
**What:** Read large JSONL files without loading entirely into memory
**When to use:** Session content API for 10MB+ files
**Example:**
```typescript
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

async function* readJSONLStream(filePath: string): AsyncGenerator<object> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {
      continue // skip malformed lines
    }
  }
}

// API returns paginated messages:
// GET /api/nanobot-sessions/stefany/telegram_6432548537?offset=0&limit=100
// Returns { messages: [...], total: 223, hasMore: true }
```

### Anti-Patterns to Avoid
- **Loading entire JSONL into memory on the server:** Use streaming readline for content. Only full-read for small files (<1MB).
- **Re-parsing JSONL on every list request:** Session metadata must be cached in SQLite. Only re-scan when file mtime changes.
- **Rendering all messages at once in the DOM:** For sessions with 200+ messages, render in chunks or use CSS `overflow-y: auto` with lazy loading. The CONTEXT specifies no complex virtualization -- chunked pagination is sufficient.
- **Duplicating Recharts patterns:** The existing `token-dashboard-panel.tsx` and `agent-cost-panel.tsx` have battle-tested chart code. Reuse `ResponsiveContainer`, color schemes, and formatting utilities.
- **Creating separate state stores:** Extend the existing Zustand `useMissionControl` store, do not create separate stores.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom HTML sanitizer + parser | `react-markdown` + `remark-gfm` (already installed) | XSS safety, table/code block support |
| Date filtering | Custom date math | Quick presets with simple timestamp comparison | Presets (Today/7d/30d/All) are simpler than calendar pickers |
| Chart rendering | Custom SVG charts | Recharts (already installed, ^3.7.0) | Responsive, tooltip, legend all built-in |
| Scrolling management | Custom scroll observers | Native `scrollIntoView()` + `useRef` for jump-to-bottom | Browser API is sufficient for the described UX |
| File watching | Custom fs.watch | Poll-based sync with `useSmartPoll` | fs.watch is unreliable on macOS; existing poll pattern works |
| Line-by-line reading | Custom buffer management | Node.js `readline.createInterface()` | Built-in, handles line boundaries correctly, backpressure aware |

**Key insight:** This phase is almost entirely composed of patterns already proven in the codebase. The `claude-sessions.ts` module is a template for `nanobot-sessions.ts`. The token panels are extensions of existing Recharts panels.

## Common Pitfalls

### Pitfall 1: JSONL Metadata Line Confusion
**What goes wrong:** The first line of every nanobot JSONL file is a metadata object (`_type: "metadata"`), not a message. Treating it as a message corrupts the chat timeline.
**Why it happens:** Parser iterates all lines without checking `_type`.
**How to avoid:** Skip any line with `_type === 'metadata'` when building message arrays. Use the metadata line to extract the `key` field for channel/identifier parsing.
**Warning signs:** First "message" in chat has no `role` field, or shows raw JSON.

### Pitfall 2: Token Data Asymmetry Between Sources
**What goes wrong:** Nanobot JSONL session entries do NOT include `usage` fields (input_tokens, output_tokens). Only Claude Code sessions have per-message token usage. Assuming both sources have token data will produce nulls.
**Why it happens:** Nanobot gateway doesn't expose per-message token accounting in the session JSONL.
**How to avoid:** Token tracking sources: (1) Claude Code sessions from `claude_sessions` table (already scanned by `claude-sessions.ts`), (2) `token_usage` table rows created by MC API routes. Nanobot session messages contribute message counts but NOT token counts. The "per-agent" breakdown on the Tokens panel attributes Claude Code session tokens by project slug and the `token_usage` table rows by session_id/agent attribution.
**Warning signs:** All nanobot agents show zero tokens. Verify by checking that Claude Code session data flows through.

### Pitfall 3: URL Routing with Catch-All Segments
**What goes wrong:** The existing `panelFromUrl = pathname.slice(1)` yields `sessions/stefany/telegram_6432548537` as a single string. The `ContentRouter` switch statement matches on `tab` which won't match `case 'sessions':` for deep-linked URLs.
**Why it happens:** ContentRouter does exact string matching, not prefix matching.
**How to avoid:** Change ContentRouter to check `tab.startsWith('sessions')` or split on `/` and match the first segment. Pass the full pathname to the sessions panel and let it parse agent/session segments internally.
**Warning signs:** Deep links to `/sessions/stefany/telegram_6432548537` render the Dashboard (default case) instead of Sessions.

### Pitfall 4: Scroll Position on Session Content Load
**What goes wrong:** User expects to start at the bottom (newest messages) but the container renders at the top. After loading, `scrollTop` is 0.
**Why it happens:** React renders top-to-bottom. Must explicitly scroll after render.
**How to avoid:** Use `useEffect` with `scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight })` after messages load. Use `useLayoutEffect` for synchronous scroll before paint if flicker occurs.
**Warning signs:** Chat loads showing the oldest messages, user must manually scroll to bottom.

### Pitfall 5: File Size Check Before Full Read
**What goes wrong:** Attempting to `readFileSync` a 50MB JSONL file blocks the server for seconds, causing request timeouts and freezing other API calls.
**Why it happens:** Synchronous full-file read in an API route.
**How to avoid:** Always check `statSync(filePath).size` first. For files >1MB, use streaming readline. For the session list API (metadata only), always read from SQLite cache -- never read file content.
**Warning signs:** API response times spike when large session files exist.

### Pitfall 6: Stale Session Cache
**What goes wrong:** A session file gets new messages but the SQLite cache shows old message count and last_message_at timestamp.
**Why it happens:** Sync interval too long or file mtime not checked.
**How to avoid:** During sync, compare `file_size_bytes` and file mtime against cached values. Only re-parse files that changed. Sync interval: 60 seconds via `useSmartPoll` on the health monitor or a dedicated sync timer.
**Warning signs:** Session list shows "42 msgs" but clicking reveals 80+ messages.

## Code Examples

### Nanobot Session Parser (server-side)
```typescript
// Source: Extrapolated from existing claude-sessions.ts pattern + JSONL file analysis
import { readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

interface NanobotSessionMeta {
  agentId: string
  filename: string
  sessionKey: string
  channelType: string
  channelIdentifier: string
  messageCount: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  lastUserMessage: string | null
  fileSizeBytes: number
}

function scanAgentSessions(agentId: string, sessionsDir: string): NanobotSessionMeta[] {
  const results: NanobotSessionMeta[] = []
  let files: string[]
  try {
    files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
  } catch { return results }

  for (const filename of files) {
    const filePath = join(sessionsDir, filename)
    const stat = statSync(filePath)
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    if (lines.length === 0) continue

    // Parse metadata line
    let sessionKey = filename.replace('.jsonl', '')
    let channelType = 'unknown'
    let channelIdentifier = sessionKey
    try {
      const meta = JSON.parse(lines[0])
      if (meta._type === 'metadata' && meta.key) {
        sessionKey = meta.key
        const colonIdx = meta.key.indexOf(':')
        if (colonIdx !== -1) {
          channelType = meta.key.slice(0, colonIdx)
          channelIdentifier = meta.key.slice(colonIdx + 1)
        }
      }
    } catch {}

    // Count messages (skip metadata lines)
    const messages = lines.filter(line => {
      try { return JSON.parse(line)._type !== 'metadata' } catch { return false }
    })

    let firstMessageAt: string | null = null
    let lastMessageAt: string | null = null
    let lastUserMessage: string | null = null

    for (const line of messages) {
      try {
        const entry = JSON.parse(line)
        if (entry.timestamp) {
          if (!firstMessageAt) firstMessageAt = entry.timestamp
          lastMessageAt = entry.timestamp
        }
        if (entry.role === 'user' && entry.content) {
          lastUserMessage = entry.content.slice(0, 60)
        }
      } catch {}
    }

    results.push({
      agentId,
      filename,
      sessionKey,
      channelType,
      channelIdentifier,
      messageCount: messages.length,
      firstMessageAt,
      lastMessageAt,
      lastUserMessage,
      fileSizeBytes: stat.size,
    })
  }
  return results
}
```

### Chat Bubble Component Pattern
```typescript
// Source: Follows existing component patterns in the codebase
// 'use client'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  agentIcon?: string
  toolName?: string
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>
}

function MessageBubble({ role, content, timestamp, agentIcon, toolName, toolCalls }: MessageBubbleProps) {
  const isUser = role === 'user'
  const isTool = role === 'tool'

  return (
    <div className={cn('flex gap-2 mb-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-secondary text-sm">
        {isUser ? '\u{1F464}' : isTool ? '\u{1F527}' : (agentIcon || '\u{1F916}')}
      </div>

      {/* Bubble */}
      <div className={cn(
        'max-w-[75%] rounded-lg px-3 py-2 text-sm',
        isUser
          ? 'bg-primary/15 text-foreground'
          : 'bg-muted text-foreground'
      )}>
        {isTool ? (
          <ToolResultDisplay name={toolName} content={content} />
        ) : (
          <MarkdownRenderer content={content} />
        )}
        <div className="text-[10px] text-muted-foreground mt-1">
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
```

### Unified Token Aggregation
```typescript
// Source: Extends existing claude-sessions.ts + token_usage table patterns
// Server-side aggregation for the Tokens panel

interface UnifiedTokenStats {
  summary: {
    totalInputTokens: number
    totalOutputTokens: number
    totalSessions: number
    mostActiveAgent: string
    avgTokensPerSession: number
  }
  byAgent: Record<string, { inputTokens: number; outputTokens: number; sessionCount: number }>
  byModel: Record<string, { inputTokens: number; outputTokens: number }>
  timeline: Array<{ date: string; inputTokens: number; outputTokens: number }>
}

// Data sources:
// 1. claude_sessions table (already populated by syncClaudeSessions)
//    - Has: input_tokens, output_tokens, model, project_slug
//    - Agent attribution: map project_slug to agent (heuristic or config)
// 2. token_usage table (populated by MC API routes)
//    - Has: model, input_tokens, output_tokens, session_id, created_at
// Both are already in SQLite -- query joins them for unified view.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Gateway-only session listing (OC era) | Filesystem JSONL scanning | Phase 2 (2026-03-09) | Sessions come from filesystem, not gateway API |
| Single token dashboard | Need unified nanobot + Claude Code view | Phase 4 (this phase) | Must merge two token data sources |
| Flat pathname routing | Catch-all `[[...panel]]` with segments | Already in place | Deep links require segment parsing |

**Deprecated/outdated:**
- The existing `SessionDetailsPanel` (`session-details-panel.tsx`) is a legacy panel from the gateway era. It manages gateway sessions (active/idle/tokens/flags), NOT nanobot JSONL file sessions. It will remain for backward compat but the new Sessions panel is separate.
- The existing `TokenDashboardPanel` is a Claude Code-only token view. The new Tokens panel replaces/extends it with unified data.

## Open Questions

1. **Agent-to-Project-Slug Mapping for Claude Code Token Attribution**
   - What we know: Claude Code sessions are stored by project slug (e.g., `-Users-designmac-projects-nanobot_mission_control`), not by agent name. Nanobot agents don't have project slugs.
   - What's unclear: How to attribute Claude Code token usage to specific nanobot agents (if at all).
   - Recommendation: Show Claude Code token usage separately as "Claude Code" in the agent breakdown. Don't force agent attribution. The user wants to see total usage, and Claude Code usage is by project, not by agent.

2. **Nanobot Sessions Lack Per-Message Token Data**
   - What we know: Verified by examining actual JSONL files -- nanobot session entries have `role`, `content`, `timestamp`, `tool_calls` but NO `usage` or token fields.
   - What's unclear: Whether the nanobot gateway has an API for token usage that could be polled.
   - Recommendation: For TOKN-01, extract tokens from Claude Code sessions (which have them). Show nanobot session MESSAGE counts (available) but NOT token counts (not available in JSONL). The "token usage" for the Tokens panel comes from `claude_sessions` and `token_usage` tables, not from nanobot JSONL files.

3. **Sync Interval Selection**
   - What we know: Health monitor polls every 30s. Claude session sync is triggered on API request.
   - What's unclear: Optimal sync frequency for session metadata.
   - Recommendation: 60-second sync interval using existing `useSmartPoll` pattern. Check file mtime before re-parsing to skip unchanged files. This balances freshness with performance.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:all` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | JSONL session scanning per agent | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "scan" --reporter=verbose` | Wave 0 |
| SESS-02 | JSONL message parsing (user/assistant/tool) | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "parse" --reporter=verbose` | Wave 0 |
| SESS-03 | Session search and date filtering | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "filter" --reporter=verbose` | Wave 0 |
| SESS-04 | Large file streaming read | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "stream" --reporter=verbose` | Wave 0 |
| TOKN-01 | Token extraction from session data | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "extract" --reporter=verbose` | Wave 0 |
| TOKN-02 | Per-agent token aggregation | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "agent" --reporter=verbose` | Wave 0 |
| TOKN-03 | Per-model token breakdown | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "model" --reporter=verbose` | Wave 0 |
| TOKN-04 | Token trend time-series | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "trend" --reporter=verbose` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm test:all`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/nanobot-sessions.test.ts` -- covers SESS-01, SESS-02, SESS-03, SESS-04
- [ ] `src/lib/__tests__/token-aggregation.test.ts` -- covers TOKN-01, TOKN-02, TOKN-03, TOKN-04
- [ ] Test fixtures: sample JSONL files in `src/test/fixtures/` for deterministic testing

*(These are the only gaps -- vitest is already configured and running.)*

## Sources

### Primary (HIGH confidence)
- Filesystem analysis: actual nanobot JSONL files at `~/.nanobot/workspace/agents/{stefany,cody}/sessions/`
- Codebase inspection: `claude-sessions.ts`, `token-dashboard-panel.tsx`, `agent-cost-panel.tsx`, `agent-health.ts`, `agent-discovery.ts`, `markdown-renderer.tsx`, `migrations.ts`, `store/index.ts`, `nav-rail.tsx`, `page.tsx`
- `package.json`: confirmed all dependencies and versions

### Secondary (MEDIUM confidence)
- Recharts v3.7.0 API patterns verified from existing working code in token-dashboard-panel.tsx

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase and filesystem inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use, versions confirmed from package.json
- Architecture: HIGH -- patterns directly extrapolated from existing codebase (claude-sessions.ts, token panels, navigation)
- Pitfalls: HIGH -- verified by examining actual JSONL files and existing code behavior
- JSONL format: HIGH -- confirmed by reading actual production session files from two agents

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no external dependencies or fast-moving APIs)
