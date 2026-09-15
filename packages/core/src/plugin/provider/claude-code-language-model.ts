import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { Option, Schema } from "effect"

export type ClaudeCodeQuery = (input: {
  readonly prompt: AsyncIterable<{
    readonly type: "user"
    readonly message: { readonly role: "user"; readonly content: string }
    readonly parent_tool_use_id: null
    readonly shouldQuery: boolean
  }>
  readonly options: {
    readonly model: string
    readonly abortController: AbortController
    readonly settingSources: []
    readonly tools: []
    readonly systemPrompt?: string
  }
}) => AsyncIterable<unknown>

export class ClaudeCodeToolUseError extends Schema.TaggedError<ClaudeCodeToolUseError>()(
  "ClaudeCodeToolUseError",
  {},
) {
  override get message() {
    return "Claude Code subscription does not support Core tools yet"
  }
}

export class ClaudeCodeUnsupportedContentError extends Schema.TaggedError<ClaudeCodeUnsupportedContentError>()(
  "ClaudeCodeUnsupportedContentError",
  {},
) {
  override get message() {
    return "Claude Code only supports text prompt content"
  }
}

const Message = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("assistant"),
    message: Schema.Struct({ content: Schema.Array(Schema.Unknown) }),
  }),
  Schema.Struct({
    type: Schema.Literal("result"),
    subtype: Schema.String,
    errors: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
])
const decodeMessage = Schema.decodeUnknownOption(Message)
const Text = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })

export function createClaudeCodeLanguageModel(input: { readonly modelID: string; readonly query: ClaudeCodeQuery }) {
  return new ClaudeCodeLanguageModel(input)
}

class ClaudeCodeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3"
  readonly provider = "claude-code"
  readonly modelId: string
  readonly supportedUrls = {}

  constructor(private readonly input: { readonly modelID: string; readonly query: ClaudeCodeQuery }) {
    this.modelId = input.modelID
  }

  async doGenerate(): Promise<never> {
    throw new Error("Claude Code only supports streaming requests")
  }

  async doStream(options: LanguageModelV3CallOptions) {
    if (options.tools?.length) throw new ClaudeCodeToolUseError({})
    const controller = new AbortController()
    if (options.abortSignal?.aborted) throw options.abortSignal.reason
    options.abortSignal?.addEventListener("abort", () => controller.abort(options.abortSignal?.reason), { once: true })
    const system = options.prompt.at(0)?.role === "system" ? promptText(options.prompt[0].content) : undefined
    const messages = options.prompt
      .slice(system === undefined ? 0 : 1)
      .map((message) => ({
        type: "user" as const,
        message: {
          role: "user" as const,
          content:
            message.role === "user"
              ? promptText(message.content)
              : `<${message.role}>\n${promptText(message.content)}\n</${message.role}>`,
        },
        parent_tool_use_id: null,
      }))
      .map((message, index, messages) => ({ ...message, shouldQuery: index === messages.length - 1 }))
    const input = this.input
    let text = false
    return {
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        async start(stream) {
          stream.enqueue({ type: "stream-start", warnings: [] })
          try {
            for await (const raw of input.query({
              prompt: (async function* () {
                yield* messages
              })(),
              options: {
                model: input.modelID,
                abortController: controller,
                settingSources: [],
                tools: [],
                ...(system === undefined ? {} : { systemPrompt: system }),
              },
            })) {
              const message = Option.getOrUndefined(decodeMessage(raw))
              if (!message) continue
              if (message.type === "assistant") {
                const content = message.message.content.flatMap((part) => (Schema.is(Text)(part) ? [part.text] : []))
                if (content.length === 0) continue
                if (!text) {
                  stream.enqueue({ type: "text-start", id: "text-0" })
                  text = true
                }
                for (const delta of content) stream.enqueue({ type: "text-delta", id: "text-0", delta })
                continue
              }
              if (message.subtype !== "success") {
                stream.enqueue({ type: "error", error: new Error(message.errors?.join("\n") || message.subtype) })
                stream.close()
                return
              }
              if (text) stream.enqueue({ type: "text-end", id: "text-0" })
              stream.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: message.subtype },
                usage: {
                  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
                },
              })
              stream.close()
              return
            }
            stream.close()
          } catch (error) {
            stream.enqueue({ type: "error", error })
            stream.close()
          }
        },
      }),
    }
  }
}

function promptText(content: string | ReadonlyArray<unknown>) {
  if (typeof content === "string") return content
  return content.map((part) => {
    if (Schema.is(Text)(part)) return part.text
    throw new ClaudeCodeUnsupportedContentError({})
  }).join("")
}
