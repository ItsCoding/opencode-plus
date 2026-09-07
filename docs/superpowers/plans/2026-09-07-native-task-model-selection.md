# Native Task Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let native Task select any configured model and expose all configured model IDs through a read-only native tool.

**Architecture:** Keep the built-in `task` identity and existing BackgroundJob flow. Add a small `models` built-in backed by `Provider.Service`; Task parses and validates its optional model override against the same provider catalog.

**Tech Stack:** TypeScript, Effect, OpenCode `Provider.Service`, Bun tests.

## Global Constraints

- Preserve native Task child sessions, BackgroundJob notifications, and the existing `task` WebUI/TUI renderer.
- `task.model` is optional and uses `provider/model-id` format.
- Omitted `task.model` preserves the configured-agent then parent-model fallback.
- `models` returns every configured `provider/model-id` and no secret configuration.
- Do not modify the desktop or WebUI packages.

---

### Task 1: Native Models Tool

**Files:**
- Create: `packages/opencode/src/tool/models.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Test: `packages/opencode/test/tool/models.test.ts`

**Interfaces:**
- Consumes: `Provider.Service.list(): Effect<Record<ProviderV2.ID, { models: Record<ModelV2.ID, unknown> }>>`.
- Produces: built-in tool ID `models` with no parameters and newline-separated `provider/model-id` output.

- [ ] **Step 1: Write the failing models-tool test**

Create a focused Effect test using the existing provider fixture/layer. Assert that executing `ModelsTool` returns all configured IDs, one per line, sorted by provider then model:

```ts
expect(result.output).toBe("alpha/a-model\nbeta/b-model")
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `bun test packages/opencode/test/tool/models.test.ts`

Expected: failure because `ModelsTool` does not exist.

- [ ] **Step 3: Implement the read-only tool**

Create `packages/opencode/src/tool/models.ts` using `Tool.define("models", ...)`, `Schema.Struct({})`, and `Provider.Service`. Flatten `yield* provider.list()` to strings with `${providerID}/${modelID}`, sort them with `toSorted()`, and return:

```ts
{
  title: "Available models",
  output: ids.join("\n"),
  metadata: {},
}
```

- [ ] **Step 4: Register the tool**

In `packages/opencode/src/tool/registry.ts`, import `ModelsTool`, initialize it in the `Effect.all` tool map, and include it in `builtin` next to `task`.

- [ ] **Step 5: Run the focused test**

Run: `bun test packages/opencode/test/tool/models.test.ts`

Expected: PASS.

### Task 2: Task Model Override

**Files:**
- Modify: `packages/opencode/src/tool/task.ts:43-62, 181-212`
- Test: `packages/opencode/test/tool/task.test.ts`

**Interfaces:**
- Consumes: optional `task.model: string` and `Provider.Service.list()`.
- Produces: selected `{ providerID: ProviderV2.ID; modelID: ModelV2.ID }` passed to `TaskPromptOps.prompt` and Task metadata.

- [ ] **Step 1: Write failing override and invalid-model tests**

Add tests to `task.test.ts` using `stubOps({ onPrompt })`:

```ts
expect(seen?.model).toEqual({
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("alternate-model"),
})
```

Execute Task with `model: "test/alternate-model"`. Add a second test asserting `model: "missing/model"` fails before `onPrompt` runs. Keep an existing no-model test as the fallback assertion.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `bun test packages/opencode/test/tool/task.test.ts`

Expected: override test fails because Task still selects only `next.model` or the parent model; invalid model is currently accepted.

- [ ] **Step 3: Add parameter and resolve the override**

In `task.ts`, add:

```ts
model: Schema.optional(Schema.String).annotate({
  description: "Optional provider/model-id to use for this subagent",
}),
```

Resolve it before `sessions.create`: split at the first `/`, reject empty components, call `Provider.Service.list()`, and reject IDs absent from the returned provider/model map. When valid, use `ProviderV2.ID.make(providerID)` and `ModelV2.ID.make(modelID)`; otherwise retain the current `next.model ?? parent` result.

- [ ] **Step 4: Use the resolved model everywhere Task already carries model state**

Keep the existing `metadata.model` and `ops.prompt({ model: ... })` paths, replacing their current `model` local with the validated selected model. Do not change child permissions, `BackgroundJob`, notification injection, or renderer output.

- [ ] **Step 5: Run focused tests and type-check**

Run: `bun test packages/opencode/test/tool/task.test.ts packages/opencode/test/tool/models.test.ts`

Expected: PASS.

Run: `bun run typecheck --filter=@opencode-ai/opencode`

Expected: exits 0.

- [ ] **Step 6: Check whitespace**

Run: `git diff --check`

Expected: exits 0.

## Self-Review

- Spec coverage: Task gets optional validated model selection while retaining its native lifecycle; Models lists all configured IDs; focused tests cover override, fallback, invalid IDs, and listing.
- Placeholder scan: no deferred implementation steps.
- Type consistency: Task and Models both use `ProviderV2.ID` and `ModelV2.ID` values sourced from `Provider.Service`.
