import { expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { ProviderAvailability, ProviderGroup } from "../src/groups/provider"

test("provider list exposes Claude Code availability without changing selectable provider records", () => {
  const success = [...ProviderGroup.endpoints["provider.list"].success][0] as Schema.Decoder<unknown, never>
  const response = {
    location: {
      directory: "/repo",
      project: { id: "global", directory: "/repo" },
    },
    data: [
      { providerID: "claude-code", state: "available" },
      { providerID: "claude-code", state: "missing" },
      { providerID: "claude-code", state: "unauthenticated" },
      { providerID: "claude-code", state: "unsupported-runtime", runtime: "Claude Code 1.0" },
      { providerID: "claude-code", state: "unsupported-model", alias: "sonnet" },
    ],
  }

  expect(Option.isSome(Schema.decodeUnknownOption(success)(response))).toBe(true)
})

test("provider availability requires state-specific details", () => {
  expect(Option.isNone(Schema.decodeUnknownOption(ProviderAvailability)({ providerID: "claude-code", state: "unsupported-runtime" }))).toBe(
    true,
  )
  expect(Option.isNone(Schema.decodeUnknownOption(ProviderAvailability)({ providerID: "claude-code", state: "unsupported-model", alias: 1 }))).toBe(
    true,
  )
})
