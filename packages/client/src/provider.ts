import type { ProvidersListOutput } from "./generated/types"

export type ProviderAvailability = Extract<ProvidersListOutput["data"][number], { readonly providerID: "claude-code" }>

export function providerAvailabilityGuidance(input: ProviderAvailability) {
  switch (input.state) {
    case "available":
      return "Claude Code is available."
    case "missing":
      return "Install or update Claude Code."
    case "unauthenticated":
      return "Log in with Claude Code."
    case "unsupported-runtime":
      return `Claude Code runtime ${input.runtime} is unsupported.`
    case "unsupported-model":
      return `Claude Code does not support the ${input.alias} alias.`
  }
}
