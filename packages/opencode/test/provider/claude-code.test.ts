import { expect, test } from "bun:test"
import {
  CLAUDE_CODE_FAMILY_ORDER,
  claudeCodeEnvironment,
  claudeCodeModels,
  claudeCodeProvider,
  probeClaudeCode,
} from "@/provider/claude-code"

test("keeps the stable Claude family order", () => {
  expect(CLAUDE_CODE_FAMILY_ORDER).toEqual(["haiku", "sonnet", "opus", "fable"])
})

test("maps each family to one exact reported SDK model and hides missing families", () => {
  expect(
    claudeCodeModels([
      { value: "claude-fable-5-1[1m]", displayName: "Fable", description: "" },
      { value: "opus[1m]", displayName: "Opus", description: "" },
      { value: "sonnet", displayName: "Sonnet", description: "" },
      { value: "haiku", displayName: "Haiku", description: "" },
      { value: "claude-sonnet-4-5", displayName: "Old Sonnet", description: "" },
    ]),
  ).toEqual({ haiku: "haiku", sonnet: "sonnet", opus: "opus[1m]", fable: "claude-fable-5-1[1m]" })

  expect(
    claudeCodeModels([{ value: "unknown", displayName: "Unknown", description: "" }]),
  ).toEqual({})
})

test("builds a selectable provider without environment key fields", () => {
  const provider = claudeCodeProvider({ haiku: "haiku", opus: "opus[1m]" })
  expect(String(provider.id)).toBe("claude-code")
  expect(provider.env).toEqual([])
  expect(provider.key).toBeUndefined()
  expect(Object.keys(provider.models)).toEqual(["haiku", "opus"])
  expect(provider.models.opus.api.id).toBe("opus[1m]")
  expect(provider.models.opus.capabilities.input.text).toBe(true)
  expect(provider.models.opus.capabilities.toolcall).toBe(true)
  expect(provider.models.opus.limit).toEqual({ context: 200_000, output: 32_000 })
})

test("sanitizes the SDK environment and reports inherited credential conflicts by name", () => {
  expect(
    claudeCodeEnvironment({
      HOME: "/home/test",
      PATH: "/bin",
      LANG: "en_US.UTF-8",
      ANTHROPIC_API_KEY: "secret",
      AWS_ACCESS_KEY_ID: "secret",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: undefined,
    }),
  ).toEqual({
    env: { HOME: "/home/test", PATH: "/bin", LANG: "en_US.UTF-8", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    conflicts: ["ANTHROPIC_API_KEY", "AWS_ACCESS_KEY_ID"],
  })
})

test("reports missing runtime, authentication, and model states independently", async () => {
  const query = async () => ({
    accountInfo: async () => ({ apiProvider: "firstParty" as const, subscriptionType: "pro" }),
    supportedModels: async () => [{ value: "sonnet", displayName: "Sonnet", description: "" }],
    close() {},
  })

  await expect(probeClaudeCode({ query })).resolves.toEqual({ state: "unsupported-model", alias: "haiku" })
  await expect(probeClaudeCode({ query: async () => { throw new Error("not installed") } })).resolves.toEqual({
    state: "missing",
  })
  await expect(
    probeClaudeCode({
      query: async () => ({
        accountInfo: async () => ({ apiProvider: "firstParty" as const }),
        supportedModels: async () => [],
        close() {},
      }),
    }),
  ).resolves.toEqual({ state: "unauthenticated" })
  await expect(
    probeClaudeCode({
      query,
      runtime: "unsupported-runtime",
    }),
  ).resolves.toEqual({ state: "unsupported-runtime", runtime: "unsupported-runtime" })
  await expect(
    probeClaudeCode({
      query: async () => ({
        accountInfo: async () => ({ apiProvider: "firstParty" as const, subscriptionType: "pro" }),
        supportedModels: async () => [{ value: "unknown", displayName: "Unknown", description: "" }],
        close() {},
      }),
    }),
  ).resolves.toEqual({ state: "unsupported-model", alias: "haiku" })
})

test("accepts documented first-party subscription credential sources", async () => {
  const supportedModels = async () =>
    CLAUDE_CODE_FAMILY_ORDER.map((value) => ({ value, displayName: value, description: "" }))
  for (const apiKeySource of ["oauth", "none"] as const) {
    await expect(
      probeClaudeCode({
        query: async () => ({
          accountInfo: async () => ({ apiProvider: "firstParty" as const, subscriptionType: "pro", apiKeySource }),
          supportedModels,
          close() {},
        }),
      }),
    ).resolves.toMatchObject({ state: "available" })
  }

  await expect(
    probeClaudeCode({
      query: async () => ({
        accountInfo: async () => ({
          apiProvider: "firstParty" as const,
          subscriptionType: "pro",
          apiKeySource: "ANTHROPIC_API_KEY",
        }),
        supportedModels: async () => [],
        close() {},
      }),
    }),
  ).resolves.toEqual({ state: "unauthenticated" })
})

test("passes the Claude executable to the subscription probe", async () => {
  const received: unknown[] = []
  await probeClaudeCode({
    query: async (...args: unknown[]) => {
      received.push(...args)
      return {
        accountInfo: async () => ({ apiProvider: "firstParty" as const, subscriptionType: "pro", apiKeySource: "oauth" }),
        supportedModels: async () => CLAUDE_CODE_FAMILY_ORDER.map((value) => ({ value, displayName: value, description: "" })),
        close() {},
      }
    },
  })
  expect(received[0]).toMatchObject({ pathToClaudeCodeExecutable: expect.any(String) })
})

test("maps probe failures by the SDK phase and failure type", async () => {
  await expect(
    probeClaudeCode({ query: async () => { throw new Error("Claude Code runtime is not installed") } }),
  ).resolves.toEqual({ state: "missing" })

  await expect(
    probeClaudeCode({
      query: async () => { throw Object.assign(new Error("authentication required"), { code: "AUTH_REQUIRED" }) },
    }),
  ).resolves.toEqual({ state: "unauthenticated" })

  await expect(
    probeClaudeCode({
      query: async () => {
        throw Object.assign(new Error("unsupported protocol"), { code: "UNSUPPORTED_PROTOCOL", runtime: "Claude Code 1" })
      },
    }),
  ).resolves.toEqual({ state: "unsupported-runtime", runtime: "Claude Code 1" })

  await expect(
    probeClaudeCode({
      query: async () => ({
        accountInfo: async () => ({ apiProvider: "firstParty" as const, subscriptionType: "pro", apiKeySource: "none" }),
        supportedModels: async () => { throw new Error("supportedModels failed") },
        close() {},
      }),
    }),
  ).resolves.toEqual({ state: "unsupported-model", alias: "haiku" })
})
