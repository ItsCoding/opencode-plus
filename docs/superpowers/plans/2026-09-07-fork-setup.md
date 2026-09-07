# Fork Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one command that configures the upstream remote and delegates initial installation to `fork:update`.

**Architecture:** Keep setup as a thin wrapper around the tested updater. It configures only the canonical upstream remote and invokes `runForkUpdate`.

**Tech Stack:** TypeScript, Bun tests, Git.

## Global Constraints

- Do not duplicate update, build, backup, or installation logic.
- Add `upstream` only when absent and reject a noncanonical existing URL.
- Preserve all `fork:update` safety checks.

---

### Task 1: Fork Setup Command

**Files:**
- Create: `script/fork-setup.ts`
- Create: `script/fork-setup.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write failing behavior tests**

Test injected command execution for: adding `upstream` when absent; accepting the canonical remote; rejecting another URL; and invoking `runForkUpdate` only after successful remote setup.

- [ ] **Step 2: Run the test**

Run: `bun test --config /dev/null script/fork-setup.test.ts`

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the thin setup wrapper**

Create `script/fork-setup.ts` with `runForkSetup`. Run `git remote get-url upstream`; if absent, run:

```ts
git remote add upstream https://github.com/anomalyco/opencode.git
```

Reject any returned noncanonical URL. Then call `runForkUpdate` with the optional tag argument. Do not merge, build, or install directly.

- [ ] **Step 4: Add command and docs**

Add:

```json
"fork:setup": "bun run script/fork-setup.ts"
```

Document `bun run fork:setup` as the first-time command and `bun run fork:update` as the later update command.

- [ ] **Step 5: Verify**

Run: `bun test --config /dev/null script/fork-setup.test.ts script/fork-update.test.ts`

Expected: PASS.

Run: `bun run typecheck --cwd packages/opencode`

Expected: exits 0.

## Self-Review

- Setup adds only the missing remote and delegates every stateful update step to the existing updater.
