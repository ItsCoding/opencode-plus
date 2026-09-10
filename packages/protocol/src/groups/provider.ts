import { Provider } from "@opencode-ai/schema/provider"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ProviderNotFoundError, ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const ProviderAvailability = Schema.Union([
  Schema.Struct({
    providerID: Schema.Literal("claude-code"),
    state: Schema.Literal("available"),
  }),
  Schema.Struct({
    providerID: Schema.Literal("claude-code"),
    state: Schema.Literal("missing"),
  }),
  Schema.Struct({
    providerID: Schema.Literal("claude-code"),
    state: Schema.Literal("unauthenticated"),
  }),
  Schema.Struct({
    providerID: Schema.Literal("claude-code"),
    state: Schema.Literal("unsupported-runtime"),
    runtime: Schema.String,
  }),
  Schema.Struct({
    providerID: Schema.Literal("claude-code"),
    state: Schema.Literal("unsupported-model"),
    alias: Schema.String,
  }),
]).annotate({ identifier: "ProviderAvailability" })

export const ProviderList = Schema.Array(Schema.Union([Provider.Info, ProviderAvailability])).annotate({
  identifier: "ProviderList",
})

export const ProviderGroup = HttpApiGroup.make("server.provider")
  .add(
    HttpApiEndpoint.get("provider.list", "/api/provider", {
      query: LocationQuery,
      success: Location.response(ProviderList),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.list",
          summary: "List providers",
          description: "Retrieve active AI providers so clients can show provider availability and configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider.get", "/api/provider/:providerID", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      success: Location.response(Provider.Info),
      error: [ProviderNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.get",
          summary: "Get provider",
          description: "Retrieve a single AI provider so clients can inspect its availability and endpoint settings.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "providers",
      description: "Experimental provider routes.",
    }),
  )
