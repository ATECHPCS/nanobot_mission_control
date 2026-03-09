# Feature Research

**Domain:** AI agent operations dashboard (autonomous agent lifecycle management, not chatbot UI)
**Researched:** 2026-03-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-agent overview dashboard | Every tool from LangSmith to AgentOps to ZBrain provides a central view of all agents, their status, and key metrics at a glance. This is the literal landing page. | MEDIUM | MC fork already has a dashboard shell; needs nanobot-native data sources. Show agent name, status (alive/dead/error), last activity timestamp, and channel connectivity per agent. |
| Agent health monitoring (alive/dead/error) | Autonomous agents fail silently. Every production agent platform (Datadog AI monitoring, AgentOps, CrewAI AOP Suite) surfaces process health with color-coded indicators (green/yellow/red). Without this, you are blind. | MEDIUM | Poll agent gateway HTTP ports for liveness. Check process existence. Parse recent JSONL for errors. This is the core value proposition per PROJECT.md. |
| Real-time activity feed | LangSmith traces, AgentOps session replays, Datadog LLM Observability, and Mission Control itself all provide live event streams. Users expect to see what agents are doing right now. | LOW | MC fork already has SSE-based activity feed. Rewire to consume nanobot gateway events instead of OpenClaw. |
| Agent lifecycle control (start/stop/restart) | ZBrain, OpenClaw dashboard, and process management tools all offer lifecycle control. If you can see an agent is dead but cannot restart it from the dashboard, the dashboard is just a read-only status page. | MEDIUM | Execute launch scripts (launch-stefany.sh etc.) and kill processes. Requires child_process spawning with proper signal handling. Safety: confirm dialogs before stop/restart. |
| Session/conversation log viewer | AgentOps session replays, Helicone session replay, Langfuse trace viewer, agent-session-viewer, and agentsview all provide this. Debugging agent behavior requires seeing the full conversation history. | MEDIUM | Read JSONL session files from agent workspace. Render as chat-style timeline with tool calls, user messages, and agent responses. Search and filter by date/keyword. |
| Token usage tracking | LangSmith, AgentOps, Datadog, Langfuse, and CrewAI dashboards all track token consumption. Even without cost tracking (which is out of scope per PROJECT.md), volume and trends reveal usage patterns and anomalies. | MEDIUM | Parse token counts from JSONL session data. Store aggregates in SQLite. Display with Recharts (already in MC fork). Show per-agent, per-model, and trend views. |
| Task board with agent assignment | Mission Control, Claw-Kanban, AgentsBoard, and Agent Board all provide kanban-style task management with agent assignment. This is the "dispatch work" counterpart to "monitor work." | LOW | MC fork already has a full kanban board with drag-and-drop. Rewire agent assignment to use nanobot agent registry instead of OpenClaw gateway agents. |
| Authentication and RBAC | Every multi-user dashboard (LangSmith, Datadog, CrewAI Enterprise, MC fork) implements auth + role-based access. viewer/operator/admin is the standard pattern. | LOW | MC fork already has session + API key auth with viewer/operator/admin roles. Minimal changes needed. |
| Webhook system | MC fork, Agent Board, and enterprise platforms all provide outbound webhooks for integration with GitHub, Slack, and external systems. Enables the dashboard to participate in broader automation workflows. | LOW | MC fork already has webhook delivery with history and retry. Keep as-is. |
| Error and failure visibility | Datadog, AgentOps, and LangSmith all surface errors prominently. Color-coded status, error counts, and filterable error logs are baseline. Autonomous agents that fail without visible errors are the #1 operational nightmare. | MEDIUM | Surface errors from JSONL logs. Show error counts on overview dashboard. Filter activity feed by errors. Red indicators on agent cards. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable. These reflect the nanobot-native, self-hosted, filesystem-aware nature of this project vs. cloud-first SaaS platforms.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Agent memory viewer/editor (MEMORY.md, SOUL.md, IDENTITY.md) | Letta ADE is the only tool with in-context memory editing, and it is for Letta-native agents only. No existing dashboard lets you browse and edit markdown-file-based agent memory. This is a unique nanobot differentiator -- the agent's personality, knowledge, and identity are transparent files you can see and edit in the dashboard. | MEDIUM | Read/write markdown files from agent home directories. Syntax-highlighted editor with save. Show file tree of memory files. This makes the "transparent memory" philosophy of nanobot agents tangible and accessible. |
| Nanobot gateway integration (direct HTTP communication) | Most dashboards observe agents passively via traces/logs. Nanobot Mission Control can actively communicate with agents through their HTTP gateway ports -- sending messages, querying status, dispatching tasks. This makes it a true control plane, not just an observation deck. | HIGH | Implement HTTP client to each agent's gateway port. Handle authentication, timeouts, and connection failures gracefully. This is the foundation for task dispatch, status queries, and interactive agent communication. |
| Filesystem-native agent registry (auto-discovery) | Cloud platforms require agent registration via API. Nanobot agents declare themselves via filesystem convention (~/.nanobot/workspace/agents/). Auto-discovery means zero configuration -- plug in a new agent and the dashboard finds it. No existing competitor does filesystem-based auto-discovery. | LOW | Scan ~/.nanobot/workspace/agents/ directory. Parse agent config files. Watch for new agents with fs.watch or polling. Display discovered agents automatically. |
| Channel status monitoring (Telegram, Discord per agent) | No existing agent dashboard monitors per-agent messaging channel health. Knowing that Stefany's Telegram connection dropped but her Discord is fine is operationally critical for agents that communicate via messaging platforms. | MEDIUM | Query agent gateway for channel status. Show per-channel indicators (connected/disconnected/error) on agent cards. Alert when channels drop. Unique to messaging-platform-integrated agents. |
| Task dispatch via agent gateway | Most kanban-to-agent flows use webhook notifications or polling. Direct HTTP task dispatch to a specific agent gateway with confirmation and status tracking is tighter integration than competitors offer. Agent Board uses heartbeat polling; Claw-Kanban uses webhook; direct dispatch is more reliable and immediate. | MEDIUM | POST task payloads to agent gateway endpoints. Track dispatch status (sent/acknowledged/in-progress/completed/failed). Link task board cards to dispatch results. |
| Cloudflare Tunnel remote access | Most self-hosted dashboards require VPN, Tailscale, or port forwarding for remote access. Built-in Cloudflare Tunnel support provides zero-trust remote access without opening ports. This is a deployment differentiator for self-hosted tools. | LOW | Integration with cloudflared CLI. Configuration UI for tunnel setup. Status indicator for tunnel health. Low complexity because Cloudflare Tunnel is well-documented and the dashboard just needs to manage the tunnel process. |
| Unified multi-agent + multi-channel view | Existing dashboards show either agent status OR channel status, never both unified. A view that shows "Stefany: alive, Telegram connected, Discord connected, 3 tasks in progress, 12k tokens today" in one card is more information-dense than any competitor. | MEDIUM | Composite data aggregation from health checks, channel status, task board, and token tracking. Single-card-per-agent design. This is the "at a glance" value proposition from PROJECT.md made concrete. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems in this context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Cost/dollar tracking per token | LangSmith, AgentOps, and Datadog all do this. Feels like table stakes for "agent operations." | PROJECT.md explicitly scopes this out: subscription plans (Anthropic, OpenAI) do not have meaningful per-token billing. Calculating fake costs from rate cards that do not reflect actual spend creates misleading data. Maintaining price tables across models is ongoing busywork. | Track token volume and trends only. Users who care about costs can correlate volume with their subscription tier externally. |
| Agent-to-agent messaging via dashboard | CrewAI and AutoGen support inter-agent communication. Seems natural to route it through the control plane. | PROJECT.md scopes this out. Nanobot agents have their own message bus. Routing inter-agent communication through the dashboard creates a single point of failure and adds latency. If the dashboard goes down, agents cannot talk to each other. | Let agents communicate via their own message bus. Dashboard observes but does not mediate. Show inter-agent message activity in the activity feed for visibility. |
| Visual workflow/DAG builder | AutoGen Studio and CrewAI offer drag-and-drop visual workflow editors. Looks impressive in demos. | Nanobot agents are autonomous -- they decide what to do based on their SOUL and memory, not a predefined workflow graph. A DAG builder implies deterministic orchestration, which contradicts the autonomous agent model. Building one is HIGH complexity for a paradigm that does not match the architecture. | Task board with dependencies (already in MC fork) serves the "what needs to happen" use case. Agent autonomy handles the "how to do it" part. |
| LLM playground / prompt engineering | LangSmith and Langfuse both offer embedded playgrounds for testing prompts. | Nanobot agents have their personality and behavior defined in SOUL.md and IDENTITY.md files, not in prompt templates. A playground for testing prompts is solving a problem that does not exist in this architecture. Agent behavior is tuned by editing memory files. | Memory editor (MEMORY.md, SOUL.md, IDENTITY.md) IS the prompt engineering tool for nanobot agents. |
| Mobile app | Natural request for on-the-go monitoring. | PROJECT.md scopes this out. The web UI is responsive (Tailwind CSS). Building and maintaining a native mobile app doubles the frontend surface area for marginal value. | Responsive web UI works on mobile browsers. Cloudflare Tunnel enables secure mobile access. Push notifications via webhook-to-Telegram/Discord bridge for alerts. |
| Google/OAuth sign-in | Standard for SaaS products. Users expect SSO. | PROJECT.md scopes this out for v1. This is a self-hosted tool for a small team (1-3 operators). OAuth adds external dependency and configuration complexity. | Basic auth + API keys for v1. RBAC covers the access control needs. Revisit if user count grows beyond 5. |
| Real-time everything (WebSocket for all data) | Feels modern and responsive. LangSmith and Datadog use real-time streams. | SSE (already in MC fork) handles the activity feed well. WebSocket for every data point (token counts, task status, agent health) creates connection management complexity and does not meaningfully improve UX for data that changes every few seconds, not milliseconds. | SSE for activity feed (real-time). Polling with smart intervals for dashboard metrics (5-30 second refresh). Full WebSocket only if a specific use case demands sub-second updates. |
| Multi-tenant / multi-workspace | Enterprise platforms like CrewAI AOP Suite support this. MC fork has Super Admin panel. | This is a personal/small-team tool managing a handful of agents on one machine. Multi-tenancy adds database isolation complexity, permission boundaries, and UI chrome for a use case that does not exist yet. | Single workspace. RBAC roles handle access control. Revisit only if managing agents across multiple machines becomes a requirement. |

## Feature Dependencies

```
[Agent Health Monitoring]
    |--requires--> [Nanobot Agent Registry] (must know which agents exist to monitor them)
    |--requires--> [Gateway Integration] (health checks via HTTP port liveness)

[Agent Lifecycle Control (start/stop/restart)]
    |--requires--> [Nanobot Agent Registry] (must know agent launch scripts and process info)
    |--requires--> [Agent Health Monitoring] (must know current state before changing it)

[Session/Conversation Log Viewer]
    |--requires--> [Nanobot Agent Registry] (must know agent workspace paths to find JSONL files)

[Agent Memory Viewer/Editor]
    |--requires--> [Nanobot Agent Registry] (must know agent home directories to find memory files)

[Token Usage Tracking]
    |--requires--> [Session/Conversation Log Viewer] (tokens extracted from same JSONL session data)

[Task Dispatch via Gateway]
    |--requires--> [Gateway Integration] (sends tasks via HTTP)
    |--requires--> [Task Board] (tasks originate from kanban board)

[Channel Status Monitoring]
    |--requires--> [Gateway Integration] (queries channel health via agent gateway)
    |--requires--> [Agent Health Monitoring] (agent must be alive to have channel status)

[Multi-Agent Overview Dashboard]
    |--requires--> [Agent Health Monitoring]
    |--requires--> [Token Usage Tracking]
    |--requires--> [Channel Status Monitoring] (optional, enhances overview)
    |--requires--> [Task Board] (shows task counts per agent)

[Error/Failure Visibility]
    |--enhances--> [Agent Health Monitoring] (error counts on health cards)
    |--enhances--> [Activity Feed] (error filtering in feed)
    |--requires--> [Session/Conversation Log Viewer] (errors extracted from JSONL)

[Cloudflare Tunnel]
    |--independent--> (can be added at any phase, no feature dependencies)
```

### Dependency Notes

- **Agent Registry is the foundation:** Nearly every nanobot-specific feature requires knowing which agents exist, where their files are, and what gateway ports they use. Build this first.
- **Gateway Integration unlocks active control:** Health monitoring, lifecycle control, channel status, and task dispatch all flow through the agent HTTP gateway. This is the second critical dependency.
- **Session data feeds multiple features:** The JSONL session files are the raw material for the log viewer, token tracking, and error visibility. Parsing them once and storing aggregates serves all three features.
- **Task Board exists already:** The MC fork kanban board is functional. Agent assignment and task dispatch are incremental additions, not ground-up builds.
- **Cloudflare Tunnel is independent:** No feature dependencies. Can be added whenever convenient as a deployment enhancement.

## MVP Definition

### Launch With (v1)

Minimum viable product -- the dashboard must answer: "Are my agents alive and working?"

- [ ] **Nanobot agent registry** -- auto-discover agents from filesystem. Foundation for everything else.
- [ ] **Agent health monitoring** -- process alive/dead, last activity, error state. The core value proposition.
- [ ] **Agent lifecycle control** -- start/stop/restart from dashboard. Without this, monitoring is just watching things break.
- [ ] **Real-time activity feed** -- rewired from OpenClaw to nanobot events. Already exists in MC fork, needs new data source.
- [ ] **Session/conversation log viewer** -- browse JSONL logs per agent. Essential for debugging agent behavior.
- [ ] **Agent memory viewer** -- read-only view of MEMORY.md, SOUL.md, IDENTITY.md. Understanding agent state.
- [ ] **Authentication + RBAC** -- already exists in MC fork. Keep as-is.
- [ ] **Multi-agent overview dashboard** -- the landing page. Composite of health + basic stats per agent.
- [ ] **Strip OpenClaw protocol** -- remove the old integration layer. Necessary to prevent confusion and dead code.

### Add After Validation (v1.x)

Features to add once the core monitoring loop is working.

- [ ] **Gateway integration (full HTTP communication)** -- trigger: when monitoring alone is insufficient and operators need to actively interact with agents
- [ ] **Task dispatch via gateway** -- trigger: when task board usage reveals a need to assign work directly to agents from the dashboard
- [ ] **Token usage tracking with trends** -- trigger: when operators want to understand usage patterns over time
- [ ] **Agent memory editor** -- trigger: when operators find themselves SSH-ing to edit memory files. Upgrade viewer to editor.
- [ ] **Channel status monitoring** -- trigger: when messaging channel failures become an operational pain point
- [ ] **Error/failure visibility (aggregated)** -- trigger: when the activity feed is not sufficient for identifying error patterns

### Future Consideration (v2+)

Features to defer until the core product is proven.

- [ ] **Cloudflare Tunnel integration** -- defer: nice deployment feature but not core functionality. Manual tunnel setup works in the interim.
- [ ] **Webhook-to-notification bridge** -- defer: alerts via Telegram/Discord for critical agent failures. Requires channel integration to be stable first.
- [ ] **Agent performance benchmarking** -- defer: comparing response times, success rates across agents. Needs historical data accumulation.
- [ ] **Scheduled tasks / cron** -- defer: MC fork has this but it needs rewiring for nanobot context. Not critical for v1 monitoring use case.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Nanobot agent registry (auto-discovery) | HIGH | LOW | P1 |
| Agent health monitoring | HIGH | MEDIUM | P1 |
| Agent lifecycle control (start/stop/restart) | HIGH | MEDIUM | P1 |
| Strip OpenClaw protocol | MEDIUM | MEDIUM | P1 |
| Real-time activity feed (rewired) | HIGH | LOW | P1 |
| Session/conversation log viewer | HIGH | MEDIUM | P1 |
| Agent memory viewer (read-only) | MEDIUM | LOW | P1 |
| Multi-agent overview dashboard | HIGH | MEDIUM | P1 |
| Auth + RBAC (keep existing) | HIGH | LOW | P1 |
| Webhook system (keep existing) | MEDIUM | LOW | P1 |
| Gateway integration (HTTP) | HIGH | HIGH | P2 |
| Task dispatch via gateway | MEDIUM | MEDIUM | P2 |
| Token usage tracking + trends | MEDIUM | MEDIUM | P2 |
| Agent memory editor (read-write) | MEDIUM | LOW | P2 |
| Channel status monitoring | MEDIUM | MEDIUM | P2 |
| Error/failure aggregation | MEDIUM | MEDIUM | P2 |
| Cloudflare Tunnel support | LOW | LOW | P3 |
| Webhook-to-notification bridge | LOW | MEDIUM | P3 |
| Agent performance benchmarking | LOW | HIGH | P3 |
| Scheduled tasks (rewired) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- answers "are my agents alive and working?"
- P2: Should have, add when core monitoring loop is validated
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | LangSmith | AgentOps | Langfuse | Letta ADE | Mission Control (fork) | Nanobot MC (our approach) |
|---------|-----------|----------|----------|-----------|----------------------|--------------------------|
| Agent health monitoring | Trace-based (no process health) | Session-based health | Trace-based | Agent state panel | Heartbeat polling via OpenClaw | Process + gateway liveness checks, filesystem-aware |
| Lifecycle control (start/stop) | No (SaaS, agents run elsewhere) | No (observability only) | No (observability only) | No (server-side only) | Via OpenClaw gateway | Direct process management via launch scripts |
| Memory viewer/editor | No | No | No | Yes (core memory blocks) | Memory file browser | Markdown memory files (MEMORY.md, SOUL.md, IDENTITY.md) |
| Session/log viewer | Trace waterfall | Session replay | Trace tree | Event history | Log viewer with filters | JSONL session browser with chat-style rendering |
| Token tracking | Yes (with cost) | Yes (with cost) | Yes (with cost) | Limited | Yes (with cost) | Volume only (no cost, per PROJECT.md decision) |
| Task management | No | No | No | No | Kanban board + GitHub sync | Kanban board + agent dispatch |
| Channel monitoring | No | No | No | No | No | Per-agent Telegram/Discord health |
| Self-hosted | No (SaaS) | No (SaaS) | Yes (Docker/K8s) | Yes (Docker) | Yes (Node.js) | Yes (Next.js, SQLite) |
| Auth/RBAC | Yes (team-based) | Yes (team-based) | Yes (project-based) | No (single-user) | Yes (viewer/operator/admin) | Yes (viewer/operator/admin, inherited) |
| Agent auto-discovery | No | No | No | No | Via OpenClaw gateway | Filesystem-based auto-discovery |

### Key Competitive Observations

1. **Observability tools (LangSmith, AgentOps, Langfuse) do not manage agents.** They watch agents passively via traces and logs. They cannot start, stop, or restart agents. They have no concept of agent lifecycle control. This is our primary differentiation.

2. **Letta ADE is the closest competitor for memory editing** but is tightly coupled to Letta-native agents. It cannot manage arbitrary agents with filesystem-based memory.

3. **No existing tool monitors messaging channel health per agent.** This is a nanobot-specific feature that has no competitor equivalent.

4. **The MC fork gives us a massive head start** on task management, auth/RBAC, activity feeds, and UI infrastructure. These are table stakes that we do not need to build from scratch.

5. **Filesystem-native architecture is unique.** Cloud-first tools require API-based agent registration. Auto-discovery from the filesystem with zero configuration is a genuine differentiator for self-hosted setups.

## Sources

- [LangSmith Observability Platform](https://www.langchain.com/langsmith/observability) - LangSmith features and capabilities
- [AgentOps GitHub](https://github.com/AgentOps-AI/agentops) - AgentOps SDK and dashboard features
- [CrewAI Platform](https://crewai.com/) - CrewAI agent orchestration and dashboard
- [AutoGen Studio](https://www.microsoft.com/en-us/research/blog/introducing-autogen-studio-a-low-code-interface-for-building-multi-agent-workflows/) - AutoGen Studio visual workflow features
- [Langfuse Open Source LLM Observability](https://langfuse.com/) - Langfuse self-hosted features
- [Letta ADE Overview](https://docs.letta.com/guides/ade/overview/) - Letta Agent Development Environment memory visualization
- [Datadog AI Agent Monitoring](https://www.datadoghq.com/blog/monitor-ai-agents/) - Datadog traces, metrics, AI Agents Console
- [Mission Control (builderz-labs)](https://github.com/builderz-labs/mission-control) - Fork source, 28 feature panels
- [Agent Board](https://github.com/quentintou/agent-board) - OpenClaw-based task orchestration with kanban
- [Claw-Kanban](https://github.com/GreenSheep01201/Claw-Kanban) - Multi-agent kanban with auto-assignment
- [AI Agent Monitoring Best Practices 2026](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/) - Industry standards for agent monitoring
- [Agent Lifecycle Management](https://onereach.ai/blog/agent-lifecycle-management-stages-governance-roi/) - 6-stage lifecycle framework
- [15 AI Agent Observability Tools 2026](https://research.aimultiple.com/agentic-monitoring/) - Market overview of observability tools
- [AI Agent Memory Management with Markdown Files](https://dev.to/imaginex/ai-agent-memory-management-when-markdown-files-are-all-you-need-5ekk) - File-based memory patterns

---
*Feature research for: AI agent operations dashboard (nanobot-native)*
*Researched: 2026-03-09*
