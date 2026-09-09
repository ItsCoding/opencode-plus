# Unified Navigation Shell Handover

## Goal

Complete Phase 1 of the Web UI roadmap from `docs/superpowers/plans/2026-09-08-unified-navigation-shell.md` using test-driven, task-scoped implementation and review.

## Current State

- Branch: `dev`
- Current HEAD: `63d7c73e4a docs: add claude subscription provider plan`
- `dev` was 17 commits ahead of `origin/dev` before this handover commit.
- Unified navigation Tasks 1-6 are implemented, committed, and approved by task-scoped reviews.
- Task 7 has uncommitted test/benchmark changes and is blocked on legacy benchmark and stability failures.
- Do not discard or overwrite the current Task 7 worktree changes.

## Completed Work

- Design: `e90694da2f`, `7d590fa10f`
- Implementation plan: `2e09a589d2`
- Task 1, sidebar model and benchmark harness: `942d78a1c4`, `7cc801c2bf`, `e80fb372bc`, `8d8a93db7e`
- Task 2, persisted sidebar density: `1ca3fe5999`, `411ffe9592`
- Task 3, unified sidebar controller/view and coverage: `40b6046941`, `6bfadba861`
- Task 4, shell mounting, hidden tabs, and mobile titlebar geometry: `838b025b59`, `a8e44c106c`
- Task 5, draft-backed composer home: `76f9d3354f`
- Task 6, contextual review/files inspector: `71f88a44c8`, `f450fa7ebf`

Task 1 through Task 6 passed their final spec and quality review gates. The latest completed feature commit is `f450fa7ebf`.

## Uncommitted Task 7 Work

- Modified: `packages/app/e2e/performance/timeline/home-tab-navigation-benchmark.spec.ts`
- Modified: `packages/app/e2e/performance/timeline/session-tab-switch-benchmark.spec.ts`
- Added: `packages/app/e2e/regression/unified-shell-rtl.spec.ts`

This work adds responsive and RTL coverage for desktop/mobile layouts, both density values, titlebar focus, drawer direction/closure, inspector placement, bidi labels, and LTR paths. It also retargets two benchmarks from the removed titlebar tabs to unified-sidebar rows.

## Verification Evidence

Task 7 results recorded before handover:

- Focused unit tests: 43 passed, 0 failed.
- Named regression suite, including `unified-shell-rtl.spec.ts`: 13 passed, 0 failed.
- `bun typecheck` from `packages/app`: passed.
- `bun run build` from `packages/app`: passed.
- Session switching and review-pane scaling benchmark families: passed.
- Stability suite: 41 passed, 3 failed.
- Full benchmark suite: not green because unchanged legacy scenarios still fail.

Benchmark artifacts from the working session:

- Baseline: `/tmp/opencode-plus-unified-shell-baseline.txt`
- After: `/tmp/opencode-plus-unified-shell-after.txt`

These `/tmp` files are local and may not survive a restart. Regenerate them if absent.

## Open Blockers

The Task 7 brief authorized changes only to the two benchmark files listed above. Completing the full benchmark gate requires deciding whether to update these additional legacy scenarios:

- `packages/app/e2e/performance/timeline/first-navigation-benchmark.spec.ts`
- `packages/app/e2e/performance/timeline/session-tab-flash.spec.ts`

The stability suite also has three independently reproducible failures:

- Virtualization expectation failure.
- Narrow viewport settle timeout.
- Resize remount/disappearance failure.

Do not raise thresholds, add sleeps, skip scenarios, or weaken semantic assertions. Diagnose each failure and update stale setup/selectors only when the current product behavior is correct.

## Remaining Todos

1. Confirm permission to modify the two legacy benchmark files outside the original Task 7 file list.
2. Use systematic debugging and TDD to fix or correctly retarget the remaining full benchmark failures.
3. Diagnose the three stability failures and determine whether they are stale tests or product regressions.
4. Re-run Task 7 verification: focused tests, full app unit/browser suites, named E2E regressions, app/E2E typechecks, production build, stability, and `bun run test:bench`.
5. Compare regenerated before/after benchmark records against the thresholds in the implementation plan.
6. Commit only the completed Task 7 files and fixes with `test(app): cover unified shell regressions`.
7. Run a fresh Luna task review for Task 7 and resolve all Critical or Important findings.
8. Run a Luna whole-change review across the unified navigation commits, then resolve findings and repeat verification.
9. Address or explicitly accept these prior non-blocking review notes: the density provider test uses a synchronous persistence seam without storage serialization coverage, and `test-browser/unified-sidebar.test.tsx` does not restore its module-level `globalThis.React` shim.
10. Use the finishing-development-branch workflow after all checks and reviews pass.

## Worktree Safety

The following changes are unrelated to the unified navigation implementation and must remain untouched unless separately requested:

- Modified: `AGENTS.md`
- Untracked: `.superpowers/brainstorm/`
- Commit `63d7c73e4a docs: add claude subscription provider plan`

The ignored execution reports and reviews are under `.superpowers/sdd/`; the durable implementation requirements remain in the committed plan.
