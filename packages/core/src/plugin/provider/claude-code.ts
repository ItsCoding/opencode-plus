import { Effect } from "effect"
import { define } from "@opencode/plugin/effect/plugin"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { createClaudeCodeLanguageModel } from "./claude-code-language-model.js"

const providerID = Provider.ID.make("claude-code")
const aliases = ["haiku", "sonnet", "opus"] as const

export type ClaudeCodeProbe = {
  readonly runtime: "bun" | "node" | "workerd"
  readonly apiKey: boolean
  readonly account?: {
    readonly apiProvider?: string
    readonly subscriptionType?: string
    readonly apiKeySource?: string
  }
}

export function probeClaudeCode(probe: ClaudeCodeProbe) {
  return (
    probe.runtime === "bun" &&
    !probe.apiKey &&
    probe.account?.apiProvider === "firstParty" &&
    Boolean(probe.account.subscriptionType) &&
    (probe.account.apiKeySource === undefined || ["oauth", "none"].includes(probe.account.apiKeySource))
  )
}

export function createClaudeCodePlugin(probe: ClaudeCodeProbe | (() => Promise<ClaudeCodeProbe>)) {
  return define({
    id: "opencode.provider.claude-code",
    effect: Effect.fn(function* (ctx) {
      const result = typeof probe === "function" ? yield* Effect.promise(probe) : probe
      if (!probeClaudeCode(result)) return
      yield* ctx.catalog.transform((catalog) => {
        catalog.provider.update(providerID, (provider) => {
          provider.name = "Claude Code"
          provider.activation = "enabled"
        })
        for (const alias of aliases)
          catalog.model.update(providerID, Model.ID.make(alias), (model) => {
            model.package = Provider.aisdk("@anthropic-ai/claude-agent-sdk")
          })
      })
      yield* ctx.aisdk.hook(
        "sdk",
        Effect.fn(function* (event) {
          if (event.model.providerID !== providerID || event.package !== "@anthropic-ai/claude-agent-sdk") return
          const sdk = yield* Effect.promise(() => import("@anthropic-ai/claude-agent-sdk"))
          event.sdk = {
            languageModel: (modelID: string) => createClaudeCodeLanguageModel({ modelID, query: sdk.query }),
          }
        }),
      )
    }),
  })
}

export const ClaudeCodePlugin = createClaudeCodePlugin(async () => {
  const probe = {
    runtime: typeof Bun === "undefined" ? ("node" as const) : ("bun" as const),
    apiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  }
  if (probe.runtime !== "bun" || probe.apiKey) return probe
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const query = sdk.query({ prompt: "", options: { settingSources: [], tools: [] } })
    try {
      return { ...probe, account: await query.accountInfo() }
    } finally {
      query.close()
    }
  } catch {
    return probe
  }
})
