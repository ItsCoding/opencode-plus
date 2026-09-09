import { For, Show, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { sessionHref } from "@/utils/session-route"
import { displayName } from "./helpers"
import { SessionItem } from "./sidebar-items"
import { type UnifiedSidebarController, createUnifiedSidebarController } from "./unified-sidebar-controller"

export function UnifiedSidebar(props: {
  controller: ReturnType<typeof createUnifiedSidebarController>
  density: "comfortable" | "compact"
  mobile?: boolean
  onClose: () => void
}): JSX.Element {
  const language = useLanguage()
  const server = useServer()
  const expanded = () => true
  const select = (session: Parameters<UnifiedSidebarController["open"]>[0]) => {
    props.controller.open(session)
    if (props.mobile) props.onClose()
  }
  const renderGroup = (group: ReturnType<UnifiedSidebarController["groups"]>[number]) => {
    const label = group.project ? displayName(group.project) : language.t("home.sessions.search.sessions")
    const viewAll = language.t("sidebar.project.viewAllSessions")
    return (
      <section class="flex flex-col gap-1 px-2 py-2" data-group={group.key}>
        <div class="flex min-w-0 items-center gap-1 px-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1 text-start"
            aria-label={viewAll}
            aria-expanded={props.controller.expanded(group.key)}
            onClick={() => props.controller.toggle(group.key)}
          >
            <Icon name="chevron-down" size="small" />
            <span class="truncate text-12-medium text-text-weak"><bdi dir="auto">{label}</bdi></span>
          </button>
        </div>
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
            class="px-2 py-1 text-start text-12-medium text-text-weak"
            aria-label={viewAll}
            onClick={() => props.controller.toggle(group.key)}
          >
            {viewAll}
          </button>
        </Show>
      </section>
    )
  }

  return (
    <aside
      data-component="unified-sidebar"
      class="h-full min-h-0 flex flex-col border-e border-v2-border-weak-base bg-v2-background-bg-base"
      style={{ width: props.density === "compact" ? "252px" : "300px" }}
    >
      <button data-action="sidebar-new-session" onClick={props.controller.newSession}>
        {language.t("command.session.new")}
      </button>
      <input
        type="search"
        value={props.controller.query()}
        placeholder={language.t("home.sessions.search.placeholder")}
        onInput={(event) => props.controller.setQuery(event.currentTarget.value)}
      />
      <nav aria-label={language.t("sidebar.nav.projectsAndSessions")} class="min-h-0 flex-1 overflow-y-auto">
        <For each={props.controller.groups()}>{renderGroup}</For>
      </nav>
    </aside>
  )
}
