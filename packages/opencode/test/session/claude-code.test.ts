import { expect, test } from "bun:test"
import { jsonSchema, tool } from "ai"
import { mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"
import { createRequire } from "module"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { ClaudeCodeLLM } from "../../src/session/llm/claude-code"
import z from "zod"

test("projects full history once and only the latest user input on resume", () => {
  const messages = [
    { role: "system" as const, content: "system" },
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "answer" },
    { role: "user" as const, content: "second" },
  ]

  expect(ClaudeCodeLLM.project(messages, false)).toContain("first")
  expect(ClaudeCodeLLM.project(messages, false)).toContain("answer")
  expect(ClaudeCodeLLM.project(messages, true)).toBe("USER:\nsecond")
})

test("omits reasoning history when a Claude session cannot resume", () => {
  const messages = [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: [{ type: "reasoning" as const, text: "private thought" }] },
    { role: "user" as const, content: "second" },
  ]

  expect(ClaudeCodeLLM.project(messages, false)).toBe("USER:\nfirst\n\nASSISTANT:\n\n\nUSER:\nsecond")
})

test("accepts resume metadata only when process, alias, model, and lineage match", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }

  expect(ClaudeCodeLLM.canResume(mapping, mapping)).toBe(true)
  expect(ClaudeCodeLLM.canResume(mapping, { ...mapping, alias: "opus" })).toBe(false)
  expect(ClaudeCodeLLM.canResume(mapping, { ...mapping, processInstanceID: "other" })).toBe(false)
})

test("starts title and summary requests fresh with full history", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }
  const messages = [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "answer" },
    { role: "user" as const, content: "second" },
  ]

  expect(ClaudeCodeLLM.request({ metadata: mapping, current: mapping, messages, resumable: false })).toEqual({
    prompt: "USER:\nfirst\n\nASSISTANT:\nanswer\n\nUSER:\nsecond",
    resume: undefined,
  })
})

test("resumes only the same-process matching mapping with incremental input", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }
  const messages = [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "answer" },
    { role: "user" as const, content: "second" },
  ]

  expect(ClaudeCodeLLM.request({ metadata: mapping, current: mapping, messages, resumable: true })).toEqual({
    prompt: "USER:\nsecond",
    resume: "sdk-session",
  })
  expect(
    ClaudeCodeLLM.request({ metadata: mapping, current: { ...mapping, processInstanceID: "next" }, messages, resumable: true }),
  ).toEqual({
    prompt: "USER:\nfirst\n\nASSISTANT:\nanswer\n\nUSER:\nsecond",
    resume: undefined,
  })
})

test("passes the subscription-resolved SDK model ID to every adapter query", async () => {
  let options: Record<string, unknown> | undefined
  for await (const _ of ClaudeCodeLLM.stream({
    server: "opencode",
    prompt: "reply",
    cwd: process.cwd(),
    messages: [],
    abort: new AbortController().signal,
    tools: {},
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5[1m]",
    lineage: "session",
    processInstanceID: "process",
    resumable: false,
    query: async function* (input) {
      options = input.options as Record<string, unknown>
      yield { type: "result", stop_reason: "end_turn", result: "done" }
    },
  })) {
  }

  expect(options?.model).toBe("claude-sonnet-4-5[1m]")
})

test("resolves the Claude executable from the source package or embedded build asset", async () => {
  const source = await ClaudeCodeLLM.executable({ standalone: false })
  expect(await Bun.file(source).exists()).toBe(true)
  await expect(
    ClaudeCodeLLM.executable({ standalone: true, embedded: async () => "/$bunfs/root/claude" }),
  ).resolves.toBe("/$bunfs/root/claude")
})

test("delivers provider-executed events before the next SDK event", async () => {
  const emitted = [{ type: "tool-call", providerExecuted: true }]
  const result = []
  for await (const event of ClaudeCodeLLM.withEmitted(emitted, [{ type: "text-delta", text: "done" }])) {
    result.push(event)
  }

  expect(result).toEqual([{ type: "tool-call", providerExecuted: true }, { type: "text-delta", text: "done" }])
})

test("captures the SDK session before a prepared tool handler runs", async () => {
  const order: string[] = []
  await ClaudeCodeLLM.capture(
    {
      onSessionID: async () => {
        order.push("captured")
      },
    },
    { type: "system", subtype: "init", session_id: "sdk-session" },
  )
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: new AbortController().signal,
    emit: () => {},
    tools: {
      ping: tool({
        description: "Return pong",
        inputSchema: z.object({}),
        execute: async () => {
          order.push("handler")
          return { title: "Ping", output: "pong", metadata: {} }
        },
      }),
    },
  })

  await sdkTool.handler({ input: "{}" }, undefined)
  expect(order).toEqual(["captured", "handler"])
})

test("merges a newly captured SDK session into existing metadata", () => {
  const existing = { user: "value", claudeCode: { alias: "old" } }
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }

  expect(ClaudeCodeLLM.mergeMetadata(existing, mapping)).toEqual({ user: "value", claudeCode: mapping })
})

test("bridges raw SDK input through the prepared OpenCode tool", async () => {
  const events: unknown[] = []
  let calls = 0
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: new AbortController().signal,
    emit: (event) => events.push(event),
    tools: {
      ping: tool({
        description: "Return pong",
        inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }),
        execute: async (input) => {
          calls++
          return {
          title: "Ping",
          output: `pong ${input.value}`,
          metadata: {},
          structuredContent: { value: input.value },
          attachments: [{ mime: "image/png", url: "data:image/png;base64,aGVsbG8=" }],
          }
        },
      }),
    },
  })

  expect(sdkTool.name).toBe("ping")
  expect(sdkTool.description).toContain('"required":["value"]')
  expect(await sdkTool.handler({ input: '{"value":"ok"}' }, undefined)).toEqual({
    content: [
      { type: "text", text: "pong ok" },
      { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
    ],
    structuredContent: { value: "ok" },
  })
  expect(events).toMatchObject([
    { type: "tool-call", name: "ping", input: { value: "ok" }, providerExecuted: true },
    { type: "tool-result", name: "ping", providerExecuted: true },
  ])
  expect((events[0] as { id: string }).id).toBe((events[1] as { id: string }).id)
  expect(calls).toBe(1)
  expect(ClaudeCodeLLM.allowedName("opencode", "ping")).toBe("mcp__opencode__ping")
})

test("settles malformed and failed SDK MCP calls as errors", async () => {
  const events: unknown[] = []
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: new AbortController().signal,
    emit: (event) => events.push(event),
    tools: {
      denied: tool({
        description: "Denied",
        inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }),
        execute: async (input) => {
          if (input.value !== "allow") throw new Error("denied")
          return { title: "Denied", output: "allowed", metadata: {} }
        },
      }),
    },
  })

  expect(await sdkTool.handler({ input: "[]" }, undefined)).toMatchObject({ isError: true })
  expect(await sdkTool.handler({ input: "{}" }, undefined)).toMatchObject({ isError: true })
  expect(events).toMatchObject([
    { type: "tool-call", name: "denied", providerExecuted: true },
    { type: "tool-result", name: "denied", providerExecuted: true },
    { type: "tool-call", name: "denied", providerExecuted: true },
    { type: "tool-result", name: "denied", providerExecuted: true },
  ])
  expect((events[1] as { result: { type: string } }).result.type).toBe("error")
})

test("uses the OpenCode validator bridge before executing prepared tools", async () => {
  let calls = 0
  const prepared = Object.assign(
    tool({
      description: "Validated",
      inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }),
      execute: async () => {
        calls++
        return { title: "Validated", output: "ok", metadata: {} }
      },
    }),
    { __opencodeValidate: async () => Promise.reject(new Error("invalid Effect schema")) },
  )
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: new AbortController().signal,
    emit: () => {},
    tools: { validated: prepared },
  })

  expect(await sdkTool.handler({ input: '{"value":1}' }, undefined)).toMatchObject({ isError: true })
  expect(calls).toBe(0)
})

test("derives allowed SDK names from the server key and raw tool names", () => {
  expect(ClaudeCodeLLM.allowedTools("opencode", ["ping", "read"])).toEqual([
    "mcp__opencode__ping",
    "mcp__opencode__read",
  ])
})

test("settles cancelled SDK MCP calls without executing the tool", async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: controller.signal,
    emit: () => {},
    tools: {
      wait: tool({
        description: "Wait",
        inputSchema: z.object({}),
        execute: async () => {
          calls++
          return { title: "Wait", output: "done", metadata: {} }
        },
      }),
    },
  })

  expect(await sdkTool.handler({ input: "{}" }, undefined)).toMatchObject({ isError: true })
  expect(calls).toBe(0)
})

test("converts built-in denials and object results to MCP content", async () => {
  const [sdkTool] = ClaudeCodeLLM.tools({
    server: "opencode",
    messages: [],
    abort: new AbortController().signal,
    emit: () => {},
    tools: {
      denied: tool({
        description: "Denied",
        inputSchema: z.object({ deny: z.boolean() }),
        execute: async (input) => {
          if (input.deny) throw new PermissionV1.RejectedError()
          return { value: "converted" }
        },
      }),
    },
  })

  expect(await sdkTool.handler({ input: '{"deny":true}' }, undefined)).toMatchObject({ isError: true })
  expect(await sdkTool.handler({ input: '{"deny":false}' }, undefined)).toEqual({
    content: [{ type: "text", text: '{"value":"converted"}' }],
  })
})

test("uses streamed deltas instead of duplicating final assistant text", async () => {
  const events = await ClaudeCodeLLM.events([
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "par" } } },
    { type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "thinking_delta", thinking: "think" } } },
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "tial" } } },
    { type: "assistant", message: { content: [{ type: "text", text: "final" }] } },
    { type: "result", subtype: "success", stop_reason: "end_turn", result: "partial" },
  ])

  expect(events).toMatchObject([
    { type: "step-start", index: 0 },
    { type: "text-start", id: "text-0" },
    { type: "text-delta", id: "text-0", text: "par" },
    { type: "reasoning-start", id: "reasoning-1" },
    { type: "reasoning-delta", id: "reasoning-1", text: "think" },
    { type: "text-delta", id: "text-0", text: "tial" },
    { type: "text-end", id: "text-0" },
    { type: "reasoning-end", id: "reasoning-1" },
    { type: "step-finish", index: 0, reason: "stop" },
    { type: "finish", reason: "stop" },
  ])
  expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe("partial")
})

test("uses streamed deltas when the complete assistant message arrives first", async () => {
  const events = await ClaudeCodeLLM.events([
    { type: "assistant", message: { content: [{ type: "text", text: "title" }] } },
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "title" } } },
    { type: "result", subtype: "success", stop_reason: "end_turn", result: "title" },
  ])

  expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe("title")
})

test("creates a complete text block when the SDK has no deltas", async () => {
  const events = await ClaudeCodeLLM.events([
    { type: "assistant", message: { content: [{ type: "text", text: "final" }] } },
    { type: "result", subtype: "success", stop_reason: "end_turn", result: "final" },
  ])

  expect(events).toMatchObject([
    { type: "step-start", index: 0 },
    { type: "text-start", id: "text-0" },
    { type: "text-delta", id: "text-0", text: "final" },
    { type: "text-end", id: "text-0" },
    { type: "step-finish", index: 0, reason: "stop" },
    { type: "finish", reason: "stop" },
  ])
})

test("uses the final SDK result when no assistant text was emitted", async () => {
  const events = await ClaudeCodeLLM.events([
    { type: "result", subtype: "success", stop_reason: "end_turn", result: "fallback" },
  ])

  expect(events).toMatchObject([
    { type: "step-start", index: 0 },
    { type: "text-start", id: "text-0" },
    { type: "text-delta", id: "text-0", text: "fallback" },
    { type: "text-end", id: "text-0" },
    { type: "step-finish", index: 0, reason: "stop" },
    { type: "finish", reason: "stop" },
  ])
})

test("surfaces failed SDK results as provider errors", async () => {
  const events = await ClaudeCodeLLM.events([
    { type: "result", subtype: "error_during_execution", is_error: true, result: "Claude request failed" },
  ])

  expect(events).toEqual([{ type: "provider-error", message: "Claude request failed" }])
})

test.skipIf(process.env.CLAUDE_CODE_LIVE_TEST !== "1")("runs the adapter from source with the installed Claude executable", async () => {
  let token: string | undefined
  let called = false
  const events = []
  for await (const event of ClaudeCodeLLM.stream({
    server: "opencode",
    prompt: "Call mcp__opencode__required_token exactly once with {}. Do not answer until it returns. Reply with only the token returned by that tool.",
    systemPrompt: "This is a deterministic MCP smoke test. You MUST call mcp__opencode__required_token exactly once before replying. No other tools are available. Your final response MUST contain the token returned by the tool.",
    cwd: process.cwd(),
    messages: [],
    abort: new AbortController().signal,
    tools: {
      required_token: tool({
        description: "Return the required token",
        inputSchema: z.object({}),
        execute: async () => {
          token = crypto.randomUUID()
          called = true
          return { title: "Required token", output: token, metadata: {} }
        },
      }),
    },
    alias: "sonnet",
    resolvedModel: "sonnet",
    lineage: "source-smoke",
    processInstanceID: "source-process",
    resumable: false,
  })) {
    events.push(event)
  }
  expect(events.some((event) => event.type === "finish")).toBe(true)
  expect(called).toBe(true)
  if (!token) throw new Error("MCP tool did not produce a token")
  expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toContain(token)
}, 120_000)

test.skipIf(process.env.CLAUDE_CODE_LIVE_TEST !== "1")("runs the adapter through a packaged Bun binary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opencode-claude-code-live-"))
  const entry = path.join(root, "main.ts")
  const binary = path.join(root, "claude-code-smoke")
  try {
    await Bun.write(
      entry,
       `import { extractFromBunfs } from ${JSON.stringify(createRequire(import.meta.resolve("@anthropic-ai/claude-agent-sdk")).resolve("@anthropic-ai/claude-agent-sdk/extract"))}
 import { jsonSchema, tool } from ${JSON.stringify(createRequire(import.meta.resolve("ai")).resolve("ai"))}
 import { ClaudeCodeLLM } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/session/llm/claude-code.ts"))}
const embedded = await ClaudeCodeLLM.executable()
if (!embedded.startsWith("/$bunfs/")) throw new Error("Claude executable was not imported from the compiled binary")
const executable = extractFromBunfs(embedded)
if (!(await Bun.file(executable).exists())) throw new Error("Embedded Claude executable was not extracted")
 let token: string | undefined
 let called = false
 const events = []
 for await (const event of ClaudeCodeLLM.stream({
   server: "opencode",
    prompt: "Call mcp__opencode__required_token exactly once with {}. Do not answer until it returns. Reply with only the token returned by that tool.",
    systemPrompt: "This is a deterministic MCP smoke test. You MUST call mcp__opencode__required_token exactly once before replying. No other tools are available. Your final response MUST contain the token returned by the tool.",
  cwd: process.cwd(),
  messages: [],
   abort: new AbortController().signal,
   alias: "sonnet",
   resolvedModel: "sonnet",
   lineage: "packaged-smoke",
   processInstanceID: "packaged-process",
   resumable: false,
    tools: {
      required_token: tool({
        description: "Return the required token",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => {
          token = crypto.randomUUID()
          called = true
          return { title: "Required token", output: token, metadata: {} }
        },
      }),
    },
  })) events.push(event)
  if (!events.some((event) => event.type === "finish")) throw new Error("query did not finish")
  if (!called) throw new Error("MCP tool was not executed")
  if (!token) throw new Error("MCP tool did not produce a token")
  if (!events.filter((event) => event.type === "text-delta").map((event) => event.text).join("").includes(token)) {
    throw new Error("assistant response did not contain the required token")
  }`,
    )
    const asset = createRequire(import.meta.resolve("@anthropic-ai/claude-agent-sdk")).resolve(
      `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform === "win32" ? "claude.exe" : "claude"}`,
    )
    const result = await Bun.build({
      entrypoints: [entry],
      compile: { outfile: binary, autoloadBunfig: false, autoloadDotenv: false, autoloadTsconfig: true, autoloadPackageJson: true },
      files: {
        "opencode-claude-code.gen.ts": `import executable from ${JSON.stringify(asset)} with { type: "file" }; export default executable`,
      },
    })
    if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"))
    const child = Bun.spawn([binary], { stdout: "inherit", stderr: "inherit" })
    expect(await child.exited).toBe(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
