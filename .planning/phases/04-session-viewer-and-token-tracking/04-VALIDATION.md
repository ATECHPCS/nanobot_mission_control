---
phase: 4
slug: session-viewer-and-token-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.5 |
| **Config file** | `vitest.config.ts` |
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
| 04-01-01 | 01 | 1 | SESS-01 | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "scan" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | SESS-02 | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "parse" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | SESS-03 | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "filter" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | SESS-04 | unit | `pnpm vitest run src/lib/__tests__/nanobot-sessions.test.ts -t "stream" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | TOKN-01 | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "extract" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | TOKN-02 | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "agent" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 1 | TOKN-03 | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "model" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 1 | TOKN-04 | unit | `pnpm vitest run src/lib/__tests__/token-aggregation.test.ts -t "trend" --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/nanobot-sessions.test.ts` — stubs for SESS-01, SESS-02, SESS-03, SESS-04
- [ ] `src/lib/__tests__/token-aggregation.test.ts` — stubs for TOKN-01, TOKN-02, TOKN-03, TOKN-04
- [ ] `src/test/fixtures/` — sample JSONL files for deterministic testing

*Existing infrastructure covers framework — vitest is already configured and running.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat bubble layout renders correctly | SESS-01 | Visual/CSS validation | Open session viewer, verify user msgs right-aligned, agent msgs left-aligned, avatars render |
| 10MB+ JSONL does not freeze browser | SESS-04 | Performance/UX | Load a 10MB+ session file, verify browser remains responsive during load |
| Recharts charts render with correct data | TOKN-04 | Visual chart validation | Open token dashboard, verify line chart shows trends, bar chart shows per-agent data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
