---
phase: 5
slug: memory-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.5 + jsdom + @testing-library/react 16.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test:all` (lint + typecheck + test + build + e2e) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test:all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | MEMO-01 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "root files"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | MEMO-02 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "subdirectories"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | MEMO-03 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "read content"` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | MEMO-04 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "write content"` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | MEMO-04 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "path traversal"` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 1 | MEMO-04 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "read-only"` | ❌ W0 | ⬜ pending |
| 05-01-07 | 01 | 1 | MEMO-05 | unit | `pnpm vitest run src/lib/__tests__/memory-files.test.ts -t "RBAC"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/memory-files.test.ts` — stubs for MEMO-01 through MEMO-05 (unit tests for scanner + read/write logic)
- [ ] Test fixtures: temp directory with mock .md files and subdirectories (use `fs.mkdtempSync` in beforeAll)

*Existing test infrastructure (vitest, jsdom, testing-library) covers framework needs — no new test dependencies required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two-column layout renders correctly | MEMO-01 | Visual layout verification | Open agent slide-out → Memory tab → verify file tree left, content right |
| Unsaved changes warning on navigate | MEMO-04 | Browser dialog interaction | Edit a file → click another file → verify discard warning |
| Agent running warning banner | MEMO-04 | Requires running agent | Start an agent → edit memory file → verify yellow warning banner |
| Ctrl+S keyboard shortcut saves | MEMO-04 | Keyboard interaction | Edit file → press Ctrl+S → verify save toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
