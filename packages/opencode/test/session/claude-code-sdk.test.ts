import { expect, test } from "bun:test"
import { createSdkMcpServer, InMemorySessionStore, query, tool } from "@anthropic-ai/claude-agent-sdk"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import fs from "fs/promises"
import os from "os"
import path from "path"
import z from "zod"

const live = process.env.CLAUDE_CODE_LIVE_TEST === "1"

test("accepts an OpenCode-shaped MCP result from a Zod raw shape", async () => {
  const result = {
    content: [
      { type: "text", text: "pong" },
      { type: "text", text: JSON.stringify({ ok: true }) },
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ],
    structuredContent: { ok: true },
    isError: true,
  } satisfies CallToolResult
  const ping = tool("ping", "Return a test result", { input: z.string() }, async ({ input }) => {
    const value: unknown = JSON.parse(input)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("input must be a JSON object")
    return result
  })
  const server = createSdkMcpServer({ name: "opencode", version: "1.0.0", tools: [ping] })

  expect(ping.name).toBe("ping")
  expect(await ping.handler({ input: '{"ok":true}' }, undefined)).toEqual(result)
  expect(server.name).toBe("opencode")
})

test.skipIf(!live)("proves the live Agent SDK contract with the default Claude Code configuration", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-claude-sdk-"))
  const toolName = "mcp__opencode__ping"
  const store = new InMemorySessionStore()
  const env = {
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    LOGNAME: process.env.LOGNAME,
    PATH: process.env.PATH,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  }
  let calls = 0
  let sessionID: string | undefined
  const events: string[] = []
  const server = createSdkMcpServer({
    name: "opencode",
    tools: [
      tool("ping", "Return pong", { input: z.string() }, async ({ input }) => {
        if (!sessionID) throw new Error("Agent SDK did not emit a session ID before the MCP handler")
        const value: unknown = JSON.parse(input)
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("input must be a JSON object")
        const parsed = value as Record<string, unknown>
        calls++
        events.push("handler")
        return {
          content: [
            { type: "text", text: "pong" },
            { type: "text", text: JSON.stringify(value) },
            { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
          ],
          structuredContent: parsed,
          isError: true,
        }
      }),
    ],
  })

  try {
    const run = query({
      prompt: 'Call mcp__opencode__ping exactly once with input "{\\"request\\":\\"ping\\"}", then reply with PONG.',
      options: {
        cwd: root,
        tools: [],
        allowedTools: [toolName],
        permissionMode: "dontAsk",
        settingSources: [],
        includePartialMessages: true,
        sessionStore: store,
        mcpServers: { opencode: server },
        env,
      },
    })
    const messages = []
    for await (const message of run) {
      if (message.type === "system" && message.subtype === "init") {
        sessionID = message.session_id
        events.push("init")
      }
      messages.push(message)
    }

    const init = messages.find((message) => message.type === "system" && message.subtype === "init")
    if (!init) throw new Error("Agent SDK did not emit an init message")
    expect(init.tools).toContain(toolName)
    expect(sessionID).toBeTruthy()
    expect(init.tools.filter((name) => name.startsWith("mcp__"))).toEqual([toolName])
    expect(calls).toBe(1)
    expect(events.indexOf("init")).toBeLessThan(events.indexOf("handler"))

    const toolUse = messages
      .filter((message) => message.type === "assistant")
      .flatMap((message) => message.message.content)
      .find((block) => block.type === "tool_use" && block.name === toolName)
    expect(toolUse && "id" in toolUse ? toolUse.id : undefined).toBeTruthy()

    const partials = messages.filter((message) => message.type === "stream_event")
    expect(partials.some((message) => message.event.type === "content_block_delta" && message.event.delta.type === "text_delta")).toBe(true)

    const result = messages.find((message) => message.type === "result")
    if (!result || result.subtype !== "success") throw new Error("Agent SDK did not return a successful result")
    const partialText = [...
      partials.flatMap((message) => message.event.type === "content_block_delta" && message.event.delta.type === "text_delta" ? [message.event.delta.text] : []),
    ].join("")
    expect(result.result).toContain("PONG")
    // The adapter selects deltas when present rather than appending the final result.
    expect((partialText || result.result).match(/PONG/g)?.length ?? 0).toBe(1)

    const resumed = query({
      prompt: "Reply with RESUMED.",
      options: {
        cwd: root,
        tools: [],
        allowedTools: [toolName],
        permissionMode: "dontAsk",
        settingSources: [],
        sessionStore: store,
        resume: result.session_id,
        mcpServers: { opencode: server },
        env,
      },
    })
    const resumedMessages = []
    for await (const message of resumed) resumedMessages.push(message)
    expect(resumedMessages.some((message) => message.type === "result" && message.subtype === "success")).toBe(true)

    const forbidden = path.join(root, "forbidden")
    const denied = query({
      prompt: `Use Bash to create ${forbidden}, then reply with DENIED.`,
      options: {
        cwd: root,
        tools: ["Bash"],
        allowedTools: [toolName],
        permissionMode: "dontAsk",
        settingSources: [],
        mcpServers: { opencode: server },
        env,
      },
    })
    const deniedMessages = []
    for await (const message of denied) deniedMessages.push(message)
    expect(
      deniedMessages
        .filter((message) => message.type === "assistant")
        .flatMap((message) => message.message.content)
        .some((block) => block.type === "tool_use" && block.name === "Bash"),
    ).toBe(true)
    expect(await Bun.file(forbidden).exists()).toBe(false)

    expect("ANTHROPIC_API_KEY" in env).toBe(false)
    const account = await run.accountInfo()
    expect(account.apiProvider).toBe("firstParty")
    expect(account.subscriptionType).toBeTruthy()
    const models = await run.supportedModels()
    const families = ["haiku", "sonnet", "opus", "fable"]
    const expected = {
      haiku: "haiku",
      sonnet: "sonnet",
      opus: "opus[1m]",
      fable: "claude-fable-5-1[1m]",
    }
    const modelByFamily = Object.fromEntries(
      families.map((family) => {
        const matches = models.filter((model) => new RegExp(`^(?:${family}|claude-${family}-[a-z0-9-]+)(?:\\[\\d+m\\])?$`).test(model.value))
        if (!matches.length) return [family, undefined]
        expect(matches).toEqual([expect.objectContaining({ value: expected[family as keyof typeof expected] })])
        return [family, matches[0].value]
      }),
    )
    expect(Object.values(modelByFamily).filter(Boolean).length).toBeGreaterThan(0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)
