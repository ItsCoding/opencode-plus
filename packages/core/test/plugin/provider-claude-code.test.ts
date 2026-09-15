import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Catalog } from "@opencode/core/catalog"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import {
  ClaudeCodePlugin,
  createClaudeCodePlugin,
  probeClaudeCode,
  type ClaudeCodeProbe,
} from "@opencode/core/plugin/provider/claude-code"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { Provider } from "@opencode/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const probe = (input: Partial<ClaudeCodeProbe> = {}): ClaudeCodeProbe => ({
  runtime: "bun",
  apiKey: false,
  account: { apiProvider: "firstParty", subscriptionType: "pro", apiKeySource: "oauth" },
  ...input,
})

const addPlugin = (probe: Parameters<typeof createClaudeCodePlugin>[0]) =>
  Effect.gen(function* () {
    const plugin = yield* Plugin.Service
    const host = yield* PluginHost.make(plugin)
    yield* createClaudeCodePlugin(probe).effect(host)
  })

describe("ClaudeCodePlugin", () => {
  test("accepts first-party subscription accounts using OAuth or no API key", () => {
    for (const apiKeySource of ["oauth", "none"] as const)
      expect(
        probeClaudeCode({
          runtime: "bun",
          apiKey: false,
          account: { apiProvider: "firstParty", subscriptionType: "pro", apiKeySource },
        }),
      ).toBeTrue()
  })

  test("rejects non-subscription Claude Code accounts", () => {
    const account = { apiProvider: "firstParty", subscriptionType: "pro", apiKeySource: "ANTHROPIC_API_KEY" }
    expect(
      probeClaudeCode({
        runtime: "bun",
        apiKey: false,
        account,
      }),
    ).toBeFalse()
    expect(
      probeClaudeCode({
        runtime: "bun",
        apiKey: false,
        account: { ...account, apiProvider: "bedrock" },
      }),
    ).toBeFalse()
    expect(
      probeClaudeCode({
        runtime: "bun",
        apiKey: true,
        account: { ...account, apiKeySource: "oauth" },
      }),
    ).toBeFalse()
  })

  test("is registered as a Core provider plugin", () => {
    expect(ProviderPlugins).toContain(ClaudeCodePlugin)
  })

  it.effect("registers fixed aliases after a successful subscription probe", () =>
    Effect.gen(function* () {
      yield* addPlugin(probe())
      const catalog = yield* Catalog.Service
      const models = yield* catalog.model.all()
      expect(models.filter((model) => model.providerID === Provider.ID.make("claude-code")).map((model) => model.id)).toEqual([
        Model.ID.make("haiku"),
        Model.ID.make("sonnet"),
        Model.ID.make("opus"),
      ])
    }),
  )

  it.effect("does not register aliases outside the supported runtime", () =>
    Effect.gen(function* () {
      yield* addPlugin(probe({ runtime: "node" }))
      const catalog = yield* Catalog.Service
      expect(yield* catalog.provider.get(Provider.ID.make("claude-code"))).toBeUndefined()
    }),
  )

  it.effect("does not register aliases when an API key conflicts with the subscription", () =>
    Effect.gen(function* () {
      yield* addPlugin(probe({ apiKey: true }))
      const catalog = yield* Catalog.Service
      expect(yield* catalog.provider.get(Provider.ID.make("claude-code"))).toBeUndefined()
    }),
  )
})
