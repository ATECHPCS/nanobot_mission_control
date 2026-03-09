# Technology Stack: Additional Libraries for Nanobot Mission Control

**Project:** Nanobot Mission Control
**Researched:** 2026-03-09
**Focus:** Additional libraries needed on top of existing Next.js 16 / React 19 / TypeScript 5.7 / SQLite stack
**Overall confidence:** MEDIUM-HIGH

## Existing Stack (Keep As-Is)

Already in place from the MC fork. **Do not re-research or replace these:**

| Technology | Version | Role |
|------------|---------|------|
| Next.js | ^16.1.6 | App Router, API routes, SSR |
| React | ^19.0.1 | UI rendering |
| TypeScript | ^5.7.2 | Type safety |
| better-sqlite3 | ^12.6.2 | Embedded database |
| Zustand | ^5.0.11 | Client-side state |
| Zod | ^4.3.6 | Runtime validation |
| Recharts | ^3.7.0 | Charts/visualizations |
| react-markdown | ^10.1.0 | Markdown rendering (read-only) |
| remark-gfm | ^4.0.1 | GFM support for react-markdown |
| Pino | ^10.3.1 | Structured logging |
| ws | ^8.19.0 | WebSocket types |
| Tailwind CSS | ^3.4.17 | Utility CSS |
| Playwright | ^1.51.0 | E2E testing |
| Vitest | ^2.1.5 | Unit testing |

## Recommended Additional Stack

### 1. Filesystem Watching -- chokidar

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| chokidar | ^4.0.3 | Watch nanobot agent directories for state changes | De facto standard (30M+ repos). v4 chosen over v5 because v4 supports dual ESM/CJS (Next.js uses CJS internally in some codepaths). v4 reduced deps from 13 to 1. Uses native fs.watch -- no polling, low CPU. |

**Confidence:** HIGH -- chokidar is the most battle-tested fs-watching library in the Node.js ecosystem.

**Why chokidar and not raw `fs.watch`:** Node's native `fs.watch` has well-documented cross-platform inconsistencies (reports filenames as `null` on Linux, fires duplicate events on macOS, doesn't recurse on all platforms). Chokidar normalizes all of this. For watching `~/.nanobot/workspace/agents/` and agent home directories, reliability is non-negotiable.

**Why v4 and not v5:** v5 is ESM-only and was released November 2025. Next.js 16 still has CJS internals for server-side module resolution. Using v4 (which supports both ESM and CJS) avoids import compatibility issues. v4 has the same core functionality -- v5 only changed the module system. Revisit when Next.js goes fully ESM.

**What this enables:**
- Detect MEMORY.md / SOUL.md / IDENTITY.md changes in real time
- Watch JSONL session files for new conversation entries
- Monitor agent process PID files for health status
- Auto-discover new agents added to `~/.nanobot/workspace/agents/`

---

### 2. Process Management -- tree-kill + pidusage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tree-kill | ^1.2.2 | Kill agent process trees cleanly | 18M weekly downloads. Handles macOS (pgrep), Linux (ps), Windows (taskkill). Kills entire process tree, not just root PID -- critical for agent gateways that spawn child processes. |
| pidusage | ^4.0.1 | Get CPU/memory stats for agent processes | Cross-platform process monitoring. Returns CPU %, memory bytes, elapsed time per PID. No native addons required. |

**Confidence:** HIGH for tree-kill, MEDIUM for pidusage.

**Why these and not PM2 or systemd integration:** PM2 is a full process manager that would conflict with nanobot's own launch scripts (`launch-stefany.sh`, `launch-cody.sh`). The dashboard should _observe and control_ existing processes, not _own_ them. `tree-kill` + `pidusage` are surgical tools that complement the existing `child_process.spawn` wrapper in `src/lib/command.ts`.

**Why not node-pty:** node-pty (^1.1.0) is a native C++ addon for pseudoterminal emulation. It requires Python3 + make + g++ at install time and adds native compilation complexity. For this project, agents are managed via their HTTP gateway ports and launch shell scripts -- we do not need interactive terminal sessions with agents. The dashboard spawns/kills processes and reads their logs from files. node-pty is overkill.

**What this enables:**
- Start agents: `spawn('bash', ['launch-stefany.sh'])` via existing `runCommand`
- Stop agents: `treeKill(pid, 'SIGTERM')` to cleanly shut down gateway + children
- Health monitoring: `pidusage(pid)` to get CPU/memory for agent status cards
- Restart: kill + re-spawn

**Process management pattern:**
```typescript
// Existing src/lib/command.ts handles spawn -- extend it:
import treeKill from 'tree-kill';
import pidusage from 'pidusage';

// Stop an agent process and all its children
export function killAgentProcess(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    treeKill(pid, 'SIGTERM', (err) => err ? reject(err) : resolve());
  });
}

// Get resource usage for agent health cards
export async function getAgentResourceUsage(pid: number) {
  return pidusage(pid); // { cpu: 12.5, memory: 52428800, elapsed: 360000 }
}
```

---

### 3. Markdown Editing -- @uiw/react-md-editor

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @uiw/react-md-editor | ^4.0.5 | Edit MEMORY.md, SOUL.md, IDENTITY.md files | Lightweight (~4.6 kB gzipped). Built on native textarea, not CodeMirror/Monaco (no heavy editor bundle). GFM support, live preview, toolbar. TypeScript types included. Active maintenance (December 2024 release). |

**Confidence:** MEDIUM -- version number needs verification against npm registry, but the library is actively maintained and well-suited.

**Why @uiw/react-md-editor and not CodeMirror (@uiw/react-codemirror + @codemirror/lang-markdown):**
- **Bundle size:** CodeMirror 6 adds ~150-200 kB to the client bundle. @uiw/react-md-editor adds ~4.6 kB. Agent memory files are simple markdown -- no syntax highlighting for 20+ languages needed.
- **Complexity:** CodeMirror requires assembling extensions (language, theme, keybindings). react-md-editor is a single component drop-in.
- **Existing pattern:** The codebase already uses `react-markdown` for rendering. `@uiw/react-md-editor` uses a compatible markdown pipeline, so rendered output looks consistent.

**Why not Monaco:** Monaco is 2-5 MB of client-side JavaScript. It is built for IDE-class editing. Editing a 50-line MEMORY.md file does not warrant an IDE.

**What this enables:**
- Edit agent MEMORY.md with live preview in a dashboard panel
- Edit SOUL.md and IDENTITY.md with GFM support (tables, checkboxes)
- Save changes back to disk via API route (using existing fs access pattern)

**Pattern:**
```typescript
import MDEditor from '@uiw/react-md-editor';

// In agent memory editor panel:
<MDEditor
  value={memoryContent}
  onChange={setMemoryContent}
  preview="live"
  height={400}
/>
```

---

### 4. Log Viewing -- @melloware/react-logviewer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @melloware/react-logviewer | ^8.5.0 | View agent JSONL conversation logs and gateway output | Supports SSE (EventSource) and WebSocket streaming natively. Built-in ANSI color rendering. Virtualized rendering (handles 100MB+ files). Based on react-virtualized for scroll performance. Fork of Mozilla's react-lazylog with active maintenance. |

**Confidence:** MEDIUM -- version is recent (published very recently per npm), active maintenance confirmed.

**Why @melloware/react-logviewer and not building custom:**
- Nanobot agents produce JSONL session logs that can be tens of thousands of lines. Naive rendering will crash the browser.
- Built-in SSE/WebSocket support means we can stream tail output directly from an API route to the browser without custom plumbing.
- ANSI color support means agent terminal output renders with proper formatting.
- Already battle-tested -- forked from Mozilla's react-lazylog, which handled production log viewing at Mozilla.

**Why not xterm.js for log viewing:** xterm.js is a terminal _emulator_ -- it expects to be the endpoint of a PTY session. For read-only log viewing, it is architectural overkill and comes with complex state management (cursor position, alternate screen buffer, etc.). @melloware/react-logviewer is purpose-built for this use case.

**Why not raw react-lazylog:** The original react-lazylog by Mozilla is INACTIVE (archived). @melloware/react-logviewer is the maintained fork.

**What this enables:**
- View live-updating agent session logs (JSONL files)
- Stream gateway stdout/stderr to browser in real time via SSE
- Render ANSI-colored terminal output from agent processes
- Handle large log files (10K+ lines) without browser performance issues

**Streaming pattern:**
```typescript
// API route: stream agent log file via SSE
// GET /api/agents/[id]/logs
export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      // Use chokidar to watch the log file, push new lines
      const watcher = chokidar.watch(logFilePath);
      watcher.on('change', () => {
        const newLines = readNewLines(logFilePath, lastOffset);
        controller.enqueue(`data: ${JSON.stringify(newLines)}\n\n`);
      });
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

// Client: <LazyLog url="/api/agents/stefany/logs" stream={true} follow={true} />
```

---

### 5. JSONL Session Parsing -- stream-json (server-side only)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| stream-json | ^1.9.1 | Parse large JSONL session files on the server without loading entire file into memory | Streaming JSON parser. Processes files line-by-line with Node.js streams. Minimal memory footprint even for 100MB+ session files. |

**Confidence:** MEDIUM -- well-established library, but version needs npm verification.

**Why stream-json and not JSON.parse:** Nanobot session files are JSONL (one JSON object per line). A single agent session can produce thousands of conversation entries. Loading the entire file with `readFile` + `JSON.parse` would block the event loop and consume excessive memory. stream-json processes line-by-line as a Node.js stream.

**Why not readline:** Node's built-in `readline` could work but requires manual JSON parsing with error handling for each line. stream-json handles malformed lines, backpressure, and provides a composable pipeline API.

**What this enables:**
- Paginated session viewer (read lines 500-600 of a 10K-line JSONL file)
- Token usage extraction from session entries without loading full file
- Search across session content efficiently

---

### 6. Virtualized Lists -- @tanstack/react-virtual

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tanstack/react-virtual | ^3.13.21 | Virtualize agent lists, session entries, log lines in custom views | Headless (no CSS opinions -- integrates with existing Tailwind). 950+ dependents. Framework-agnostic core. Tiny bundle. Handles dynamic row heights. |

**Confidence:** HIGH -- TanStack is the de facto standard for headless React utilities.

**Why @tanstack/react-virtual and not react-window:** react-window requires fixed row heights and is less actively maintained. @tanstack/react-virtual handles dynamic heights (essential for conversation entries of varying length) and is part of the actively maintained TanStack ecosystem.

**What this enables:**
- Session entry browser (each conversation turn is a variable-height row)
- Agent activity timeline with hundreds of entries
- Token usage table with thousands of rows

---

## Alternatives Considered and Rejected

| Category | Recommended | Rejected | Why Rejected |
|----------|-------------|----------|--------------|
| Filesystem watching | chokidar ^4.0.3 | fs.watch (native) | Cross-platform inconsistencies, no recursive support on all platforms, fires duplicate events on macOS |
| Filesystem watching | chokidar ^4.0.3 | chokidar ^5.0.0 | ESM-only breaks Next.js CJS internals; no functional improvement over v4 |
| Process killing | tree-kill ^1.2.2 | process.kill() | Only kills single PID, not process tree. Agent gateways spawn child processes. |
| Process management | tree-kill + pidusage | PM2 | PM2 owns processes. Dashboard should observe/control, not own. Conflicts with nanobot launch scripts. |
| Process management | tree-kill + pidusage | node-pty ^1.1.0 | Native addon complexity. PTY not needed -- agents communicate via HTTP gateways, not interactive terminals. |
| Markdown editing | @uiw/react-md-editor | @uiw/react-codemirror | 30x larger bundle for simple markdown editing. Over-engineered. |
| Markdown editing | @uiw/react-md-editor | Monaco Editor | 2-5 MB bundle. IDE for editing 50-line markdown files is absurd. |
| Markdown editing | @uiw/react-md-editor | MDXEditor | More feature-rich but heavier and designed for MDX, not plain markdown. |
| Log viewing | @melloware/react-logviewer | react-lazylog | Mozilla original is INACTIVE/archived. @melloware is the maintained fork. |
| Log viewing | @melloware/react-logviewer | @xterm/xterm | Terminal emulator, not log viewer. Overkill for read-only log streaming. |
| Log viewing | @melloware/react-logviewer | Custom + ansi-to-html | ansi-to-html last published 4 years ago (0.7.2). Building custom virtualizer is unnecessary when @melloware/react-logviewer exists. |
| JSONL parsing | stream-json | readline (native) | Manual JSON parsing per line, no backpressure, no composable pipeline. |
| Virtualization | @tanstack/react-virtual | react-window | Fixed row heights only, less actively maintained. |
| Virtualization | @tanstack/react-virtual | react-virtualized | Larger bundle, older API, less maintained than TanStack. |
| WebSocket server | ws (already in deps) | socket.io | socket.io adds a protocol layer. ws is already in the project and sufficient. |
| WebSocket server | ws (already in deps) | next-ws | Patches Next.js internals. Fragile. Custom server approach with ws is more reliable and already proven in codebase. |

## Libraries to Remove from Existing Deps

| Library | Why Remove |
|---------|-----------|
| reactflow ^11.11.4 | Deprecated predecessor of @xyflow/react (already installed). Duplicate bundle weight. |
| @scalar/api-reference-react ^0.8.66 | OpenClaw API docs viewer. Replace with lightweight nanobot API docs or remove entirely. |

## Libraries Already in Deps That Cover Nanobot Needs

| Library | Already Version | Nanobot Use |
|---------|----------------|-------------|
| ws | ^8.19.0 | WebSocket server for real-time log streaming to browser. Already used for OpenClaw gateway -- repurpose for nanobot gateway proxying. |
| react-markdown | ^10.1.0 | Read-only markdown rendering for session viewer, memory preview. Already has a `MarkdownRenderer` component at `src/components/markdown-renderer.tsx`. |
| remark-gfm | ^4.0.1 | GFM tables/checkboxes in agent memory display. Already integrated. |
| recharts | ^3.7.0 | Token usage trend charts, agent health over time. Already integrated. |
| @xyflow/react | ^12.10.0 | Agent network/relationship visualization. Already integrated. |
| pino | ^10.3.1 | Server-side logging for process management operations. Already integrated. |

## Installation

```bash
# New production dependencies
pnpm add chokidar@^4.0.3 tree-kill@^1.2.2 pidusage@^4.0.1 @uiw/react-md-editor @melloware/react-logviewer stream-json @tanstack/react-virtual

# New dev dependencies (types for packages that need them)
pnpm add -D @types/pidusage @types/stream-json

# Remove deprecated/unnecessary deps
pnpm remove reactflow
```

## TypeScript Types

| Package | Types Included | Additional Package |
|---------|---------------|-------------------|
| chokidar | Yes (built-in) | None |
| tree-kill | Yes (built-in) | None |
| pidusage | No | @types/pidusage |
| @uiw/react-md-editor | Yes (built-in) | None |
| @melloware/react-logviewer | Yes (built-in) | None |
| stream-json | Partial | @types/stream-json |
| @tanstack/react-virtual | Yes (built-in) | None |

## Integration Architecture Summary

```
Browser                           Next.js Server                    Filesystem
------                           --------------                    ----------

@uiw/react-md-editor  --------> PUT /api/agents/[id]/memory -----> writeFile(MEMORY.md)
                                                                      |
react-logviewer <---- SSE ------ GET /api/agents/[id]/logs           |
  (ANSI colors,                     |                                |
   virtualized)                     +-- chokidar watches log files --+
                                    +-- stream-json parses JSONL

@tanstack/react-virtual           GET /api/agents
  (session list,                      |
   activity feed)                     +-- pidusage(pid) for health
                                      +-- fs.readdir for discovery

Dashboard buttons  ------------> POST /api/agents/[id]/control
  (start/stop/restart)               |
                                      +-- spawn('bash', ['launch-*.sh'])
                                      +-- treeKill(pid, 'SIGTERM')
```

## Per-Feature Library Mapping

| Feature | Libraries Used |
|---------|---------------|
| Agent health monitoring | pidusage, chokidar |
| Agent lifecycle control (start/stop/restart) | tree-kill, child_process (built-in) |
| Agent memory editor | @uiw/react-md-editor |
| Agent memory viewer | react-markdown (existing) |
| Agent session viewer (JSONL) | stream-json, @tanstack/react-virtual, @melloware/react-logviewer |
| Real-time log streaming | chokidar, @melloware/react-logviewer, ws (existing) |
| Agent registry / auto-discovery | chokidar, fs (built-in) |
| Token usage tracking | stream-json, recharts (existing) |
| Gateway communication | ws (existing) |
| Multi-agent overview dashboard | pidusage, recharts (existing), @xyflow/react (existing) |

## Version Verification Status

| Library | Version | Verified Via | Confidence |
|---------|---------|-------------|------------|
| chokidar | ^4.0.3 | WebSearch (npm), GitHub releases | HIGH |
| tree-kill | ^1.2.2 | WebSearch (npm) | HIGH |
| pidusage | ^4.0.1 | WebSearch (npm) | HIGH |
| @uiw/react-md-editor | ^4.0.5 | WebSearch (npm, GitHub) | MEDIUM -- exact minor version needs npm verify |
| @melloware/react-logviewer | ^8.5.0 | WebSearch (npm) | MEDIUM -- very recent publish, verify stability |
| stream-json | ^1.9.1 | WebSearch (npm) | MEDIUM -- version from training data |
| @tanstack/react-virtual | ^3.13.21 | WebSearch (npm) | HIGH |

## Sources

- [chokidar on GitHub](https://github.com/paulmillr/chokidar) -- v4.0.3 ESM/CJS dual support
- [chokidar on npm](https://www.npmjs.com/package/chokidar) -- version history
- [Migrating chokidar 3.x to 4.x](https://dev.to/43081j/migrating-from-chokidar-3x-to-4x-5ab5) -- breaking changes in v4
- [tree-kill on npm](https://www.npmjs.com/package/tree-kill) -- 18M weekly downloads
- [tree-kill on GitHub](https://github.com/pkrumins/node-tree-kill) -- cross-platform process tree killing
- [pidusage on GitHub](https://github.com/soyuka/pidusage) -- cross-platform CPU/memory monitoring
- [pidusage on npm](https://www.npmjs.com/package/pidusage) -- v4.0.1
- [@uiw/react-md-editor on npm](https://www.npmjs.com/package/@uiw/react-md-editor) -- lightweight markdown editor
- [@uiw/react-md-editor on GitHub](https://github.com/uiwjs/react-md-editor) -- TypeScript, GFM support
- [5 Best Markdown Editors for React](https://strapi.io/blog/top-5-markdown-editors-for-react) -- comparison and bundle sizes
- [@melloware/react-logviewer on npm](https://www.npmjs.com/package/@melloware/react-logviewer) -- SSE/WS/ANSI support
- [@melloware/react-logviewer on GitHub](https://github.com/melloware/react-logviewer) -- maintained fork of react-lazylog
- [react-lazylog (INACTIVE)](https://github.com/mozilla-frontend-infra/react-lazylog) -- original by Mozilla, archived
- [stream-json on npm](https://www.npmjs.com/package/stream-json) -- streaming JSON parser
- [@tanstack/react-virtual on npm](https://www.npmjs.com/package/@tanstack/react-virtual) -- headless virtualization
- [TanStack Virtual docs](https://tanstack.com/virtual/latest) -- API reference
- [node-pty on GitHub](https://github.com/microsoft/node-pty) -- rejected: native addon overhead
- [@xterm/xterm on npm](https://www.npmjs.com/package/@xterm/xterm) -- rejected: terminal emulator overkill for log viewing
- [Next.js WebSocket discussion](https://github.com/vercel/next.js/discussions/58698) -- WebSocket in App Router
- [next-ws on GitHub](https://github.com/apteryxxyz/next-ws) -- rejected: patches Next.js internals
- [ansi-to-html on npm](https://www.npmjs.com/package/ansi-to-html) -- rejected: unmaintained (last publish 4 years ago)
- [@uiw/react-codemirror on npm](https://www.npmjs.com/package/@uiw/react-codemirror) -- rejected: too heavy for simple markdown
- [@codemirror/lang-markdown on npm](https://www.npmjs.com/package/@codemirror/lang-markdown) -- rejected: part of heavy CodeMirror stack

---

*Stack research: 2026-03-09*
