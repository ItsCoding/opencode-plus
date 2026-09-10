import { expect, test } from "bun:test"
import { Catalog } from "@opencode-ai/core/catalog"
import { Location } from "@opencode-ai/core/location"
import { Project } from "@opencode-ai/core/project"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect, Layer } from "effect"
import { ClaudeCodeAvailability } from "../src/claude-code"
import { providerList } from "../src/handlers/provider"

const catalog = Layer.mock(Catalog.Service)({
  provider: {
    get: () => Effect.die("Unexpected catalog provider lookup"),
    all: () => Effect.die("Unexpected catalog provider list"),
    available: () => Effect.succeed([ProviderV2.Info.empty(ProviderV2.ID.make("openai"))]),
  },
  model: {
    get: () => Effect.die("Unexpected catalog model lookup"),
    all: () => Effect.die("Unexpected catalog model list"),
    available: () => Effect.die("Unexpected catalog available model list"),
    default: () => Effect.die("Unexpected catalog default model lookup"),
    small: () => Effect.die("Unexpected catalog small model lookup"),
  },
})
const location = Layer.succeed(
  Location.Service,
  Location.Service.of({
    directory: AbsolutePath.make("/repo"),
    project: { id: Project.ID.make("global"), directory: AbsolutePath.make("/repo") },
  }),
)
const claudeCodeAvailability = Layer.succeed(
  ClaudeCodeAvailability.Service,
  ClaudeCodeAvailability.Service.of({ probe: () => Effect.succeed({ providerID: "claude-code", state: "unauthenticated" }) }),
)

test("provider handler returns the actual Claude Code availability record", async () => {
  const response = await Effect.runPromise(
    providerList().pipe(Effect.provide(catalog), Effect.provide(location), Effect.provide(claudeCodeAvailability)),
  )

  expect(response).toMatchObject({
    data: [
      { id: "openai" },
      { providerID: "claude-code", state: "unauthenticated" },
    ],
  })
})
