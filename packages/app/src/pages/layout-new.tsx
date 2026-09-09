import { createEffect, createMemo, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { UnifiedSidebar } from "@/pages/layout/unified-sidebar"
import { createUnifiedSidebarController } from "@/pages/layout/unified-sidebar-controller"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const layout = useLayout()
  const settings = useSettings()
  const sidebar = createUnifiedSidebarController()
  const mobile = createMediaQuery("(max-width: 767px)")
  const bottom = createMemo(() => mobile() && settings.general.mobileTitlebarPosition() === "bottom")
  const [state, setState] = createStore({ debugTools: true })

  createEffect(() => setV2Toast(true))

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        update={update}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <div class="flex-1 min-h-0 min-w-0 flex">
        <Show when={layout.sidebar.opened()}>
          <div class="hidden xl:block shrink-0">
            <UnifiedSidebar
              controller={sidebar}
              density={settings.appearance.sidebarDensity()}
              onClose={layout.sidebar.close}
            />
          </div>
        </Show>
        <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
          <Suspense>{props.children}</Suspense>
        </main>
      </div>
      <div class="xl:hidden">
        <div
          classList={{
            "fixed inset-x-0 z-40 bg-v2-overlay-simple-overlay-scrim transition-opacity duration-200": true,
            "top-0 bottom-9": bottom(),
            "top-9 bottom-0": !bottom(),
            "opacity-100 pointer-events-auto": layout.mobileSidebar.opened(),
            "opacity-0 pointer-events-none": !layout.mobileSidebar.opened(),
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) layout.mobileSidebar.hide()
          }}
        />
        <div
          classList={{
            "fixed start-0 z-50 w-full max-w-[400px] overflow-hidden border-e border-v2-border-weak-base bg-v2-background-bg-base transition-transform duration-200 ease-out":
              true,
            "top-0 bottom-9": bottom(),
            "top-9 bottom-0": !bottom(),
            "translate-x-0": layout.mobileSidebar.opened(),
            "ltr:-translate-x-full rtl:translate-x-full": !layout.mobileSidebar.opened(),
          }}
          inert={!layout.mobileSidebar.opened()}
        >
          <UnifiedSidebar
            controller={sidebar}
            density={settings.appearance.sidebarDensity()}
            mobile
            onClose={layout.mobileSidebar.hide}
          />
        </div>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
