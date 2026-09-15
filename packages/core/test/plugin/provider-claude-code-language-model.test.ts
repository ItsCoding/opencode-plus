import { expect, test } from "bun:test"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import {
  ClaudeCodeToolUseError,
  createClaudeCodeLanguageModel,
  type ClaudeCodeQuery,
} from "@opencode/core/plugin/provider/claude-code-language-model"

const options = (abortSignal?: AbortSignal) =>
  ({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    tools: [],
    abortSignal,
  }) as LanguageModelV3CallOptions

const parts = async (model: ReturnType<typeof createClaudeCodeLanguageModel>, abortSignal?: AbortSignal) =>
  Array.fromAsync((await model.doStream(options(abortSignal))).stream)

test("streams Claude text through AI SDK parts", async () => {
  const query: ClaudeCodeQuery = async function* () {
    yield { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }
    yield { type: "assistant", message: { content: [{ type: "text", text: " world" }] } }
    yield { type: "result", subtype: "success" }
  }

  expect(await parts(createClaudeCodeLanguageModel({ modelID: "sonnet", query }))).toEqual([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text-0" },
    { type: "text-delta", id: "text-0", delta: "Hello" },
    { type: "text-delta", id: "text-0", delta: " world" },
    { type: "text-end", id: "text-0" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "success" },
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
    },
  ] satisfies LanguageModelV3StreamPart[])
})

test("preserves text role boundaries and ordering in Claude messages", async () => {
  let received: unknown
  const query: ClaudeCodeQuery = async function* (input) {
    received = input
    yield { type: "result", subtype: "success" }
  }
  const model = createClaudeCodeLanguageModel({ modelID: "sonnet", query })
  const result = await model.doStream({
    ...options(),
    prompt: [
      { role: "system", content: "System instructions" },
      { role: "user", content: [{ type: "text", text: "First user message" }] },
      { role: "assistant", content: [{ type: "text", text: "Assistant response" }] },
      { role: "user", content: [{ type: "text", text: "Second user message" }] },
    ],
  })
  await Array.fromAsync(result.stream)

  const input = received as {
    readonly prompt: AsyncIterable<unknown>
    readonly options: { readonly systemPrompt?: string }
  }
  expect(input.options.systemPrompt).toBe("System instructions")
  expect(await Array.fromAsync(input.prompt)).toEqual([
    {
      type: "user",
      message: { role: "user", content: "First user message" },
      parent_tool_use_id: null,
      shouldQuery: false,
    },
    {
      type: "user",
      message: { role: "user", content: "<assistant>\nAssistant response\n</assistant>" },
      parent_tool_use_id: null,
      shouldQuery: false,
    },
    {
      type: "user",
      message: { role: "user", content: "Second user message" },
      parent_tool_use_id: null,
      shouldQuery: true,
    },
  ])
})

test("rejects non-text prompt content before starting Claude", async () => {
  let started = false
  const error = await createClaudeCodeLanguageModel({
    modelID: "sonnet",
    query: async function* () {
      started = true
    },
  })
    .doStream({
      ...options(),
      prompt: [
        {
          role: "user",
          content: [{ type: "file", mediaType: "text/plain", data: "not-supported", filename: "note.txt" }],
        },
      ],
    })
    .then(
      () => undefined,
      (error) => error,
    )

  expect(error).toHaveProperty("message", "Claude Code only supports text prompt content")
  expect(started).toBeFalse()
})

test("maps Claude result errors to AI SDK error parts", async () => {
  const query: ClaudeCodeQuery = async function* () {
    yield { type: "result", subtype: "error_max_turns", errors: ["Claude stopped"] }
  }

  expect(await parts(createClaudeCodeLanguageModel({ modelID: "sonnet", query }))).toEqual([
    { type: "stream-start", warnings: [] },
    { type: "error", error: new Error("Claude stopped") },
  ])
})

test("forwards AI SDK abort signals to the Claude query", async () => {
  let controller: AbortController | undefined
  const query: ClaudeCodeQuery = async function* (input) {
    controller = input.options.abortController
    await new Promise<void>((resolve) => input.options.abortController.signal.addEventListener("abort", () => resolve()))
  }
  const abort = new AbortController()
  const model = createClaudeCodeLanguageModel({ modelID: "sonnet", query })
  const result = parts(model, abort.signal)
  abort.abort()

  await result
  expect(controller?.signal.aborted).toBeTrue()
})

test("rejects an already-aborted AI SDK request before starting Claude", async () => {
  let started = false
  const abort = new AbortController()
  const reason = new Error("Request aborted")
  abort.abort(reason)
  const error = await createClaudeCodeLanguageModel({
    modelID: "sonnet",
    query: async function* () {
      started = true
    },
  })
    .doStream(options(abort.signal))
    .then(
      () => undefined,
      (error) => error,
    )

  expect(error).toBe(reason)
  expect(started).toBeFalse()
})

test("rejects Core tools so the runner remains the tool executor", async () => {
  const model = createClaudeCodeLanguageModel({
    modelID: "sonnet",
    query: async function* () {},
  })
  const error = await model
    .doStream({ ...options(), tools: [{ type: "function", name: "read", inputSchema: { type: "object" } }] })
    .then(
      () => undefined,
      (error) => error,
    )

  expect(error).toBeInstanceOf(ClaudeCodeToolUseError)
  expect(error).toHaveProperty("message", "Claude Code subscription does not support Core tools yet")
})
