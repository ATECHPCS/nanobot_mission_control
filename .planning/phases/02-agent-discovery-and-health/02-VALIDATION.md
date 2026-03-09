---
phase: 2
slug: agent-discovery-and-health
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.5 (unit) + playwright 1.51 (e2e) |
| **Config file** | vitest.config.ts, playwright.config.ts |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test:all` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test:all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AREG-01 | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "discovers agents"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AREG-02 | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "reads config"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | AREG-03 | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "agent properties"` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | AREG-04 | unit | `pnpm vitest run src/lib/__tests__/agent-discovery.test.ts -t "detects new agent"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | HLTH-01 | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "port check"` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | HLTH-02 | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "last activity"` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | HLTH-03 | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "error detection"` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | HLTH-04 | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "channel status"` | ❌ W0 | ⬜ pending |
| 02-02-05 | 02 | 1 | HLTH-05 | unit | `pnpm vitest run src/lib/__tests__/health-monitor.test.ts -t "interval"` | ❌ W0 | ⬜ pending |
| 02-02-06 | 02 | 1 | HLTH-06 | unit | `pnpm vitest run src/lib/__tests__/agent-health.test.ts -t "composite health"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/agent-discovery.test.ts` — stubs for AREG-01, AREG-02, AREG-03, AREG-04 (mock filesystem with `vi.mock('node:fs')`)
- [ ] `src/lib/__tests__/agent-health.test.ts` — stubs for HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-06 (mock `net.connect`, mock JSONL files)
- [ ] `src/lib/__tests__/health-monitor.test.ts` — stubs for HLTH-05 (mock timers, verify eventBus broadcasts)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Agent card grid renders with correct layout | AREG-03 | Visual layout verification | Open Agents panel, verify card grid matches mockup with activity-first hierarchy |
| Status color renders correctly in dark/light mode | HLTH-06 | Visual theming | Toggle theme, verify green/yellow/red dots are vivid in dark, muted in light |
| Slide-out panel animation | AREG-03 | Animation UX | Click agent card, verify slide-from-right animation, click outside to close |
| Toast notification on agent discovery/removal | AREG-04 | Integration with live filesystem | Add/remove agent directory, verify toast appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
