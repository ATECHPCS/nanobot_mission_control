---
phase: 1
slug: foundation-strip
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run && pnpm playwright test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run && pnpm playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | FOUN-01 | unit | `pnpm vitest run` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | FOUN-02 | unit | `pnpm vitest run` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | FOUN-03 | E2E | `pnpm playwright test` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 1 | FOUN-04 | E2E | `pnpm playwright test` | ✅ | ⬜ pending |
| 1-02-03 | 02 | 1 | FOUN-05 | E2E | `pnpm playwright test` | ✅ | ⬜ pending |
| 1-02-04 | 02 | 1 | FOUN-06 | E2E | `pnpm playwright test` | ✅ | ⬜ pending |
| 1-02-05 | 02 | 1 | FOUN-07 | E2E | `pnpm playwright test` | ✅ | ⬜ pending |
| 1-02-06 | 02 | 1 | FOUN-08 | E2E+smoke | `pnpm vitest run && pnpm playwright test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Smoke test stubs for auth login/logout, kanban CRUD, webhook delivery, SSE connection
- [ ] Update existing E2E test fixtures to remove OpenClaw references

*Existing Vitest and Playwright infrastructure covers base needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No OpenClaw references remain | FOUN-01 | Grep verification | `grep -r "openclaw\|OpenClaw\|OPENCLAW" src/ --include="*.ts" --include="*.tsx"` should return 0 results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
