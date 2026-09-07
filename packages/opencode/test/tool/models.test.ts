import { expect } from "bun:test"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { Truncate } from "@/tool/truncate"
import type { Tool } from "@/tool/tool"
import { MessageID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"
import { ModelsTool } from "../../src/tool/models"

const alpha = ProviderV2.ID.make("alpha")
const beta = ProviderV2.ID.make("beta")
const provider = ProviderTest.fake({
  list: () =>
    Effect.succeed({
      [beta]: {
        models: {
          [ModelV2.ID.make("z-model")]: {},
          [ModelV2.ID.make("a-model")]: {},
        },
      } as Provider.Info,
      [alpha]: {
        models: {
          [ModelV2.ID.make("z-model")]: {},
          [ModelV2.ID.make("a-model")]: {},
        },
      } as Provider.Info,
    }),
})
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Truncate.node, Agent.node, Provider.node]), [[Provider.node, provider.layer]]),
)

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

it.instance("lists configured model IDs sorted by provider then model", () =>
  Effect.gen(function* () {
    const tool = yield* ModelsTool
    const result = yield* (yield* tool.init()).execute({}, ctx)

    expect(result.output).toBe("alpha/a-model\nalpha/z-model\nbeta/a-model\nbeta/z-model")
  }),
)
