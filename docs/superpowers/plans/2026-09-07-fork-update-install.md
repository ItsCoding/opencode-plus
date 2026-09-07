# Fork Update and Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintain a native OpenCode fork that supports Task skill selection and installs a release-versioned embedded macOS binary safely.

**Architecture:** Extend built-in Task with a prompt-only optional skill name. A Bun update script fetches and merges upstream release tags, builds a single embedded binary with the tag version, backs up the installed executable, then atomically installs it.

**Tech Stack:** TypeScript, Bun, Effect schemas, Git.

## Global Constraints

- `task.skill_name` must not read skill files or inject skill contents.
- The native Task identity, BackgroundJob lifecycle, and UI renderer remain unchanged.
- `fork-update` only merges release tags into `dev` and refuses dirty worktrees or conflicts.
- The installed binary replaces `~/.opencode/bin/opencode` atomically and keeps a timestamped backup.
- The build embeds the WebUI; no separate frontend assets are installed.

---

### Task 1: Native Task Skill Argument

**Files:**
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/opencode/test/tool/task.test.ts`

**Interfaces:**
- Consumes: optional `task.skill_name: string`.
- Produces: a child text prompt prefixed with an exact installed-skill invocation instruction.

- [ ] **Step 1: Write the failing Task test**

Add a Task test that executes with `skill_name: "test-driven-development"` and asserts `stubOps({ onPrompt })` receives exactly:

```ts
'Before starting, invoke the installed skill named "test-driven-development". You must invoke this exact skill before beginning work.\n\nImplement the task.'
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `bun test test/tool/task.test.ts`

Expected: the new prompt assertion fails because Task forwards `params.prompt` unchanged.

- [ ] **Step 3: Add the minimal parameter and prompt prefix**

Add `skill_name: Schema.optional(Schema.String)` to `BaseParameterFields`. Before `ops.resolvePromptParts`, select the original prompt when absent or construct the exact tested prefix plus two newlines plus `params.prompt` when present. Pass that selected text to `resolvePromptParts`.

- [ ] **Step 4: Run the focused test**

Run: `bun test test/tool/task.test.ts`

Expected: PASS.

### Task 2: Fork Update and Install Command

**Files:**
- Create: `script/fork-update.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: optional release tag argument, `upstream` remote, clean `dev` checkout.
- Produces: verified `~/.opencode/bin/opencode` compiled with `OPENCODE_VERSION=<tag>` and a timestamped backup alongside it.

- [ ] **Step 1: Add a failing script behavior test**

Create `script/fork-update.test.ts` with injectable command runner and filesystem paths. Assert the dirty-worktree preflight exits before fetch/build/install, and assert a successful tag flow invokes commands in this order:

```ts
["git fetch upstream --tags", "git merge --no-edit v1.18.30", "bun test ...", "bun run --cwd packages/opencode build -- --single"]
```

- [ ] **Step 2: Run the script test to verify failure**

Run: `bun test script/fork-update.test.ts`

Expected: failure because the script module does not exist.

- [ ] **Step 3: Implement the update script**

Create `script/fork-update.ts`. It must:

```ts
// Fail if git status --porcelain is non-empty.
// Fetch upstream tags.
// Resolve the requested tag or newest semver v* tag.
// Merge it into the current dev branch.
// Run focused Task/models/registry tests and package type-check.
// Build with OPENCODE_VERSION=<tag> and --single.
// Copy the resulting darwin-arm64 binary to a sibling timestamped backup,
// then rename a temporary copied binary over ~/.opencode/bin/opencode.
```

Use `Bun.spawnSync`/`Bun.$` and `Bun.write`; reject any nonzero command. Require `process.platform === "darwin"`, branch `dev`, and an `upstream` remote. Do not delete backups.

- [ ] **Step 4: Add the package command and documentation**

Add:

```json
"fork:update": "bun run script/fork-update.ts"
```

Document `bun run fork:update` and `bun run fork:update -- v1.18.30`, including clean-worktree, conflict, backup, and embedded-WebUI behavior.

- [ ] **Step 5: Run tests and type-check**

Run: `bun test script/fork-update.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: exits 0.

### Task 3: Global Policy and Development Wrapper

**Files:**
- Modify: `~/.config/opencode/opencode.jsonc`
- Modify: `~/.local/bin/opencode`

**Interfaces:**
- Produces: update notifications without automatic replacement and a source wrapper that preserves its caller's working directory.

- [ ] **Step 1: Set the global update policy**

Add this root config property while preserving all existing fields:

```json
"autoupdate": "notify"
```

- [ ] **Step 2: Correct the temporary source wrapper**

Replace its exec line with:

```sh
exec bun run "$HOME/git/opencode-plus/packages/opencode/src/index.ts" "$@"
```

This does not force the fork package directory as the server working directory.

- [ ] **Step 3: Verify wrapper resolution**

Run: `zsh -lc 'which opencode && opencode --version'`

Expected: wrapper path is `/Users/alex/.local/bin/opencode`; version remains `local` until Task 2 installs the compiled release-versioned binary.

## Self-Review

- Spec coverage: Task exposes `skill_name`; the update command merges release tags, verifies, embeds WebUI, versions, backs up, and installs; global update policy and session-safe development wrapper are covered.
- Placeholder scan: no deferred implementation behavior remains.
- Type consistency: Task uses the existing Effect schema and prompt resolver; the update command derives its installed version from the selected release tag.
