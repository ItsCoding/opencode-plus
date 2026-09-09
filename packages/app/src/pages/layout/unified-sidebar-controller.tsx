import type { Session } from "@opencode-ai/sdk/v2/client"
import { useQuery } from "@tanstack/solid-query"
import { type Accessor, createMemo, startTransition } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Binary } from "@opencode-ai/core/util/binary"
import { useLanguage } from "@/context/language"
import { loadHomeSessionIndex, type HomeSessionEvents } from "@/context/global-sync/home-session-index"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { archiveHomeSession } from "@/pages/home-session-archive"
import { errorMessage, projectForSession } from "./helpers"
import { groupSidebarSessions, type UnifiedSidebarGroup } from "./unified-sidebar-model"
import { showToast } from "@/utils/toast"
import { createHomeController } from "../home/home-controller"

export type UnifiedSidebarController = {
  groups: Accessor<UnifiedSidebarGroup[]>
  loading: Accessor<boolean>
  query: Accessor<string>
  setQuery(value: string): void
  expanded(key: string): boolean
  toggle(key: string): void
  open(session: Session): void
  archive(session: Session): Promise<void>
  prefetch(session: Session, priority?: "high" | "low"): void
  newSession(): void
}

export function createUnifiedSidebarController(): UnifiedSidebarController {
  const home = createHomeController()
  const tabs = useTabs()
  const language = useLanguage()
  const [state, setState] = createStore({ query: "", expanded: {} as Record<string, boolean> })
  const homeSessions = () => home.server.focusedSync().homeSessions
  const sessionEventLoad = useQuery(() => ({
    queryKey: homeSessions().eventsKey,
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    initialData: { sequence: 0, entries: [] } satisfies HomeSessionEvents,
    enabled: false,
  }))
  const sessionLoad = useQuery(() => ({
    queryKey: homeSessions().indexKey,
    enabled: !!home.server.focusedContext(),
    queryFn: async ({ signal }) => {
      const ctx = home.server.focusedContext()
      if (!ctx) return { sessions: [], eventSequence: 0 }
      const cache = homeSessions()
      const eventSequence = cache.eventSequence()
      const index = await loadHomeSessionIndex(
        (input, options) => ctx.sdk.client.v2.session.list(input, options),
        eventSequence,
        signal,
      )
      cache.complete(eventSequence)
      return index
    },
    retry: false,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
  }))
  const groups = createMemo(() =>
    groupSidebarSessions({
      projects: home.project.list(),
      sessions: homeSessions().sessions(sessionLoad.data, sessionEventLoad.data),
      expanded: new Set(Object.keys(state.expanded).filter((key) => state.expanded[key])),
      query: state.query,
    }),
  )

  return {
    groups,
    loading: createMemo(() => sessionLoad.isLoading),
    query: createMemo(() => state.query),
    setQuery: (value) => setState("query", value),
    expanded: (key) => !!state.expanded[key],
    toggle: (key) => setState("expanded", key, (value) => !value),
    open: (session) => {
      const project = projectForSession(session, home.project.list())
      const conn = home.server.focused()
      const ctx = home.server.focusedContext()
      if (!conn || !ctx) return
      const directory = project?.worktree ?? session.directory
      ctx.projects.open(directory)
      ctx.projects.touch(directory)
      void startTransition(() => {
        const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
        tabs.select(tab)
      })
    },
    archive: async (session) => {
      const conn = home.server.focused()
      const ctx = home.server.focusedContext()
      if (!conn || !ctx || (await ctx.sdk.protocol) !== "v1") return
      const [, setStore] = ctx.sync.child(session.directory)
      await archiveHomeSession({
        server: ServerConnection.key(conn),
        session,
        archive: (sessionID) =>
          ctx.sdk.client.session.update({
            sessionID,
            directory: session.directory,
            time: { archived: Date.now() },
          }),
        remove: () => {
          setStore(
            produce((draft) => {
              const match = Binary.search(draft.session, session.id, (item) => item.id)
              if (match.found) draft.session.splice(match.index, 1)
            }),
          )
          homeSessions().remove(session.id)
        },
        onError: (cause) =>
          showToast({
            title: language.t("common.requestFailed"),
            description: errorMessage(cause, language.t("common.requestFailed")),
          }),
      })
    },
    prefetch: (session) => {
      const ctx = home.server.focusedContext()
      if (!ctx) return
      void ctx.sync.session.sync(session.id).catch(() => {})
    },
    newSession: () => {
      const conn = home.server.focused()
      const directory = home.project.newSession()?.worktree ?? home.project.homedir()
      if (!conn || !directory) return
      void tabs.newDraft({ server: ServerConnection.key(conn), directory })
    },
  }
}
