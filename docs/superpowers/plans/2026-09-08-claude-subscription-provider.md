# Claude Subscription Provider Implementation Plan

**Goal:** Add a fail-closed `claude-code` subscription provider using the Claude Agent SDK while OpenCode remains the sole owner of tools, permissions, sessions, and subagents.

**Architecture:** A gated SDK adapter converts a verified in-process MCP server and SDK stream into the existing `LLMEvent` stream. SDK-owned MCP calls are marked `providerExecuted: true`; OpenCode records them but never repeats them. SDK resume is intentionally same-process only, with incremental prompt projection and no background recovery after restart.

## Global Constraints

- Modify only `packages/opencode` and generated client artifacts required by Protocol/HttpApi changes; never hand-edit generated files.
- Add no proxy, sidecar, custom SDK protocol, durable job system, API-key fallback, Claude Code built-ins, SDK agents, SDK settings/plugins, or external MCP sources.
- Keep `claude-code` unavailable until every feasibility check passes, including exact mappings for all four stable model families.
- Use a sanitized SDK environment and fail closed on a non-subscription credential source.
- Do not commit unless explicitly requested.

---

### Task 1: Prove The Agent SDK Boundary Before Provider Code

**Files:**
- Modify: `packages/opencode/package.json`, `bun.lock`
- Modify: `packages/opencode/script/build.ts`
- Create: `packages/opencode/test/session/claude-code-sdk.test.ts`

- [ ] Add and pin `@anthropic-ai/claude-agent-sdk` from `packages/opencode`.
- [ ] Write offline type/contract tests around the installed exports. Verify `tool()` accepts the single Zod string `input` field, a handler returns valid `CallToolResult`, and the raw server/tool definitions are `opencode` and `ping`. Verify the qualified `mcp__opencode__ping` provider advertisement only from the initialized live SDK message; the SDK server object does not expose that qualified identifier offline.
- [ ] Add opt-in `CLAUDE_CODE_LIVE_TEST=1` checks in Bun that prove: the exact advertised/allowed tool name; a real MCP call and documented tool-use ID; `allowedTools` plus `permissionMode: "dontAsk"` deny a requested built-in; `settingSources: []`, disabled memory, an explicit temporary `cwd`, and sole MCP server take effect; partial text arrives once; `resume` works with the selected session store; `accountInfo` identifies subscription authentication; and each stable family maps to one exact reported SDK identifier. For this single-user local fork, intentionally reuse the default Claude Code configuration and login without reading, copying, or managing credentials.
- [ ] Exercise an OpenCode-shaped tool result containing text, JSON, error, and a supported attachment. Assert the SDK accepts its `CallToolResult` conversion.
- [ ] Make `script/build.ts` install the matching Agent SDK platform package for every build target and embed the target Claude executable as a Bun file asset. Verify the supported local build includes that asset.
- [ ] Stop here if any check fails. Missing subscription signal, failed Bun support, packaged-binary failure, or any missing model family leaves the provider unavailable and requires a revised design.

Run normal checks: `bun test test/session/claude-code-sdk.test.ts` from `packages/opencode`.

### Task 2: Add Explicit Provider Availability To The Wire Contract

**Files:**
- Modify: Protocol provider schemas and Server provider HttpApi definitions/handlers
- Regenerate: `packages/client/src/generated`, `packages/client/src/generated-effect`
- Create/modify: provider Protocol, server, and client tests

- [ ] Write failing end-to-end contract tests for typed `claude-code` availability states: `available`, `missing`, `unauthenticated`, `unsupported-runtime`, and `unsupported-model`.
- [ ] Extend the provider list response with an availability record rather than overloading `connected` or `ProviderAuthApiError`. Existing selectable providers retain their current shape.
- [ ] Implement the smallest typed availability record and client rendering path. `missing` says install/update Claude Code; `unauthenticated` says log in with Claude Code; unsupported states identify the local runtime or required alias. Never mention API-key setup.
- [ ] Run `bun run generate` from `packages/client`; do not edit generated files directly.
- [ ] Run focused Protocol, Server, and client tests plus `bun typecheck` from each affected package.

### Task 3: Add The Static Alias Catalog And Subscription Probe

**Files:**
- Create: `packages/opencode/src/provider/claude-code.ts`
- Modify: `packages/opencode/src/provider/provider.ts`
- Create: `packages/opencode/test/provider/claude-code.test.ts`

- [ ] Write failing tests for the static family-label order and every probe state. The probe maps every stable label to one exact `supportedModels()` identifier; any missing family makes the authenticated provider unavailable.
- [ ] Implement the non-billing probe using the user's default Claude Code configuration and login. It uses documented SDK initialization/account/model APIs, a sanitized allowlist environment, empty `settingSources`, disabled memory, no SDK agents, and no unrequested MCP servers. Do not read, copy, or manage credentials.
- [ ] Reject conflicting inherited Anthropic/API-key/helper/cloud credential variables and any non-subscription reported key source. Do not read, persist, or send credentials.
- [ ] Build `Provider.Info` only after all stable family labels resolve to exact discovered SDK identifiers, with text and tool capability, conservative verified limits, and no environment key fields.
- [ ] Run `bun test test/provider/claude-code.test.ts && bun typecheck` from `packages/opencode`.

### Task 4: Build A Verified SDK MCP And Event Adapter

**Files:**
- Create: `packages/opencode/src/session/llm/claude-code.ts`
- Create: `packages/opencode/test/session/claude-code.test.ts`

- [ ] Write offline scripted-SDK tests that cover `step-start`, partial text, reasoning where supported, `tool-call`, `tool-result` or `tool-error`, `step-finish`, and `finish`. Final assistant content must not duplicate partial deltas.
- [ ] Implement the Task 1 JSON-input bridge. Convert every prepared OpenCode tool to one SDK string field named `input`, put its full existing JSON Schema in the description, parse the JSON into an unknown object, and delegate validation to the existing OpenCode tool validator. Generate the SDK-qualified allowed name from the MCP server key.
- [ ] Allocate an OpenCode-local unique `callID` per MCP handler. Emit `tool-call` before execution and `tool-result`/`tool-error` with that same ID before returning valid MCP content to the SDK. Do not require or synthesize an SDK `tool_use_id`. Mark both events `providerExecuted: true`.
- [ ] Pass the prepared tool its original messages and the query abort signal. Translate validation failure, permission denial, cancellation, and tool failure to a settled OpenCode part and MCP `isError` response.
- [ ] Test that `providerExecuted: true` persists through `SessionProcessor` and `MessageV2`, and that `SessionPrompt` does not initiate an extra provider turn or execute the tool twice.
- [ ] Add cancellation, malformed input, schema rejection, built-in denial, and result-conversion tests. Run `bun test test/session/claude-code.test.ts && bun typecheck` from `packages/opencode`.
- [ ] Add an opt-in packaged-binary live-query smoke. The real adapter imports the production generated asset, extracts it with `extractFromBunfs`, passes it as `pathToClaudeCodeExecutable` to `query`, and completes a harmless authenticated MCP query.

### Task 5: Integrate Incremental Prompts And Same-Process SDK Lifecycle

**Files:**
- Modify: `packages/opencode/src/session/llm.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/processor.ts`, `packages/opencode/src/session/session.ts`, and fork/revert/delete paths
- Create/modify: `packages/opencode/test/session/llm.test.ts`, lifecycle tests

- [ ] Write lifecycle tests first. Cover session-ID capture and atomic merge before a tool handler runs; metadata reload before every same-drain turn; initial full-history projection; resumed incremental-user-only projection; no compaction/summary replacement; and no generic retry after a handler starts.
- [ ] Route `claude-code` before `Provider.getLanguage()` and `streamText()`, but reuse OpenCode request preparation and prepared tools. Add an adapter-specific input containing the latest metadata record and the one projected user input, not the complete history on resume.
- [ ] Persist `{ sessionID, processInstanceID, alias, resolvedModel, lineage }` as a merged metadata record. Reload metadata at every provider-turn boundary. On the same process, resume only when process ID, alias, model, and lineage match. Otherwise start a fresh SDK session from the full projection.
- [ ] Make post-tool SDK failures non-retryable. Pre-tool transport retries must use the established record and must be tested not to duplicate an admitted user input.
- [ ] Clear the mapping on OpenCode fork, revert, alias/model change, explicit removal, and deletion. Test that a fork cannot resume the original SDK conversation.
- [ ] On process-instance mismatch, clear/ignore the mapping and start the next foreground request fresh. Do not add recovery or transcript persistence.
- [ ] Run focused lifecycle tests and `bun typecheck` from `packages/opencode`.

### Task 6: Limit Background Completion To The Existing Process

**Files:**
- Modify: the smallest session/task continuation seam required for a task completion claim
- Create/modify: `packages/opencode/test/session/claude-code-background.test.ts`

- [ ] Write tests for a background `task` returning immediately, its synthetic result becoming the next incremental SDK input, and exactly one same-process completion resume per task ID.
- [ ] Persist the task-ID claim in the merged SDK metadata before scheduling the resume. Claim it atomically; duplicate notifications do nothing. A failed resume produces a visible provider error and preserves the completed task output without rerunning it.
- [ ] Test restart behavior explicitly: existing `BackgroundJob` state is process-local, so restart loses active work and schedules no missed completion prompt or SDK resume.
- [ ] Keep the existing `task` behavior unless the smallest claim seam requires a change; do not add a durable queue, polling loop, or recovery worker.
- [ ] Run `bun test test/session/claude-code-background.test.ts && bun typecheck` from `packages/opencode`.

### Task 7: Final Verification And Version Record

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-claude-subscription-provider-design.md`
- Modify: live-test files only when required by validated SDK behavior

- [ ] Run all offline provider, adapter, lifecycle, background, Protocol, Server, and client tests from their package directories, then each affected package's `bun typecheck`.
- [ ] Run opt-in authenticated source and packaged-binary checks on a logged-in subscription machine. These are release checks, not normal CI.
- [ ] Append the validated SDK version, bundled Claude Code version, Bun version, package-build target, and exact commands to the design. Do not record identities, credentials, prompts, or tokens.
- [ ] If a live or packaged check fails, keep the provider unavailable and record the external constraint. Do not relax the feasibility gate.

## Plan Self-Review

- Tasks 1 and 7 distinguish offline contracts, authenticated source checks, and packaged-binary checks.
- Task 2 changes Protocol/HttpApi/client generation because the existing provider list cannot represent unavailable states.
- Tasks 4 and 5 preserve one OpenCode execution per SDK MCP call and prevent history duplication or post-side-effect retries.
- Task 6 deliberately documents same-process background behavior and adds no ungrounded durability promise.
