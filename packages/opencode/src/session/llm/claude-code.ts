import { createSdkMcpServer, InMemorySessionStore, query, tool, type Options } from "@anthropic-ai/claude-agent-sdk"
import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { createRequire } from "module"
import { LLMEvent, ToolResultValue, type FinishReason } from "@opencode-ai/llm"
import { asSchema, type ModelMessage, type Tool } from "ai"
import { errorMessage } from "@/util/error"
import { claudeCodeEnvironment } from "@/provider/claude-code"
import { ulid } from "ulid"
import z from "zod"

type BridgeInput = {
  readonly server: string
  readonly tools: Record<string, Tool>
  readonly messages: ModelMessage[]
  readonly abort: AbortSignal
  readonly emit: (event: LLMEvent) => void
}

type StreamInput = Omit<BridgeInput, "emit"> & {
  readonly prompt: string
  readonly systemPrompt?: string
  readonly cwd: string
  readonly metadata?: SessionMetadata
  readonly alias: string
  readonly resolvedModel: string
  readonly lineage: string
  readonly processInstanceID: string
  readonly onSessionID?: (sessionID: string, resolvedModel?: string) => Promise<void>
  readonly resumable: boolean
  readonly query?: (input: { prompt: string; options: unknown }) => AsyncIterable<unknown>
}

export type SessionMetadata = {
  readonly sessionID: string
  readonly processInstanceID: string
  readonly alias: string
  readonly resolvedModel: string
  readonly lineage: string
  readonly completedTaskIDs?: readonly string[]
}

export const PROCESS_INSTANCE_ID = crypto.randomUUID()

const sessionStore = new InMemorySessionStore()

export function project(messages: ModelMessage[], incremental: boolean) {
  const selected = incremental ? messages.findLast((message) => message.role === "user") : undefined
  const source = selected ? [selected] : messages
  return source.map((message) => `${message.role.toUpperCase()}:\n${content(message.content)}`).join("\n\n")
}

export function canResume(previous: SessionMetadata, current: SessionMetadata) {
  return (
    previous.processInstanceID === current.processInstanceID &&
    previous.alias === current.alias &&
    previous.resolvedModel === current.resolvedModel &&
    previous.lineage === current.lineage
  )
}

export function claimTask(metadata: SessionMetadata, taskID: string) {
  if (metadata.completedTaskIDs?.includes(taskID)) return { claimed: false, metadata }
  return { claimed: true, metadata: { ...metadata, completedTaskIDs: [...(metadata.completedTaskIDs ?? []), taskID] } }
}

export function mergeMetadata(metadata: object, mapping: SessionMetadata): Record<string, unknown> {
  const current = (metadata as Record<string, unknown>).claudeCode
  const completedTaskIDs =
    current && typeof current === "object" && Array.isArray((current as Record<string, unknown>).completedTaskIDs)
      ? (current as SessionMetadata).completedTaskIDs
      : undefined
  return { ...(metadata as Record<string, unknown>), claudeCode: { ...mapping, ...(completedTaskIDs ? { completedTaskIDs } : {}) } }
}

export function request(input: {
  metadata?: SessionMetadata
  current: SessionMetadata
  messages: ModelMessage[]
  resumable: boolean
}) {
  const resume = input.resumable && input.metadata && canResume(input.metadata, input.current) ? input.metadata.sessionID : undefined
  return { prompt: project(input.messages, Boolean(resume)), resume }
}

export async function* withEmitted<T, U>(emitted: T[], source: Iterable<U> | AsyncIterable<U>): AsyncGenerator<T | U> {
  while (emitted.length) yield emitted.shift()!
  for await (const item of source) yield item
  while (emitted.length) yield emitted.shift()!
}

export async function capture(input: Pick<StreamInput, "onSessionID">, message: unknown) {
  if (!message || typeof message !== "object") return
  const value = message as Record<string, unknown>
  if (value.type !== "system" || value.subtype !== "init" || typeof value.session_id !== "string") return
  await input.onSessionID?.(value.session_id, typeof value.model === "string" ? value.model : undefined)
}

export function allowedName(server: string, name: string) {
  return `mcp__${server}__${name}`
}

export function allowedTools(server: string, names: Iterable<string>) {
  return [...names].map((name) => allowedName(server, name))
}

export function tools(input: BridgeInput) {
  return Object.entries(input.tools).map(([name, item]) =>
    tool(
      name,
      `${item.description ?? ""}\n\nOpenCode input JSON Schema:\n${JSON.stringify(schema(item))}`,
      { input: z.string() },
      async ({ input: raw }): Promise<CallToolResult> => {
        const id = ulid()
        const parsed = parseInput(raw)
        input.emit(LLMEvent.toolCall({ id, name, input: parsed.value, providerExecuted: true }))
        if (parsed.error) return failed(input, id, name, parsed.error)
        if (input.abort.aborted) return failed(input, id, name, "tool execution cancelled")
        try {
          if (!item.execute) throw new Error(`Tool has no execute handler: ${name}`)
          const args = await validate(item, parsed.value)
          const result = await item.execute(args, {
            toolCallId: id,
            messages: input.messages,
            abortSignal: input.abort,
          })
          input.emit(
            LLMEvent.toolResult({ id, name, result: ToolResultValue.make(result), providerExecuted: true }),
          )
          return resultToMcp(result)
        } catch (error) {
          return failed(input, id, name, errorMessage(error))
        }
      },
    ),
  )
}

export function server(input: BridgeInput) {
  return createSdkMcpServer({ name: input.server, tools: tools(input) })
}

export async function* stream(input: StreamInput) {
  const controller = new AbortController()
  input.abort.addEventListener("abort", () => controller.abort(), { once: true })
  const current: SessionMetadata = {
    sessionID: input.metadata?.sessionID ?? "",
    processInstanceID: input.processInstanceID,
    alias: input.alias,
    resolvedModel: input.resolvedModel,
    lineage: input.lineage,
  }
  const selected = request({
    metadata: input.metadata,
    current,
    messages: input.messages,
    resumable: input.resumable,
  })
  const emitted: LLMEvent[] = []
  const bridge: BridgeInput = { ...input, emit: (event) => emitted.push(event) }
  const options = {
       model: input.resolvedModel,
       cwd: input.cwd,
      abortController: controller,
      includePartialMessages: true,
      settingSources: [],
      permissionMode: "dontAsk",
      env: claudeCodeEnvironment(process.env).env,
      tools: [],
      allowedTools: allowedTools(bridge.server, Object.keys(bridge.tools)),
      mcpServers: { [bridge.server]: server(bridge) },
       sessionStore,
       ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
       ...(selected.resume ? { resume: selected.resume } : {}),
      ...(input.query ? {} : { pathToClaudeCodeExecutable: extractFromBunfs(await executable()) }),
    } satisfies Options
  const result = input.query ? input.query({ prompt: selected.prompt, options }) : query({ prompt: selected.prompt, options })
  const state = adapterState()
  try {
    for await (const message of result) {
      await capture(input, message)
      yield* withEmitted(emitted, adapt(state, message))
    }
  } finally {
    while (emitted.length) yield emitted.shift()!
  }
}

function content(value: ModelMessage["content"]) {
  if (typeof value === "string") return value
  return value
    .map((part) => {
      if (part.type === "text") return part.text
      if (part.type === "tool-call" || part.type === "tool-result") return JSON.stringify(part)
      if (part.type === "reasoning") return ""
      throw new Error(`Claude Code cannot project ${part.type} history`)
    })
    .join("\n")
}

export async function events(messages: Iterable<unknown>) {
  const state = adapterState()
  return [...messages].flatMap((message) => adapt(state, message))
}

function adapterState() {
  return {
    step: 0,
    text: new Set<number>(),
    textID: new Map<number, string>(),
    assistantText: new Map<number, string>(),
    reasoningID: new Map<number, string>(),
    started: false,
  }
}

function adapt(state: ReturnType<typeof adapterState>, value: unknown): LLMEvent[] {
  if (!value || typeof value !== "object") return []
  const message = value as Record<string, unknown>
  if (message.type === "stream_event") {
    const event = message.event
    if (!event || typeof event !== "object") return []
    const chunk = event as Record<string, unknown>
    if (chunk.type !== "content_block_delta" || !chunk.delta || typeof chunk.delta !== "object") return []
    const delta = chunk.delta as Record<string, unknown>
    if (delta.type !== "text_delta" && delta.type !== "thinking_delta") return []
    const index = typeof chunk.index === "number" ? chunk.index : 0
    const start = state.started ? [] : [LLMEvent.stepStart({ index: state.step })]
    state.started = true
    if (delta.type === "thinking_delta") {
      if (typeof delta.thinking !== "string") return []
      const id = state.reasoningID.get(index) ?? `reasoning-${index}`
      const begin = state.reasoningID.has(index) ? [] : [LLMEvent.reasoningStart({ id })]
      state.reasoningID.set(index, id)
      return [...start, ...begin, LLMEvent.reasoningDelta({ id, text: delta.thinking })]
    }
    if (typeof delta.text !== "string") return []
    const known = state.text.has(index)
    state.text.add(index)
    const id = state.textID.get(index) ?? `text-${index}`
    state.textID.set(index, id)
    const begin = known ? [] : [LLMEvent.textStart({ id })]
    return [...start, ...begin, LLMEvent.textDelta({ id, text: delta.text })]
  }
  if (message.type === "assistant") {
    const content = message.message && typeof message.message === "object" ? (message.message as Record<string, unknown>).content : []
    if (!Array.isArray(content)) return []
    content.forEach((part, index) => {
      if (!part || typeof part !== "object") return
      const block = part as Record<string, unknown>
      if (block.type !== "text" || typeof block.text !== "string" || state.text.has(index)) return
      state.assistantText.set(index, block.text)
    })
    return []
  }
  if (message.type === "result") {
    if (message.is_error === true || (typeof message.subtype === "string" && message.subtype !== "success")) {
      return [LLMEvent.providerError({ message: typeof message.result === "string" ? message.result : "Claude Code request failed" })]
    }
    const reason = finishReason(message.stop_reason)
    const pending = [...state.assistantText].filter(([index]) => !state.text.has(index)).flatMap(([index, text]) => {
      const id = `text-${index}`
      state.text.add(index)
      state.textID.set(index, id)
      return [LLMEvent.textStart({ id }), LLMEvent.textDelta({ id, text })]
    })
    const fallback = pending.length === 0 && state.textID.size === 0 && typeof message.result === "string" && message.result
      ? [
          LLMEvent.textStart({ id: "text-0" }),
          LLMEvent.textDelta({ id: "text-0", text: message.result }),
          LLMEvent.textEnd({ id: "text-0" }),
        ]
      : []
    const start = !state.started && (pending.length > 0 || fallback.length > 0) ? [LLMEvent.stepStart({ index: state.step })] : []
    if (start.length) state.started = true
    const events = [
      ...start,
      ...pending,
      ...fallback,
      ...state.textID.values().map((id) => LLMEvent.textEnd({ id })),
      ...state.reasoningID.values().map((id) => LLMEvent.reasoningEnd({ id })),
      ...(state.started ? [LLMEvent.stepFinish({ index: state.step++, reason })] : []),
    ]
    return [...events, LLMEvent.finish({ reason })]
  }
  return []
}

function schema(item: Tool) {
  if (!item.inputSchema) return { type: "object", properties: {} }
  return asSchema(item.inputSchema).jsonSchema
}

function parseInput(raw: string): { value: Record<string, unknown>; error?: string } {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value: {}, error: "input must be a JSON object" }
    return { value: value as Record<string, unknown> }
  } catch (error) {
    return { value: {}, error: errorMessage(error) }
  }
}

async function validate(item: Tool, value: Record<string, unknown>) {
  const prepared = item as Tool & { __opencodeValidate?: (args: unknown) => Promise<unknown> }
  return (await prepared.__opencodeValidate?.(value)) ?? value
}

function failed(input: BridgeInput, id: string, name: string, message: string) {
  input.emit(
    LLMEvent.toolResult({ id, name, result: { type: "error", value: message }, providerExecuted: true }),
  )
  return { content: [{ type: "text", text: message }], isError: true } satisfies CallToolResult
}

function resultToMcp(result: unknown): CallToolResult {
  const value = result && typeof result === "object" ? (result as Record<string, unknown>) : undefined
  const content = Array.isArray(value?.content)
    ? value.content
    : [
        { type: "text" as const, text: typeof value?.output === "string" ? value.output : JSON.stringify(result) ?? "" },
        ...(Array.isArray(value?.attachments)
          ? value.attachments.flatMap((attachment) => {
              if (!attachment || typeof attachment !== "object") return []
              const item = attachment as Record<string, unknown>
              if (typeof item.mime !== "string" || !item.mime.startsWith("image/") || typeof item.url !== "string") return []
              const match = item.url.match(/^data:([^;]+);base64,(.+)$/)
              return match ? [{ type: "image" as const, mimeType: match[1], data: match[2] }] : []
            })
          : []),
      ]
  return {
    content,
    ...(value?.structuredContent && typeof value.structuredContent === "object"
      ? { structuredContent: value.structuredContent as Record<string, unknown> }
      : {}),
  }
}

function finishReason(value: unknown): FinishReason {
  if (value === "end_turn") return "stop"
  if (value === "max_tokens") return "length"
  if (value === "tool_use") return "tool-calls"
  return "unknown"
}

export async function executable(input: { standalone?: boolean; embedded?: () => Promise<string> } = {}) {
  const standalone = input.standalone ?? Bun.embeddedFiles.length > 0
  if (!standalone) {
    return createRequire(import.meta.resolve("@anthropic-ai/claude-agent-sdk")).resolve(
      `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform === "win32" ? "claude.exe" : "claude"}`,
    )
  }
  return (input.embedded ?? embeddedExecutable)()
}

async function embeddedExecutable() {
  // Generated and embedded by script/build.ts; source runs never resolve this virtual module.
  // @ts-expect-error build-only virtual module
  const generated = await import("opencode-claude-code.gen.ts")
  return generated.default
}

export * as ClaudeCodeLLM from "./claude-code"
