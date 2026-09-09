import { HoverCard as Kobalte } from "@kobalte/core/hover-card"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, For, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { updateInspector, type InspectorTool } from "./contextual-inspector-state"

export function ContextualInspector(props: {
  review: { opened: () => boolean; count: () => number; open: () => void; close: () => void }
  files: { opened: () => boolean; count: () => number; open: () => void; close: () => void }
}): JSX.Element {
  const language = useLanguage()
  const hoverable = createMediaQuery("(hover: hover)")
  const [state, setState] = createStore<{ hovered?: InspectorTool; pinned?: InspectorTool }>({})
  const placement = (): "left" | "right" => (language.direction() === "rtl" ? "right" : "left")
  const items = [
    { tool: "review" as const, label: () => language.t("session.tab.review"), icon: "review" as const, panel: props.review },
    { tool: "files" as const, label: () => language.t("session.files.all"), icon: "file-tree" as const, panel: props.files },
  ]
  let keyboardTool: InspectorTool | undefined

  createEffect(() => {
    if (state.pinned === "review" && !props.review.opened()) setState("pinned", undefined)
    if (state.pinned === "files" && !props.files.opened()) setState("pinned", undefined)
  })

  const activate = (tool: InspectorTool) => {
    const next = updateInspector(state, { type: "toggle", tool })
    const selected = tool === "review" ? props.review : props.files
    const other = tool === "review" ? props.files : props.review
    other.close()
    if (next.pinned === tool) selected.open()
    else selected.close()
    setState(next)
  }

  return (
    <aside
      data-component="contextual-inspector"
      class="md:h-full shrink-0 flex flex-col items-center gap-1 border-s border-border-weaker-base bg-v2-background-bg-base p-1"
      aria-label={language.t("session.panel.reviewAndFiles")}
    >
      <For each={items}>
        {(item) => (
          <Kobalte
            open={hoverable() && state.hovered === item.tool && state.pinned !== item.tool}
            openDelay={150}
            closeDelay={0}
            ignoreSafeArea
            placement={placement()}
          >
            <Kobalte.Trigger as="div">
              <TooltipV2 value={item.label()} placement={placement()}>
                <IconButtonV2
                  type="button"
                  icon={<Icon name={item.icon} />}
                  variant="ghost-muted"
                  size="large"
                  aria-label={item.label()}
                  aria-pressed={state.pinned === item.tool}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    keyboardTool = item.tool
                    activate(item.tool)
                  }}
                  onPointerEnter={() => setState(updateInspector(state, { type: "enter", tool: item.tool, hoverable: hoverable() }))}
                  onPointerLeave={() => setState(updateInspector(state, { type: "leave", tool: item.tool }))}
                  onClick={(event) => {
                    if (keyboardTool === item.tool) {
                      keyboardTool = undefined
                      return
                    }
                    if (event.detail === 0) return
                    activate(item.tool)
                  }}
                />
              </TooltipV2>
            </Kobalte.Trigger>
            <Kobalte.Portal>
              <Kobalte.Content
                data-component="contextual-inspector-preview"
                data-placement={placement()}
                ref={(element) => {
                  const theme = element.closest("[data-theme]")?.getAttribute("data-theme")
                  if (theme) element.setAttribute("data-theme", theme)
                }}
                class="rounded-lg border border-border-weaker-base bg-v2-background-bg-base px-3 py-2 shadow-[var(--v2-elevation-raised)]"
              >
                <div class="flex min-w-28 flex-col gap-1 text-12-regular text-text-strong">
                  <div class="flex items-center justify-between gap-3">
                    <span>{item.label()}</span>
                    <span>{item.panel.count()}</span>
                  </div>
                  <span class="text-text-weak">
                    {item.panel.opened() ? language.t("common.open") : language.t("common.close")}
                  </span>
                </div>
              </Kobalte.Content>
            </Kobalte.Portal>
          </Kobalte>
        )}
      </For>
    </aside>
  )
}
