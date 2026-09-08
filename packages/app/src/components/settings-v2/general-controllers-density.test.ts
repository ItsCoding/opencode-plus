import { beforeAll, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"

let createAppearanceSettingsController: typeof import("./general-controllers").createAppearanceSettingsController

beforeAll(async () => {
  const [density, setDensity] = createSignal<"comfortable" | "compact">("comfortable")
  mock.module("@/context/settings", () => ({
    monoDefault: "mono",
    monoFontFamily: (value: string) => value,
    monoInput: (value: string) => value,
    sansDefault: "sans",
    sansFontFamily: (value: string) => value,
    sansInput: (value: string) => value,
    terminalDefault: "terminal",
    terminalFontFamily: (value: string) => value,
    terminalInput: (value: string) => value,
    useSettings: () => ({
      appearance: {
        sidebarDensity: density,
        setSidebarDensity: setDensity,
        uiFont: () => "",
        font: () => "",
        terminalFont: () => "",
        setUIFont: () => undefined,
        setFont: () => undefined,
        setTerminalFont: () => undefined,
      },
    }),
  }))
  mock.module("@opencode-ai/ui/theme/context", () => ({
    useTheme: () => ({
      colorScheme: () => "system",
      themeId: () => "oc-2",
      ids: () => ["oc-2"],
      name: () => "OpenCode",
      loadThemes: async () => undefined,
      setColorScheme: () => undefined,
      setTheme: () => undefined,
    }),
  }))
  createAppearanceSettingsController = (await import("./general-controllers")).createAppearanceSettingsController
})

test("describes and selects sidebar density", () => {
  createRoot((dispose) => {
    const controller = createAppearanceSettingsController()

    expect(controller.density.options).toEqual(["comfortable", "compact"])
    expect(controller.density.current()).toBe("comfortable")
    controller.density.select("compact")
    expect(controller.density.current()).toBe("compact")
    dispose()
  })
})
