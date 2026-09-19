import type { Session } from "@opencode-ai/sdk/v2/client"
import { For, Show, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { useSettingsDialog } from "@/components/settings-dialog"
import { getAvatarColors } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { sessionHref } from "@/utils/session-route"
import { getRelativeTime } from "@/utils/time"
import { displayName } from "./helpers"
import { SessionItem, SessionSkeleton } from "./sidebar-items"
import { type UnifiedSidebarController, createUnifiedSidebarController } from "./unified-sidebar-controller"

export function UnifiedSidebar(props: {
  controller: ReturnType<typeof createUnifiedSidebarController>
  density: "comfortable" | "compact"
  mobile?: boolean
  onClose: () => void
}): JSX.Element {
  const language = useLanguage()
  const server = useServer()
  const platform = usePlatform()
  const openSettings = useSettingsDialog()
  const openShortcuts = useSettingsDialog("shortcuts")
  const expanded = () => true
  // ponytail: age is computed at render and does not tick; add a minute timer if stale ages matter.
  const age = (session: Session) =>
    getRelativeTime(new Date(session.time.updated).toISOString(), (key, params) => language.t(key, params))
  const select = (session: Parameters<UnifiedSidebarController["open"]>[0]) => {
    props.controller.open(session)
    if (props.mobile) props.onClose()
  }
  const renderGroup = (group: ReturnType<UnifiedSidebarController["groups"]>[number]) => {
    const label = group.project ? displayName(group.project) : language.t("home.sessions.search.sessions")
    return (
      <section class="flex flex-col pb-3" data-group={group.key}>
        <div class="flex h-7 min-w-0 items-center gap-2 px-2 text-[13px] text-v2-text-text-base [font-weight:620]">
          <Show when={group.project}>
            {(project) => (
              <span
                aria-hidden="true"
                class="size-2 shrink-0 rounded-[3px]"
                style={{ background: getAvatarColors(project().icon?.color).background }}
              />
            )}
          </Show>
          <span class="min-w-0 truncate">
            <bdi dir="auto">{label}</bdi>
          </span>
        </div>
        <div class="flex flex-col gap-px ps-2">
          <For each={group.sessions}>
            {(session) => (
              <SessionItem
                session={session}
                list={group.sessions}
                slug=""
                href={sessionHref(server.key, session.id)}
                onSelect={select}
                mobile={props.mobile}
                dense={props.density === "compact"}
                meta={age(session)}
                showChild
                sidebarExpanded={expanded}
                clearHoverProjectSoon={() => {}}
                prefetchSession={props.controller.prefetch}
                archiveSession={props.controller.archive}
              />
            )}
          </For>
          <Show when={group.total > group.sessions.length}>
            <button
              type="button"
              data-action="sidebar-show-all"
              class="h-7 rounded-[6px] px-2 text-start text-[13px] text-v2-text-text-muted [font-weight:440] hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
              onClick={() => props.controller.toggle(group.key)}
            >
              {language.t("sidebar.project.viewAllSessions")}
            </button>
          </Show>
        </div>
      </section>
    )
  }

  return (
    <aside
      data-component="unified-sidebar"
      class="h-full min-h-0 flex flex-col border-e border-v2-border-weak-base bg-v2-background-bg-base"
      style={{ width: props.density === "compact" ? "252px" : "300px" }}
    >
      {/* ponytail: brand name, not translated copy (same as windows-app-menu.tsx) */}
      <div class="flex h-11 shrink-0 items-center px-4 text-[14px] text-v2-text-text-base [font-weight:620]">
        OpenCode+
      </div>
      <div class="flex shrink-0 flex-col gap-1 px-2 pb-3">
        <button
          type="button"
          data-action="sidebar-new-session"
          class="flex h-8 w-full items-center gap-2 rounded-[6px] px-2.5 text-start text-v2-text-text-base [font-weight:530] bg-v2-background-bg-layer-02/60 transition-[background-color] duration-[120ms] hover:bg-v2-background-bg-layer-02 focus-visible:bg-v2-background-bg-layer-02 focus-visible:outline-none"
          onClick={props.controller.newSession}
        >
          <IconV2 name="edit" class="text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate">{language.t("command.session.new")}</span>
        </button>
        <label class="flex h-8 w-full items-center gap-2 rounded-[6px] px-2.5 text-v2-icon-icon-muted transition-[background-color] duration-[120ms] hover:bg-v2-background-bg-layer-02/60 focus-within:bg-v2-background-bg-layer-02/60">
          <IconV2 name="magnifying-glass" />
          <input
            type="search"
            class="min-w-0 flex-1 border-0 bg-transparent outline-0 text-v2-text-text-base [font-weight:440] placeholder:text-v2-text-text-faint"
            value={props.controller.query()}
            placeholder={language.t("home.sessions.search.placeholder")}
            aria-label={language.t("home.sessions.search.placeholder")}
            onInput={(event) => props.controller.setQuery(event.currentTarget.value)}
          />
        </label>
      </div>
      <nav aria-label={language.t("sidebar.nav.projectsAndSessions")} class="min-h-0 flex-1 overflow-y-auto px-2">
        <Show
          when={props.controller.groups().length > 0}
          fallback={
            <Show
              when={props.controller.loading()}
              fallback={
                <p class="px-2 py-2 text-[13px] text-v2-text-text-muted [font-weight:440]">
                  {props.controller.query()
                    ? language.t("home.sessions.search.noResults", { query: props.controller.query() })
                    : language.t("home.sessions.empty")}
                </p>
              }
            >
              <SessionSkeleton count={5} />
            </Show>
          }
        >
          <For each={props.controller.groups()}>{renderGroup}</For>
        </Show>
      </nav>
      <div class="flex shrink-0 items-center gap-1 border-t border-v2-border-weak-base px-2 py-1.5">
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          data-action="sidebar-settings"
          icon={<IconV2 name="settings-gear" />}
          aria-label={language.t("sidebar.settings")}
          onClick={() => openSettings()}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          data-action="sidebar-shortcuts"
          icon={<Icon name="keyboard" />}
          aria-label={language.t("settings.tab.shortcuts")}
          onClick={() => openShortcuts()}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          data-action="sidebar-help"
          icon={<IconV2 name="help" />}
          aria-label={language.t("sidebar.help")}
          onClick={() => platform.openExternal("https://opencode.ai/desktop-feedback")}
        />
      </div>
    </aside>
  )
}
