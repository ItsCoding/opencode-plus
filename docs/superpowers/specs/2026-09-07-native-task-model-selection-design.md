# Native Task Model Selection Design

## Goal

Extend the OpenCode fork so its native Task tool can run a child session on a caller-selected model while retaining the existing native WebUI and TUI task experience. Add a read-only models tool so agents can discover valid model IDs.

## Native Task

Add an optional `model` argument to the built-in `task` tool. Its value uses `provider/model-id` format. When absent, Task preserves its current model resolution: the subagent's configured model first, then the parent message model.

When supplied, Task validates the model against the configured provider catalog before creating or running the child. The selected model is used for Task metadata and the child prompt. Task keeps its existing child-session creation, permissions, BackgroundJob lifecycle, completion injection, and native task renderer.

## Models Tool

Add a read-only built-in `models` tool. It returns every configured model as one `provider/model-id` per line. It does not call external services, change state, filter by agent, or expose model configuration secrets.

## Scope

Change only the native server tool implementation and its focused tests. No plugin, separate tool name, desktop app build, or UI renderer change is required because the built-in `task` tool remains the UI contract.

## Verification

Add focused tests for model listing, valid Task model override, default Task model fallback, and invalid model rejection. Run the package's focused tests and type-check command supported by the fork.
