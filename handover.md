# Unified Navigation Shell Handover

## Goal

Complete Phase 1 of the Web UI roadmap in `docs/superpowers/plans/2026-09-08-unified-navigation-shell.md`.

## Current State

- Branch: `dev`
- Task 7 implementation commit: `4d1a5b3949 test(app): cover unified shell regressions`
- Tasks 1-6 remain complete and reviewed through `f450fa7ebf`.
- Task 7 is implemented, reviewed, committed, and pushed with one remaining verification limitation: the historical benchmark baseline cannot boot under the current runtime.
- Do not add `.codegraph/`; it is generated local analysis state.

## Task 7 Changes

- Fixed the mobile session-panel collapse: the contextual inspector only takes full height at desktop breakpoints.
- Updated stability coverage for intended timeline overscan behavior while retaining state-preservation checks.
- Retargeted legacy titlebar-tab benchmarks to unified-sidebar rows and the sidebar new-session action.
- Changed sidebar prefetch coverage to the approved focus/pointer contract rather than eager prefetching.
- Added/expanded unified-shell RTL coverage for:
  - Desktop and mobile drawer inline-start geometry.
  - Closed sidebar keyboard exclusion and reopened keyboard traversal.
  - Pinned inspector geometry, DOM order, and keyboard order.
  - Visible review-file path `dir="ltr"` while preserving filename `<bdi dir="auto">` handling.
  - Visible terminal direction.
- Corrected benchmark milestones so active-sidebar state is measured on the active anchor and close-to-draft timing starts at the close action.

## Decisions Already Made

- Stale virtualization DOM-unmount assertion: remove it. Intentional `overscan: 50` keeps the small fixture mounted; the test still asserts state preservation.
- Sidebar prefetch: assert focus/pointer-triggered warming, not eager prefetching of every session.
- Benchmarks may force `newLayoutDesigns: true` because unified sidebar navigation replaces removed visible titlebar tabs.
- Legacy benchmark files outside the original Task 7 list were approved for retargeting.

## Verification Evidence

Run from `packages/app` unless noted otherwise:

- `bun run test`: 43 passed.
- `bun typecheck`: passed, including a fresh pre-commit run.
- `bun typecheck:e2e`: passed.
- `bun run build`: passed after the final production change.
- `bunx playwright test e2e/regression/unified-shell-rtl.spec.ts`: 8 passed in the fresh pre-commit run.
- Focused unified-navigation performance specs: 8 passed.
- `PLAYWRIGHT_PORT=3033 bun run test:stability`: 23 unit tests and 44 Playwright tests passed.
- `PLAYWRIGHT_PORT=3034 bun run test:bench`: 21 passed in 6.7 minutes; all benchmark records emitted.
- The unqualified stability command initially failed only because an orphan local preview server already owned port `3000`; use an isolated `PLAYWRIGHT_PORT` locally.

## Historical Baseline Blocker

The plan asks for before/after benchmark median comparison. The prior `/tmp` artifacts are unavailable on this Mac.

- A detached baseline worktree exists at `/var/folders/16/t92h0_nj4bn6v2q3yn31v6km0000gn/T/opencode/unified-shell-baseline` on `2e09a589d2`.
- `bun install --frozen-lockfile` completed there.
- Its `bun run test:bench` passes 43 unit benchmark tests, builds the app, then fails before browser scenarios with:

  ```text
  Error: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'
  ```

- This is a historical toolchain/runtime incompatibility, not a current product regression.
- Comparing new sidebar benchmarks to the old titlebar benchmarks is only an end-to-end product comparison with equivalent workloads, not an interaction-cost comparison.

## Next Decision

Choose one before claiming the plan's baseline-comparison gate is complete:

1. Accept that the historical browser baseline is unavailable under the current runtime and retain the passing current benchmark record.
2. Reconstruct the exact historical Bun/Node toolchain for `2e09a589d2`, rerun its browser benchmark suite, and compare family-by-family medians without adding machine-dependent thresholds.

## Safe Continuation

1. Check `git status --short` and `git log --oneline -5`.
2. If choosing the historical-runtime path, investigate the `bun:` loader failure in the detached baseline worktree; do not alter current Task 7 production code to make historical tests run.
3. If a new baseline is obtained, record the comparison outcome in this file and run a final whole-change review only if the comparison exposes a material regression.
4. Use the finishing-development-branch workflow once the baseline decision is resolved.

## Worktree Safety

- Keep `63d7c73e4a docs: add claude subscription provider plan` intact.
- Do not stage or commit `.codegraph/`.
- The ignored execution reports remain under `.superpowers/sdd/`.
