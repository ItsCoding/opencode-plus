# Claude Subscription Provider Design

## Goal

Add a built-in `claude-code` provider that uses the local Claude Code subscription through the Claude Agent SDK. OpenCode remains the harness: it owns sessions, permissions, tools, subagents, persistence, and UI.

## Scope

- Expose the provider as `claude-code` with `haiku`, `sonnet`, `opus`, and `fable` model aliases.
- Let the Claude Code runtime resolve each alias to the subscription-supported concrete model version.
- Report an actionable unavailable state when the local Claude Code runtime is missing or not authenticated.
- Run OpenCode tools, including `task`, through an SDK custom-tool MCP bridge.
- Resume the corresponding SDK session when an OpenCode background task completes.

This does not add an external OpenAI-compatible proxy, Claude Code built-in tools, Claude Code subagents, API-key authentication, or a custom model-discovery protocol.

## Architecture

The session LLM runtime gets a `claude-code` branch alongside the existing AI SDK and native paths. It launches or resumes an Agent SDK session for one OpenCode provider turn and translates its messages into the existing `LLMEvent` stream consumed by the session processor.

Each turn creates an in-process MCP server from the already prepared OpenCode tools. The server exposes only `mcp__opencode__*` tools. Its handlers invoke the existing OpenCode tool implementations, so existing permission rules, tool persistence, UI updates, cancellation, and plugin behavior remain authoritative. Claude Code built-in tools and its `Agent` subagent tool are unavailable to this provider.

The bridge emits OpenCode-native tool-call and tool-result events while the SDK waits for the MCP response. This preserves the normal session transcript and tool UI even though the SDK is driving the provider-side continuation loop.

## Authentication And Availability

Provider discovery checks whether the supported local Claude Code/Agent SDK runtime is available and authenticated. A failed check must not make the provider selectable. It returns a clear state that tells the user whether to install Claude Code or log in through Claude Code.

No Anthropic API key is read, stored, or sent by this provider. The SDK inherits the local Claude Code authenticated subscription. Runtime authentication failures are normalized into OpenCode's existing provider-auth error path.

## Model Selection

The catalog always presents `haiku`, `sonnet`, `opus`, and `fable`. The Agent SDK receives the selected alias and Claude Code resolves its current concrete version and verifies subscription entitlement. OpenCode records the actual model reported by SDK usage metadata when available.

The Agent SDK has no documented subscription model-list endpoint. The provider intentionally does not scrape Claude Code configuration or issue paid probe requests to discover entitlement.

## Session And Background Work

OpenCode persists the SDK session ID alongside the OpenCode session identity after the first successful SDK turn. Subsequent OpenCode turns resume that SDK session.

MCP tool calls are synchronous. Short tools return their normal result. A long-running OpenCode `task` starts its native subagent session and immediately returns its durable task/session ID. When that task completes, OpenCode resumes the stored SDK session with a compact completion prompt and the task result. This is a new provider turn, not a push notification into an idle SDK query.

If an SDK session cannot be resumed, OpenCode records a provider error and leaves the completed background task durable and visible. It does not rerun the task.

## Error Handling

- Missing runtime or unauthenticated local login: provider unavailable with install/login guidance.
- SDK startup, stream, or protocol failure: normalized to the existing provider error and retry behavior.
- Tool failure: returned through the MCP bridge as the existing OpenCode tool error/result semantics, allowing the model to recover on a later SDK continuation.
- Cancellation: OpenCode aborts the SDK query and the active OpenCode tool execution through the existing abort signal.
- Background completion races: persist the SDK-session mapping before scheduling a task-completion resume; coalesce duplicate completion notifications by the OpenCode task ID.

## Tests

- Unit-test alias catalog, runtime availability states, and SDK-message-to-`LLMEvent` translation with scripted SDK streams.
- Unit-test the MCP bridge calls the existing prepared OpenCode tool implementation and preserves tool IDs, permission denials, output, and cancellation.
- Unit-test a background `task` returns immediately, stores the SDK session mapping, and resumes exactly once after completion.
- Add an opt-in live integration test requiring an already authenticated Claude Code subscription. It must not run in the normal test suite.

## Dependency And Compatibility

Add the Claude Agent SDK as a direct dependency of `packages/opencode`. Verify it executes correctly in OpenCode's Bun runtime before enabling the provider. If the SDK requires Node-only behavior incompatible with Bun, stop rather than adding a sidecar; a separate sidecar design would need approval.
