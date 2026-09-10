import { Context, Effect } from "effect"
import { ProviderAvailability } from "@opencode-ai/protocol/groups/provider"

export type Availability = typeof ProviderAvailability.Type

export interface Interface {
  readonly probe: () => Effect.Effect<Availability>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ClaudeCodeAvailability") {}

export * as ClaudeCodeAvailability from "./claude-code"
