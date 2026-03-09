# Research Summary: Nanobot Mission Control -- Additional Stack

**Domain:** AI agent operations dashboard (brownfield, nanobot-native)
**Researched:** 2026-03-09
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

The existing Mission Control fork provides a solid foundation with Next.js 16, React 19, TypeScript, SQLite, Zustand, and a mature component library including react-markdown, recharts, and @xyflow/react. The core question is: what additional libraries are needed to transform this from an OpenClaw-protocol dashboard into a nanobot-native operations console with filesystem-based agent management?

The answer is surprisingly conservative -- six new production dependencies. Nanobot agents are filesystem-centric (markdown memory files, JSONL session logs, shell launch scripts, HTTP gateway ports), so the additional tooling centers on filesystem watching (chokidar), process lifecycle management (tree-kill + pidusage), log streaming to the browser (@melloware/react-logviewer), markdown editing (@uiw/react-md-editor), and efficient large-file handling (stream-json + @tanstack/react-virtual). The existing `ws` library already in deps handles WebSocket needs, and `react-markdown` already handles read-only rendering.

The biggest risk area is the log streaming pipeline -- getting real-time updates from agent JSONL files and gateway stdout into the browser efficiently requires careful coordination between chokidar (server-side file watching), SSE or WebSocket transport (already supported via existing event-bus patterns), and @melloware/react-logviewer (client-side rendering with ANSI support and virtualization). This pipeline is the most architecturally novel part and should be built early to validate the approach.

Notable decisions include rejecting node-pty and xterm.js (interactive terminal emulation is unnecessary since agents communicate via HTTP gateways), rejecting CodeMirror/Monaco for markdown editing (massive bundle overkill for editing 50-line memory files), and preferring chokidar v4 over v5 (v5 is ESM-only which creates compatibility friction with Next.js CJS internals).

## Key Findings

**Stack:** 6 new production deps (chokidar, tree-kill, pidusage, @uiw/react-md-editor, @melloware/react-logviewer, stream-json) + 1 utility (@tanstack/react-virtual). Most existing deps are reusable as-is. Remove deprecated `reactflow` (replaced by `@xyflow/react` already in deps).
**Architecture:** Dual data plane -- SQLite for MC-owned data (tasks, users, registry), filesystem for agent-owned data (memory, sessions, logs). Read-through pattern, not sync-and-cache.
**Critical pitfall:** Process zombie management (tree-kill for process trees), chokidar watcher leaks (singleton pattern), and JSONL blocking reads (stream-json for async parsing).

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation (OpenClaw Strip + Config)** - Clean the fork first
   - Addresses: Remove OpenClaw code, update config to NANOBOT_* env vars
   - Libraries: None new (infrastructure work)
   - Avoids: Building nanobot features on top of OpenClaw dead code

2. **Agent Discovery and Health** - Build the foundation for monitoring
   - Addresses: Agent registry, process health monitoring, filesystem scanning
   - Libraries: chokidar ^4.0.3, pidusage ^4.0.1
   - Avoids: Building UI before backend agent integration exists

3. **Agent Lifecycle Control** - Start/stop/restart before anything else interactive
   - Addresses: Process management, launch script integration
   - Libraries: tree-kill ^1.2.2, existing child_process spawn
   - Avoids: Needing to SSH into the machine to restart crashed agents

4. **Log Streaming and Session Viewer** - The architecturally riskiest piece
   - Addresses: Real-time log viewing, JSONL session browsing
   - Libraries: @melloware/react-logviewer ^8.5.0, stream-json, @tanstack/react-virtual ^3.13.21, chokidar
   - Avoids: Building on unvalidated streaming architecture

5. **Memory Editor and Gateway Integration** - Interactive features
   - Addresses: Edit MEMORY.md, communicate with agents via HTTP gateway
   - Libraries: @uiw/react-md-editor, ws (existing), fetch (built-in)
   - Avoids: Building complex integration before basic control works

**Phase ordering rationale:**
- Foundation strip must be first -- every subsequent feature builds on a clean base
- Discovery/health before lifecycle control because you must know which agents exist before managing them
- Lifecycle control before log viewing because running agents produce logs to view
- Log streaming validates the most complex architecture pipeline (chokidar + SSE + react-logviewer)
- Memory editing and gateway integration are independent features that can be built last

**Research flags for phases:**
- Phase 4 (Log Streaming): Likely needs deeper research on SSE backpressure handling and @melloware/react-logviewer configuration for JSONL (vs plain log) format
- Phase 5 (Gateway Integration): May need research on nanobot gateway HTTP API endpoints and message bus protocol
- Phase 1, 2, 3: Standard patterns, unlikely to need additional research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core library choices well-verified via WebSearch. Exact latest versions for @uiw/react-md-editor and stream-json from training data (could not verify via npm CLI due to tool access). |
| Features | HIGH | Feature requirements are clear from PROJECT.md. Library-to-feature mapping is straightforward. Parallel research confirmed competitive landscape. |
| Architecture | MEDIUM-HIGH | Dual data plane pattern validated by codebase analysis. Read-through filesystem pattern is sound. Log streaming pipeline is the main uncertainty. |
| Pitfalls | HIGH | Comprehensive pitfall coverage from parallel research covering fork drift, process management, filesystem, SSE, and security concerns. |

## Gaps to Address

- Exact nanobot gateway HTTP API contract (what endpoints agents expose, what request/response formats)
- Agent process PID tracking mechanism (do launch scripts write PID files? How to discover running agent PIDs?)
- JSONL session file format specification (what fields per line, how conversations are delimited)
- @melloware/react-logviewer v8.5.0 stability -- very recently published, may have breaking changes vs v7.x
- Cloudflare Tunnel setup for remote WebSocket/SSE proxying (affects log streaming architecture)
- chokidar v4 vs v5 compatibility with Next.js 16 -- verify at install time (v5 is ESM-only)

---

*Research summary: 2026-03-09*
