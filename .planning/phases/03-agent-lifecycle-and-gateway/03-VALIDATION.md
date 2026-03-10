---
phase: 3
slug: agent-lifecycle-and-gateway
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (configured in vitest.config.ts) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts src/lib/__tests__/agent-gateway.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts src/lib/__tests__/agent-gateway.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | LIFE-01 | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "startAgent"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | LIFE-02 | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "stopAgent"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | LIFE-03 | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "restartAgent"` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | LIFE-05 | unit | `pnpm test -- --run src/lib/__tests__/agent-lifecycle.test.ts -t "process group"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | GATE-01 | unit | `pnpm test -- --run src/lib/__tests__/agent-gateway.test.ts -t "proxy"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | GATE-03 | unit | `pnpm test -- --run src/lib/__tests__/agent-gateway.test.ts -t "failure"` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | GATE-04 | e2e | `pnpm test:e2e -- tests/agent-lifecycle.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/agent-lifecycle.test.ts` — stubs for LIFE-01, LIFE-02, LIFE-03, LIFE-05
- [ ] `src/lib/__tests__/agent-gateway.test.ts` — stubs for GATE-01, GATE-03
- [ ] `tests/agent-lifecycle.spec.ts` — E2E stubs for GATE-04

*Existing Vitest infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirmation dialog before stop/restart | LIFE-04 | UI interaction: modal appearance, button styling, dismiss behavior | 1. Open slide-out for running agent 2. Click Stop 3. Verify modal appears with agent name, warning, red confirm button 4. Click Cancel, verify nothing happens 5. Click Confirm, verify modal closes and spinner appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
