import type { AccountInfo, ModelInfo, Options } from "@anthropic-ai/claude-agent-sdk"
import { mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { ClaudeCodeAvailability } from "@opencode-ai/server/claude-code"
import { Effect, Layer } from "effect"
import type { Info, Model } from "./provider"

export const CLAUDE_CODE_FAMILY_ORDER = ["haiku", "sonnet", "opus", "fable"] as const
export type ClaudeCodeFamily = (typeof CLAUDE_CODE_FAMILY_ORDER)[number]

type SupportedModel = Pick<ModelInfo, "value" | "displayName" | "description">

export type ClaudeCodeProbe =
  | { state: "available"; families: Partial<Record<ClaudeCodeFamily, string>>; provider: Info }
  | { state: "missing" }
  | { state: "unauthenticated" }
  | { state: "unsupported-runtime"; runtime: string }
  | { state: "unsupported-model"; alias: ClaudeCodeFamily }

interface ClaudeCodeQuery {
  accountInfo: () => Promise<AccountInfo>
  supportedModels: () => Promise<ModelInfo[]>
  close: () => void
}

interface ProbeInput {
  query?: () => Promise<ClaudeCodeQuery>
  env?: Record<string, string | undefined>
  runtime?: string
}

const ENV_ALLOWLIST = ["HOME", "LANG", "LOGNAME", "PATH", "SHELL", "TERM", "TMPDIR", "USER"]
const CREDENTIAL_ENV = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "ANTHROPIC_VERTEX_REGION",
  "ANTHROPIC_API_KEY_HELPER",
  "ANTHROPIC_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_BEARER_TOKEN_BEDROCK",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "VERTEXAI_PROJECT",
  "VERTEXAI_LOCATION",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
])

export function claudeCodeEnvironment(input: Record<string, string | undefined>): {
  env: Record<string, string>
  conflicts: string[]
} {
  const env: Record<string, string> = Object.fromEntries(
    ENV_ALLOWLIST.flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]!]])),
  )
  const conflicts = Object.keys(input).filter((key) => CREDENTIAL_ENV.has(key) && Boolean(input[key]))
  return {
    env: { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    conflicts,
  }
}

export function claudeCodeModels(models: SupportedModel[]) {
  const result: Partial<Record<ClaudeCodeFamily, string>> = {}
  for (const family of CLAUDE_CODE_FAMILY_ORDER) {
    const exact = models.find((model) => new RegExp(`^${family}(?:\\[\\d+m\\])?$`).test(model.value))
    const canonical = models.find((model) => new RegExp(`^claude-${family}-[a-z0-9-]+(?:\\[\\d+m\\])?$`).test(model.value))
    const match = exact ?? canonical
    if (match) result[family] = match.value
  }
  return result
}

export function claudeCodeProvider(families: Partial<Record<ClaudeCodeFamily, string>>): Info {
  const models: Record<string, Model> = {}
  for (const family of CLAUDE_CODE_FAMILY_ORDER) {
    const id = families[family]
    if (!id) continue
    models[family] = {
      id: ModelV2.ID.make(family),
      providerID: ProviderV2.ID.make("claude-code"),
      api: { id, url: "", npm: "@anthropic-ai/claude-agent-sdk" },
      name: family[0].toUpperCase() + family.slice(1),
      family,
      capabilities: {
        temperature: false,
        reasoning: false,
        attachment: false,
        toolcall: true,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 200_000, output: 32_000 },
      status: "active",
      options: {},
      headers: {},
      release_date: "",
      variants: {},
    }
  }
  return {
    id: ProviderV2.ID.make("claude-code"),
    name: "Claude Code",
    source: "custom",
    env: [],
    options: {},
    models,
  }
}

export async function probeClaudeCode(input: ProbeInput = {}): Promise<ClaudeCodeProbe> {
  const runtime = input.runtime ?? (process.platform === "darwin" || process.platform === "linux" || process.platform === "win32"
    ? undefined
    : `${process.platform}-${process.arch}`)
  if (runtime) return { state: "unsupported-runtime", runtime }

  const sanitized = claudeCodeEnvironment(input.env ?? process.env)
  if (sanitized.conflicts.length) return { state: "unauthenticated" }

  const cwd = await mkdtemp(path.join(os.tmpdir(), "opencode-claude-code-probe-"))
  let query: ClaudeCodeQuery | undefined
  try {
    try {
      query = await (input.query ?? defaultQuery)({
        cwd,
        settingSources: [],
        tools: [],
        strictMcpConfig: true,
        env: sanitized.env,
      })
    } catch (error) {
      return classifyProbeError(error, "runtime")
    }

    let account: AccountInfo
    try {
      account = await query.accountInfo()
    } catch (error) {
      return classifyProbeError(error, "account")
    }
    if (
      account.apiProvider !== "firstParty" ||
      !account.subscriptionType ||
      (account.apiKeySource !== undefined && !SUBSCRIPTION_KEY_SOURCES.has(account.apiKeySource))
    ) {
      return { state: "unauthenticated" }
    }

    let models: ModelInfo[]
    try {
      models = await query.supportedModels()
    } catch (error) {
      return classifyProbeError(error, "models")
    }
    const families = claudeCodeModels(models)
    const alias = CLAUDE_CODE_FAMILY_ORDER.find((family) => !families[family])
    if (alias) return { state: "unsupported-model", alias }
    return { state: "available", families, provider: claudeCodeProvider(families) }
  } catch {
    return { state: "missing" }
  } finally {
    query?.close()
    await rm(cwd, { recursive: true, force: true })
  }
}

const SUBSCRIPTION_KEY_SOURCES = new Set(["oauth", "none"])

function classifyProbeError(error: unknown, phase: "runtime" | "account" | "models"): ClaudeCodeProbe {
  const details = errorDetails(error)
  if (details.code === "UNSUPPORTED_PROTOCOL" || /unsupported\s+(?:runtime|platform|protocol)/i.test(details.message)) {
    return { state: "unsupported-runtime", runtime: details.runtime ?? `${process.platform}-${process.arch}` }
  }
  if (details.code === "AUTH_REQUIRED" || /auth(?:entication)?|login|credential|unauthenticated/i.test(details.message)) {
    return { state: "unauthenticated" }
  }
  if (phase === "models") {
    return { state: "unsupported-model", alias: details.alias as ClaudeCodeFamily | undefined ?? CLAUDE_CODE_FAMILY_ORDER[0] }
  }
  if (phase === "account") return { state: "unauthenticated" }
  if (/ENOENT|not installed|executable.*not found|runtime.*missing/i.test(details.message)) return { state: "missing" }
  return { state: "unsupported-runtime", runtime: details.runtime ?? `${process.platform}-${process.arch}` }
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) }
  const record = error as Record<string, unknown>
  return {
    message: error instanceof Error ? error.message : String(record.message ?? ""),
    code: typeof record.code === "string" ? record.code : undefined,
    runtime: typeof record.runtime === "string" ? record.runtime : undefined,
    alias: typeof record.alias === "string" && CLAUDE_CODE_FAMILY_ORDER.includes(record.alias as ClaudeCodeFamily)
      ? record.alias
      : undefined,
  }
}

async function defaultQuery(options: Options): Promise<ClaudeCodeQuery> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk")
  return query({ prompt: emptyPrompt(), options })
}

async function* emptyPrompt() {}

export const availabilityLayer = Layer.succeed(
  ClaudeCodeAvailability.Service,
  ClaudeCodeAvailability.Service.of({
    probe: () =>
      Effect.promise(() => probeClaudeCode()).pipe(
        Effect.map((result) => {
          if (result.state === "available" || result.state === "missing" || result.state === "unauthenticated") {
            return { providerID: "claude-code" as const, state: result.state }
          }
          if (result.state === "unsupported-runtime") return { providerID: "claude-code" as const, ...result }
          return { providerID: "claude-code" as const, ...result }
        }),
      ),
  }),
)

export * as ClaudeCode from "./claude-code"
