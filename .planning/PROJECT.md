# Nanobot Mission Control

## What This Is

A nanobot-native operations dashboard forked from builderz-labs/mission-control. It provides full lifecycle control over nanobot agents (Stefany, Cody, and future agents) — monitoring health, managing memory, and viewing activity — all from a single web UI. Built for multi-user access with role-based permissions.

## Core Value

At a glance, know whether every nanobot agent is alive, healthy, and doing what it should be — and if not, fix it from the dashboard.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inherited from forked MC codebase. -->

- ✓ Next.js web application with SQLite persistence — existing
- ✓ Authentication system (session + API key) — existing
- ✓ RBAC (viewer/operator/admin roles) — existing
- ✓ Kanban task board with drag-and-drop — existing
- ✓ Real-time activity feed via SSE — existing
- ✓ Webhook system with delivery history and retry — existing
- ✓ Responsive dashboard UI with Tailwind CSS — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Nanobot agent health monitoring (process alive/dead, last activity, error state, channel status)
- [ ] Full agent lifecycle control (start, stop, restart agents from dashboard)
- [ ] Agent memory viewer and editor (MEMORY.md, SOUL.md, IDENTITY.md, sessions)
- [ ] Nanobot gateway integration (health/status queries via agent HTTP gateway ports)
- [ ] Agent session viewer (browse JSONL conversation logs)
- [ ] Token usage tracking (volume and trends, no cost calculation)
- [ ] Nanobot agent registry (auto-discover agents from ~/.nanobot/workspace/agents/)
- [ ] Strip OpenClaw gateway protocol and replace with nanobot-native API layer
- [ ] Channel status monitoring (Telegram, Discord connection health per agent)
- [ ] Cloudflare Tunnel support for remote access
- [ ] Multi-agent overview dashboard (all agents at a glance)

### Out of Scope

- Cost/dollar tracking — subscription plans don't have per-token billing
- OpenClaw gateway protocol — replaced entirely with nanobot-native integration
- Ed25519 device identity handshake — unnecessary for nanobot architecture
- Multi-gateway discovery — agents are known via filesystem, not discovered via protocol
- Mobile app — web-first
- Agent-to-agent messaging via MC — agents communicate through their own message bus
- Chat/messaging to agents via dashboard — redundant with Telegram and future chat solutions
- Task dispatch to agents via dashboard — agents receive work through their own channels
- Google Sign-In OAuth — basic auth + API keys sufficient for v1

## Context

This is a brownfield project — a fork of builderz-labs/mission-control (Next.js 16, React 19, TypeScript 5.7, SQLite). The existing codebase provides a solid UI foundation (kanban, activity feed, Recharts, auth/RBAC) but is architected around the OpenClaw agent protocol. The core work is replacing OpenClaw integration with nanobot-native communication.

**Nanobot architecture:**
- Agents run as isolated processes with separate HOME directories
- Each agent has its own gateway HTTP server on a unique port (e.g., Stefany: 18793, Cody: 18792)
- Agent state lives in the filesystem: JSONL sessions, markdown memory, config JSON
- Communication happens via async message bus (inbound/outbound queues)
- Launch scripts manage agent processes (launch-stefany.sh, launch-cody.sh)
- Agent workspace: `~/.nanobot/workspace/agents/{name}/`
- Agent homes: `~/.nanobot-{name}-home/`

**Existing MC codebase (from codebase map):**
- 186 commits, 148 E2E tests, 28 feature panels
- Next.js 16 / React 19 / TypeScript 5.7 / SQLite (WAL mode)
- Zustand for state management, Recharts for visualizations
- Well-structured with API routes, server actions, and component library

## Constraints

- **Tech stack**: Keep Next.js/React/TypeScript/SQLite foundation from MC fork
- **Compatibility**: Must work with existing nanobot agent structure without requiring agent-side changes
- **Filesystem access**: Dashboard needs read/write access to nanobot workspace directories
- **Process management**: Must be able to spawn/kill agent gateway processes
- **Network**: Agents expose HTTP gateways on localhost ports; dashboard communicates via these

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork MC instead of building from scratch | Reuse proven UI (kanban, auth, RBAC, charts) — ~60% deletion, 30% rewiring, 10% new | — Pending |
| Strip OpenClaw, go nanobot-native | Bridge approach creates permanent translation layer maintenance burden | — Pending |
| Read agent state from filesystem | Nanobot stores everything in markdown/JSONL files — direct reads are simplest | — Pending |
| Cloudflare Tunnels for remote access | Zero-trust access without opening ports, user preference over Tailscale | — Pending |
| Token volume only, no cost tracking | Subscription plans make per-token cost calculation meaningless | — Pending |
| Keep webhook system | Enables GitHub/Telegram integration from day one | — Pending |

---
*Last updated: 2026-03-09 after initialization*
