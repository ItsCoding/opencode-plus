import { Catalog } from "@opencode-ai/core/catalog"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ProviderNotFoundError } from "@opencode-ai/protocol/errors"
import { response } from "../location"
import { ClaudeCodeAvailability } from "../claude-code"

export const providerList = Effect.fn("ProviderHttpApi.list")(function* () {
  const catalog = yield* Catalog.Service
  const claudeCode = yield* Effect.serviceOption(ClaudeCodeAvailability.Service)
  const providers = yield* catalog.provider.available()
  return yield* response(
    Effect.succeed([
      ...providers,
      ...(Option.isSome(claudeCode) ? [yield* claudeCode.value.probe()] : []),
    ]),
  )
})

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("provider.list", providerList)
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
      )
  }),
)
