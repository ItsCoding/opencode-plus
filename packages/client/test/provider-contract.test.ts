import { expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { ProviderAvailability } from "@opencode-ai/protocol/groups/provider"
import type { ProvidersListOutput } from "../src/generated/types"

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
} satisfies ProvidersListOutput

test("generated client retains typed Claude Code availability guidance", () => {
  expect(response.data.map((item) => item.state)).toEqual([
    "available",
    "missing",
    "unauthenticated",
    "unsupported-runtime",
    "unsupported-model",
  ])
})

test("generated client rejects malformed availability states", () => {
  expect(
    Option.isNone(
      Schema.decodeUnknownOption(ProviderAvailability)({ providerID: "claude-code", state: "unsupported-runtime" }),
    ),
  ).toBe(true)
})
