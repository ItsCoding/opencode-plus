import { expect, test } from "bun:test"

test("maps every Claude Code availability state to guidance", async () => {
  const { providerAvailabilityGuidance } = await import("../src/provider")

  expect(providerAvailabilityGuidance({ providerID: "claude-code", state: "available" })).toBe("Claude Code is available.")
  expect(providerAvailabilityGuidance({ providerID: "claude-code", state: "missing" })).toBe(
    "Install or update Claude Code.",
  )
  expect(providerAvailabilityGuidance({ providerID: "claude-code", state: "unauthenticated" })).toBe(
    "Log in with Claude Code.",
  )
  expect(
    providerAvailabilityGuidance({ providerID: "claude-code", state: "unsupported-runtime", runtime: "1.0" }),
  ).toBe("Claude Code runtime 1.0 is unsupported.")
  expect(providerAvailabilityGuidance({ providerID: "claude-code", state: "unsupported-model", alias: "sonnet" })).toBe(
    "Claude Code does not support the sonnet alias.",
  )
})
