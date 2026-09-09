# Claude Subscription Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in `claude-code` provider that uses a local authenticated Claude Code subscription while OpenCode owns tools, permissions, sessions, and subagents.

**Architecture:** A session LLM adapter launches or resumes the Claude Agent SDK and exposes the prepared OpenCode tool set through an in-process MCP server. It converts SDK output and MCP execution into the existing `LLMEvent` stream, so `SessionProcessor` continues to persist tool and text parts normally. A durable SDK-session mapping is stored in existing session metadata and is reused when OpenCode processes the synthetic completion prompt from an existing background `task`.

**Tech Stack:** Bun, TypeScript, Effect v4, Claude Agent SDK, in-process MCP, existing OpenCode `LLMEvent` and tool registry.

## Global Constraints

- Add `@anthropic-ai/claude-agent-sdk` only to `packages/opencode`; do not add an HTTP proxy or sidecar.
- Verify the SDK works in Bun before enabling the provider; stop and request a revised design if it is Node-only.
- Use only OpenCode-provided MCP tools; disable Claude Code built-ins and do not configure the SDK `Agent` tool or SDK subagents.
- Expose exactly `haiku`, `sonnet`, `opus`, and `fable`; pass the alias through for Claude Code to resolve.
- Store no Anthropic API keys or subscription credentials.
- Preserve OpenCode's existing tool execution, permission requests, cancellation, persistence, and `task` behavior.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Verify The SDK Runtime Boundary

**Files:**
- Modify: `packages/opencode/package.json`
- Modify: `bun.lock`
- Create: `packages/opencode/test/session/claude-code-sdk.test.ts`

**Interfaces:**
- Consumes: local Claude Agent SDK package exports `query`, SDK message types, and the SDK in-process MCP server constructor.
- Produces: a Bun-only regression test proving one SDK stream can invoke a code-defined MCP tool and resume by SDK session ID without Claude Code built-in tools.

- [ ] **Step 1: Add the SDK dependency from the package directory**

Run: `bun add @anthropic-ai/claude-agent-sdk` from `packages/opencode`.

Expected: `packages/opencode/package.json` and the workspace lockfile contain the same resolved package version.

- [ ] **Step 2: Write the failing runtime-contract test**

Create `packages/opencode/test/session/claude-code-sdk.test.ts` with an opt-in test guarded by `CLAUDE_CODE_LIVE_TEST=1`. The test must construct one in-process MCP server named `opencode` with a `ping` tool returning `{ output: "pong" }`, run `query()` with only `mcp__opencode__ping` permitted, capture `message.session_id`, and run a second `query()` with `resume: sessionID`.

```ts
const enabled = process.env.CLAUDE_CODE_LIVE_TEST === "1"

test.skipIf(!enabled)("runs in Bun with OpenCode-owned MCP tools and resumes", async () => {
  // Construct the SDK MCP server from its installed TypeScript definitions.
  // The test must call the real local Claude Code login; no credentials belong in the repository.
  expect(sessionID).toBeString()
  expect(toolCalls).toBe(1)
})
```

- [ ] **Step 3: Run the test without credentials**

Run: `bun test test/session/claude-code-sdk.test.ts` from `packages/opencode`.

Expected: PASS with the live test skipped.

- [ ] **Step 4: Run the opt-in local compatibility check**

Run: `CLAUDE_CODE_LIVE_TEST=1 bun test test/session/claude-code-sdk.test.ts` from `packages/opencode` on a machine with a logged-in Claude Code subscription.

Expected: PASS; the tool is called once and the resumed query accepts the captured SDK session ID.

- [ ] **Step 5: Gate the rest of the implementation**

If the live compatibility check fails due to Bun or SDK transport incompatibility, stop here. Record the exact error in the PR or issue and request approval for a sidecar design. Do not emulate the Agent SDK protocol.

### Task 2: Add A Built-In Local Provider Catalog And Availability Check

**Files:**
- Create: `packages/opencode/src/provider/claude-code.ts`
- Modify: `packages/opencode/src/provider/provider.ts:174-206,1396-1641`
- Create: `packages/opencode/test/provider/claude-code.test.ts`

**Interfaces:**
- Consumes: `Provider.Info`, `Provider.Model`, `ProviderV2.ID`, `ModelV2.ID`, and a small injected runtime probe.
- Produces: `ClaudeCode.provider()` returning a static `claude-code` catalog and `ClaudeCode.available()` returning `{ type: "available" }`, `{ type: "missing" }`, or `{ type: "unauthenticated" }`.

- [ ] **Step 1: Write failing catalog and availability tests**

Test that a successful probe yields the provider with only `haiku`, `sonnet`, `opus`, and `fable`; a missing runtime yields no selectable provider; and an unauthenticated runtime yields the login guidance state. Test the aliases are passed unchanged to the runtime adapter.

```ts
expect(Object.keys(ClaudeCode.provider().models)).toEqual(["fable", "haiku", "opus", "sonnet"])
expect(await ClaudeCode.available(() => Promise.resolve({ type: "missing" }))).toEqual({ type: "missing" })
```

- [ ] **Step 2: Run the focused provider test**

Run: `bun test test/provider/claude-code.test.ts` from `packages/opencode`.

Expected: FAIL because `ClaudeCode` does not exist.

- [ ] **Step 3: Implement the static catalog and probe**

Create `src/provider/claude-code.ts`. Build `Provider.Info` directly instead of adding these aliases to Models.dev. Give the models text input/output and tool-call capability, zero unknown cost fields, and no API key environment variables. The probe must use the SDK/Claude Code runtime's documented local authentication status rather than read credentials or scrape configuration.

```ts
export const id = ProviderV2.ID.make("claude-code")

export const aliases = ["haiku", "sonnet", "opus", "fable"] as const
```

Update the `custom(dep)` initialization path in `provider.ts` to add the static catalog before `mergeProvider`, then autoload it only when the probe returns `available`. Keep the unavailable reason available to the provider-auth UI path; never manufacture an `Auth.Api` entry.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun test test/provider/claude-code.test.ts && bun typecheck` from `packages/opencode`.

Expected: PASS.

### Task 3: Build The SDK-To-OpenCode Event And MCP Tool Bridge

**Files:**
- Create: `packages/opencode/src/session/llm/claude-code.ts`
- Create: `packages/opencode/test/session/claude-code.test.ts`

**Interfaces:**
- Consumes: normalized `LLM.StreamInput`, prepared AI SDK tools, an `AbortSignal`, and an SDK session ID.
- Produces: `ClaudeCodeLLM.stream(input): Stream.Stream<LLMEvent, Error>` and `ClaudeCodeLLM.sessionID(event): string | undefined`.

- [ ] **Step 1: Write failing adapter tests from scripted SDK events**

Use an injected `query` implementation, not globals, to script SDK assistant text, streamed text deltas, MCP tool requests, result usage, and a session ID. Assert the adapter emits OpenCode `step-start`, text events, `tool-call`, `tool-result`, `step-finish`, and `finish` events in order.

```ts
expect(events).toMatchObject([
  { type: "step-start", index: 0 },
  { type: "tool-call", id: "call_1", name: "bash", input: { command: "pwd" } },
  { type: "tool-result", id: "call_1", name: "bash" },
  { type: "finish" },
])
```

- [ ] **Step 2: Run the adapter test**

Run: `bun test test/session/claude-code.test.ts` from `packages/opencode`.

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement a per-turn in-process MCP server**

For every prepared OpenCode tool, publish an `mcp__opencode__<tool>` definition using the existing AI SDK JSON schema and description. Its callback must:

1. Allocate or retain the SDK tool-call ID.
2. Emit an `LLMEvent.toolCall` before executing the prepared OpenCode tool.
3. Await the existing prepared tool `execute` function with the turn's abort signal and original message context.
4. Emit `LLMEvent.toolResult` or `LLMEvent.toolError` from the real result.
5. Return that exact output to the SDK MCP call.

Configure the SDK with this MCP server, `allowedTools: ["mcp__opencode__*"]`, and a locked-down permission mode. Do not expose or approve Claude Code built-ins. Translate partial SDK stream events into `LLMEvent` text/reasoning events and translate final result usage into `step-finish` and `finish`.

- [ ] **Step 4: Add cancellation and malformed-tool-input cases**

Add scripted tests showing an aborted input aborts the SDK query and prepared tool execution, and a rejected OpenCode tool input becomes `tool-error` without leaving a pending OpenCode tool part.

- [ ] **Step 5: Run adapter tests and typecheck**

Run: `bun test test/session/claude-code.test.ts && bun typecheck` from `packages/opencode`.

Expected: PASS.

### Task 4: Integrate The Provider Into Session Execution And Persist SDK Sessions

**Files:**
- Modify: `packages/opencode/src/session/llm.ts:35-56,75-383`
- Modify: `packages/opencode/src/session/prompt.ts:1257-1286`
- Modify: `packages/opencode/src/session/compaction.ts:420-448`
- Modify: `packages/opencode/src/session/processor.ts:435-497`
- Modify: `packages/opencode/test/session/llm.test.ts`

**Interfaces:**
- Consumes: `session.metadata.claudeCodeSessionID` and an OpenCode `StreamInput` selected with `providerID === "claude-code"`.
- Produces: normal `LLMEvent` processing with an SDK session ID persisted only after a successful SDK provider turn.

- [ ] **Step 1: Write failing session-resume tests**

Add a session-level test that starts a `claude-code/sonnet` stream yielding SDK session ID `sdk-1`, then processes a second prompt in the same OpenCode session. Assert the second adapter invocation receives `resume: "sdk-1"`. Add failure cases asserting a failed initial SDK turn and a transient compaction turn do not replace the persisted ID.

```ts
expect(calls).toEqual([
  { model: "sonnet", resume: undefined },
  { model: "sonnet", resume: "sdk-1" },
])
```

- [ ] **Step 2: Run the focused test**

Run: `bun test test/session/llm.test.ts --test-name-pattern "claude-code"` from `packages/opencode`.

Expected: FAIL because `claude-code` still reaches `Provider.getLanguage()`.

- [ ] **Step 3: Route before AI SDK language-model resolution**

In `session/llm.ts`, check `input.model.providerID === "claude-code"` before the parallel `provider.getLanguage()` call. Prepare the same system text, transformed messages, and tools OpenCode uses for other providers, then delegate to `ClaudeCodeLLM.stream`. Do not call `streamText()` or `Provider.getLanguage()` for this provider.

Add `claudeCode?: { sessionID?: string; persist: boolean }` to `LLM.StreamInput`. The primary prompt call site passes the existing `session.metadata.claudeCodeSessionID` with `persist: true`; compaction uses `persist: false` and no resumable session ID. On a successful persisted Claude Code step, `SessionProcessor` saves the returned SDK session ID through the existing `Session.setMetadata` API, merging rather than replacing unrelated session metadata. Do not add a database column: `SessionTable.metadata` already stores JSON metadata.

- [ ] **Step 4: Preserve the background-task continuation path**

Add a test that invokes the existing `task` tool with `background: true`, completes the `BackgroundJob`, and verifies its synthetic prompt re-enters the same `claude-code` SDK session via the persisted mapping. Do not modify `src/tool/task.ts`; its existing `injectBackgroundResult()` behavior is the continuation trigger.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `bun test test/session/llm.test.ts --test-name-pattern "claude-code" && bun typecheck` from `packages/opencode`.

Expected: PASS.

### Task 5: Surface Availability And Provider Errors To Clients

**Files:**
- Modify: `packages/opencode/src/provider/error.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/provider.ts`
- Modify: `packages/opencode/test/provider/claude-code.test.ts`
- Modify: `packages/opencode/test/server/routes/instance/httpapi/handlers/provider.test.ts`

**Interfaces:**
- Consumes: `ClaudeCode.available()` failure state.
- Produces: an existing protocol-compatible provider-auth error that says either to install Claude Code or authenticate with Claude Code.

- [ ] **Step 1: Write failing HTTP/provider error tests**

Assert a missing runtime produces an install instruction, an unauthenticated runtime produces a login instruction, and neither response includes an API-key setup field.

```ts
expect(error.message).toContain("Log in with Claude Code")
expect(error.message).not.toContain("ANTHROPIC_API_KEY")
```

- [ ] **Step 2: Run focused tests**

Run: `bun test test/provider/claude-code.test.ts test/server/routes/instance/httpapi/handlers/provider.test.ts` from `packages/opencode`.

Expected: FAIL because the provider-specific availability errors are not mapped.

- [ ] **Step 3: Implement the smallest error mapping**

Reuse the existing provider-auth error shape. Add only a `claude-code` branch that turns the typed availability failure into the two actionable messages. Keep all other providers unchanged.

- [ ] **Step 4: Run focused tests, all session tests, and typecheck**

Run: `bun test test/provider/claude-code.test.ts test/session/claude-code.test.ts test/session/llm.test.ts && bun typecheck` from `packages/opencode`.

Expected: PASS.

### Task 6: Verify The Built-In Provider End To End

**Files:**
- Modify: `packages/opencode/test/session/claude-code-sdk.test.ts`
- Modify: `docs/superpowers/specs/2026-09-08-claude-subscription-provider-design.md`

**Interfaces:**
- Consumes: a local authenticated Claude Code subscription and `CLAUDE_CODE_LIVE_TEST=1`.
- Produces: an opt-in regression test covering provider selection, an OpenCode tool, and a resumed follow-up SDK session.

- [ ] **Step 1: Extend the opt-in test through the real OpenCode provider path**

Select `claude-code/sonnet`, prompt the real session to call a harmless OpenCode tool, then send a follow-up prompt. Assert the tool was persisted as an OpenCode tool part and the SDK session was resumed.

- [ ] **Step 2: Run the normal suite**

Run: `bun test test/session/claude-code-sdk.test.ts` from `packages/opencode`.

Expected: PASS with live-only coverage skipped.

- [ ] **Step 3: Run the authenticated live check**

Run: `CLAUDE_CODE_LIVE_TEST=1 bun test test/session/claude-code-sdk.test.ts` from `packages/opencode`.

Expected: PASS on a logged-in machine. Skip this command in CI and when no subscription is available.

- [ ] **Step 4: Update the design verification note**

Append the tested Agent SDK version, Claude Code version, Bun version, and the exact verified command to the design document. Do not record subscription identity, tokens, prompts, or credentials.

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover runtime, catalog, aliases, and availability; Task 3 covers the MCP bridge and OpenCode-native tool events; Task 4 covers persistence and background-task resume; Task 5 covers actionable errors; Task 6 covers live verification.
- Placeholder scan: no unresolved markers or deferred implementation steps remain. The only gate is the deliberate Bun compatibility stop condition required by the approved design.
- Type consistency: `ClaudeCodeLLM.stream`, `LLM.StreamInput`, `session.metadata.claudeCodeSessionID`, and `ClaudeCode.available` are consistently named across the plan.
