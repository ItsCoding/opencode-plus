# Claude Subscription Provider Design

## Goal

Add a built-in `claude-code` provider that uses an authenticated local Claude Code subscription through the Claude Agent SDK. OpenCode remains the harness: it owns sessions, permissions, tools, subagents, persistence, and UI.

## Scope And Non-Goals

- Display stable `haiku`, `sonnet`, `opus`, and `fable` labels, mapping each independently to the matching identifier reported by the installed SDK.
- Run OpenCode tools, including `task`, through one in-process SDK MCP server per provider turn.
- Resume an SDK session only while the same OpenCode process owns the session mapping.
- Add explicit provider availability to the Protocol/HttpApi/client contract.

This does not add a sidecar, proxy, API-key authentication, Claude Code built-in tools, Claude Code subagents, SDK settings/plugins, external MCP sources, durable background work, or process-restart recovery.

## Feasibility Gate

The provider is not implemented past the gate unless Task 1's Bun source and build-asset checks, then Task 4's packaged-adapter smoke, prove the following against the exact pinned SDK and bundled Claude Code version:

- `createSdkMcpServer({ name: "opencode" })` uses raw tool name `ping`; offline checks validate those raw definitions only. The initialized live SDK message must advertise and authorize exactly `mcp__opencode__ping`. The bridge must not register the prefix as part of the raw name.
- Every SDK MCP tool exposes one Zod string field named `input`, containing a JSON object. Its description includes the complete existing OpenCode JSON Schema. The adapter parses `input` as an unknown object and delegates validation to the existing OpenCode tool validator; it does not implement a JSON-Schema-to-Zod converter.
- Each MCP handler allocates an OpenCode-local unique `callID` and uses it for its emitted local `tool-call` and `tool-result` events. The handler returns its result directly to the SDK and does not require, synthesize, or correlate an SDK `tool_use_id`.
- OpenCode results convert to a valid SDK `CallToolResult` with MCP content blocks and `isError` where applicable, including text, structured output, and supported attachments. The live test verifies the actual SDK accepts it.
- `allowedTools` names only the verified MCP names, `permissionMode: "dontAsk"` does not permit a Claude Code built-in, and an intentionally requested built-in is denied. For this single-user local fork, the SDK intentionally reuses the user's default Claude Code configuration and login; it uses `settingSources: []`, disabled auto-memory, no `agents`, and only the in-process `mcpServers` entry. OpenCode does not read, copy, or manage credentials.
- `includePartialMessages: true` emits partial text exactly once and exposes a documented stream event shape. The adapter must not append equivalent final assistant text.
- The SDK provides a session ID before an MCP handler can execute, and `query({ resume })` works with the selected process-local session store. Concurrent resume and retry behavior are tested, not assumed.
- The installed SDK runs under Bun from source. `packages/opencode/script/build.ts` installs the matching platform SDK package and embeds its Claude executable for every target. Task 4's real adapter imports that production asset, calls `extractFromBunfs`, and passes the extracted path as `pathToClaudeCodeExecutable` to its packaged-binary query.

Any failure is a stop condition. Record the SDK, Claude Code, Bun, and package-build versions and keep `claude-code` unavailable. Do not emulate the SDK protocol or add a sidecar.

## Provider Availability And Models

The provider probe is local and non-billing: initialize the SDK runtime using the user's default Claude Code configuration and login, inspect its documented account and supported-model information, then close it. It never sends a prompt, reads credentials, or scrapes Claude Code files.

The static OpenCode catalog uses stable family labels. An authenticated subscription probe maps each family to one exact reported SDK identifier: either the stable label, its bracketed variant, or a `claude-<family>-...` identifier with an optional bracketed variant. `resolvedModel` is recorded when the SDK reports it. All four required families must resolve; any missing family leaves the provider unavailable with `unsupported-model` for that alias.

Current `Provider.ListResult` cannot represent an unavailable built-in provider. Add a typed availability record to the Protocol/HttpApi response, regenerate clients, and let clients show install, login, unsupported-runtime, or unsupported-model guidance. Selectable providers remain in the existing connected catalog; availability records do not manufacture `Auth.Api` credentials.

The SDK environment is an allowlisted copy of process environment with `ANTHROPIC_API_KEY`, API-key helper variables, and known cloud-provider Anthropic credential variables removed. If a subscription-only SDK initialization reports a non-subscription key source, or a conflicting credential cannot be safely removed, the probe returns unavailable. No key is read, stored, or forwarded by OpenCode.

## Tool Bridge And Event Ownership

Each provider turn creates one SDK MCP server named `opencode`. Each raw OpenCode tool ID becomes an SDK tool with the single Zod `input` string field and its full existing JSON Schema in the description. The SDK qualifies the raw ID as `mcp__opencode__<raw-id>`.

The MCP handler allocates one OpenCode-local `callID`, emits `tool-call` before invoking the prepared OpenCode tool with the parsed unknown input, current messages, and abort signal, then emits its result or error with the same `callID` before returning the equivalent MCP result to the SDK. Both events carry `providerExecuted: true`.

`providerExecuted: true` means the provider has already executed the tool and supplied its result to its own continuation loop. `SessionProcessor` persists the tool part and `MessageV2` retains the marker, but `SessionPrompt` must not schedule another OpenCode model turn for it. Only unmarked tool calls use OpenCode's normal post-tool continuation. A successful SDK tool call must therefore produce exactly one OpenCode execution and no follow-up `streamText()` turn.

Cancellation interrupts the SDK query and the prepared OpenCode tool through the same abort signal. Invalid input, permission rejection, and tool failure become a completed OpenCode error part and an MCP `isError` result so the SDK can recover within its own query.

## Prompt Projection

The adapter never submits OpenCode's entire history to a resumed SDK session.

- On a new SDK session, it projects the current canonical OpenCode model history once into the documented SDK prompt format, along with the current system instructions and enabled tools. Unsupported non-text or non-representable history fails before the query; it is not silently dropped.
- On a resumed SDK session, it projects only the newly admitted OpenCode user input. A background result is that new synthetic user input. It does not resend prior messages, tool calls, system text, or assistant text.
- A provider turn validates that the selected alias, system configuration, and OpenCode history lineage still match the stored mapping. Otherwise it starts a new SDK session from a full initial projection rather than resuming stale context.

## SDK Session Lifecycle

The session metadata record contains the SDK session ID, selected alias and resolved model, OpenCode history lineage, and the current OpenCode process instance ID. It is not a durable Agent SDK transcript.

1. A new query captures and atomically persists the SDK session ID as soon as the SDK emits it, before the MCP server accepts any tool call. Metadata writes merge the latest stored object, and each same-drain turn reloads the record before choosing `resume`.
2. Before any MCP handler starts, transport failures may use the existing retry policy. After a handler starts, the adapter returns a non-retryable provider error: OpenCode must not replay a turn that may have caused side effects.
3. A normal subsequent prompt resumes only the current-process mapping and uses incremental projection. A compaction or summary request never resumes or replaces that mapping.
4. A background `task` returns its native task ID immediately. In the same process, the existing synthetic completion prompt is eligible to resume the stored mapping once. The task ID is recorded in session metadata before scheduling that resume and claimed atomically before it starts. A duplicate notification is ignored. A failed resume records a visible provider error and leaves the task result visible; it never reruns the task.
5. OpenCode session fork, revert, model/alias change, explicit metadata removal, and deletion clear the mapping. Forks must not share an SDK conversation.
6. On process restart, all mappings from the prior process instance are invalid. OpenCode does not resume SDK sessions, rerun tasks, synthesize missed completion prompts, or claim exactly-once background delivery. The next foreground prompt starts a new SDK session from full OpenCode history.

## Tests

- Offline contract tests cover SDK-message translation, partial/final de-duplication, event ordering, `providerExecuted`, MCP result conversion, schema-conversion rejection, prompt projection, lifecycle transitions, metadata merge/reload, fork/revert/model changes, and no retry after a tool starts.
- Offline integration tests cover OpenCode tool persistence, permission denial, cancellation, and a completed SDK-owned tool causing no extra OpenCode provider turn.
- Opt-in authenticated source tests cover every feasibility-gate assertion, model aliases, a harmless tool, resume, and subscription credential isolation.
- Task 4's opt-in packaged-binary smoke runs the real adapter query from the released binary shape. Neither live suite runs in normal CI.

## Dependency And Compatibility

Add the Claude Agent SDK directly to `packages/opencode` only after the feasibility gate has a passing local result. Pin the validated version and record the SDK, bundled Claude Code, Bun, and packaging versions in this document. SDK upgrades require the contract and packaged-binary checks again.

Validated on `darwin-arm64`: Agent SDK `0.3.261`, bundled Claude Code `2.1.261`, Bun `1.3.14`, and the local `bun-darwin-arm64` compile target. Task 1 commands: `CLAUDE_CODE_LIVE_TEST=1 bun test test/session/claude-code-sdk.test.ts` and `bun run script/build.ts --single --skip-install --skip-embed-web-ui` from `packages/opencode`. The packaged live query is a Task 4 adapter check.

## Task 7 Verification Record

The offline verification commands were run from each package directory:

- `packages/opencode`: `bun test test/provider/claude-code.test.ts test/session/claude-code-sdk.test.ts test/session/claude-code.test.ts test/session/claude-code-background.test.ts test/session/llm.test.ts test/session/processor-effect.test.ts test/session/prompt.test.ts test/session/retry.test.ts test/session/session.test.ts test/tool/task.test.ts`; `bun typecheck`.
- `packages/protocol`: `bun test`; `bun typecheck`.
- `packages/server`: `bun test`; `bun typecheck`.
- `packages/client`: `bun test test/provider-contract.test.ts test/provider-guidance.test.ts test/effect.test.ts test/promise.test.ts`; `bun typecheck`.
- `packages/app`: `bun run test:unit`; `bun typecheck`.

Current authenticated adapter checks passed on `darwin-arm64`: the focused source smoke, focused packaged smoke, and full adapter suite ran `CLAUDE_CODE_LIVE_TEST=1 bun test test/session/claude-code.test.ts` with 1/1/20 passing tests respectively. Each focused smoke supplies only `mcp__opencode__required_token`; its handler alone creates a random token, and the test requires both handler execution and streamed assistant text containing that token. The packaged case also retains its `/$bunfs/` and `extractFromBunfs` assertions. These results prove the source and packaged adapter MCP-execution constraints only; they do not claim that the complete feasibility gate is independently revalidated by this record. No identity, prompt, credential, or token was recorded.
