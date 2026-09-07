import { Effect, Schema } from "effect"
import { Provider } from "@/provider/provider"
import * as Tool from "./tool"

export const ModelsTool = Tool.define(
  "models",
  Effect.gen(function* () {
    const provider = yield* Provider.Service

    return {
      description: "List available models.",
      parameters: Schema.Struct({}),
      execute: () =>
        Effect.gen(function* () {
          const ids = Object.entries(yield* provider.list())
            .flatMap(([providerID, info]) => Object.keys(info.models).map((modelID) => `${providerID}/${modelID}`))
            .toSorted()
          return {
            title: "Available models",
            output: ids.join("\n"),
            metadata: {},
          }
        }),
    }
  }),
)
