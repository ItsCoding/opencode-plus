import { beforeAll, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

let useSettings: typeof import("./settings").useSettings

beforeAll(async () => {
  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      platform: "web",
      openExternal: () => undefined,
      restart: async () => undefined,
      notify: async () => undefined,
    }),
  }))
  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: (input: { init: () => unknown }) => {
      let value: unknown
      return {
        use: () => {
          value ??= input.init()
          return value
        },
        provider: () => undefined,
      }
    },
  }))
  mock.module("@/utils/persist", () => ({
    persisted: (_target: unknown, store: [unknown, unknown]) => [store[0], store[1], null, () => true],
  }))
  useSettings = (await import("./settings")).useSettings
})

test("persists sidebar density through the settings context", () => {
  createRoot((dispose) => {
    const settings = useSettings()

    expect(settings.appearance.sidebarDensity()).toBe("comfortable")
    settings.appearance.setSidebarDensity("compact")
    expect(settings.current.appearance.sidebarDensity).toBe("compact")
    dispose()
  })
})
