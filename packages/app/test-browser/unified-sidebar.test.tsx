import { afterAll, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import solidH from "solid-js/h"
import { createComponent, render } from "solid-js/web"
import type { Session } from "@opencode-ai/sdk/v2/client"

;(globalThis as { React?: { createElement: typeof solidH } }).React = {
  createElement: (type, props, ...children) => {
    const next = { ...props }
    if (typeof type !== "string") return solidH(type, next, ...children)
    for (const key of Object.keys(next)) {
      if (!key.startsWith("on") || key.startsWith("on:")) continue
      next[`on:${key.slice(2).toLowerCase()}`] = next[key]
      delete next[key]
    }
    return solidH(type, next, ...children)
  },
}

const conn = { key: "selected-server" }
const session = {
  id: "session-1",
  slug: "session-1",
  projectID: "project-1",
  directory: "/project",
  title: "Investigate RTL",
  version: "test",
  time: { created: 1, updated: 2 },
} as Session
const project = { id: "project-1", name: "Project", worktree: "/project", expanded: false }
const syncCalls: string[] = []
const opened: string[] = []
const touched: string[] = []
const addedTabs: Array<{ server: string; sessionId: string }> = []
const selectedTabs: unknown[] = []
const drafts: Array<{ server: string; directory: string }> = []
const removed: string[] = []
const listCalls: unknown[] = []
const cache = {
  indexKey: ["home", "index"],
  eventsKey: ["home", "events"],
  eventSequence: () => 0,
  complete: () => {},
  sessions: () => [session],
  remove: (id: string) => removed.push(id),
}
const ctx = {
  sdk: {
    client: {
      v2: {
        session: {
          list: async (input: unknown, options: unknown) => {
            listCalls.push({ input, options })
            return { data: { data: [], cursor: { next: undefined } } }
          },
        },
      },
      session: {
        update: async () => undefined,
      },
    },
    protocol: Promise.resolve("v1"),
  },
  projects: {
    open: (directory: string) => opened.push(directory),
    touch: (directory: string) => touched.push(directory),
  },
  sync: {
    child: () => [{ session: [session] }, () => {}],
    session: { sync: async (id: string) => syncCalls.push(id) },
  },
}

mock.module("@/context/language", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}))
mock.module("@/context/server", () => ({
  ServerConnection: {
    key: (value: typeof conn) => value.key,
    Key: { make: (value: string) => value },
  },
  useServer: () => conn,
}))
mock.module("@/context/tabs", () => ({
  useTabs: () => ({
    addSessionTab: (tab: { server: string; sessionId: string }) => {
      addedTabs.push(tab)
      return tab
    },
    select: (tab: unknown) => selectedTabs.push(tab),
    newDraft: async (draft: { server: string; directory: string }) => drafts.push(draft),
  }),
}))
mock.module("@/pages/home/home-controller", () => ({
  createHomeController: () => ({
    server: {
      focused: () => conn,
      focusedContext: () => ctx,
      focusedSync: () => ({ homeSessions: cache }),
    },
    project: {
      list: () => [project],
      newSession: () => project,
      homedir: () => "/home",
    },
  }),
}))
mock.module("@tanstack/solid-query", () => ({
  useQuery: (input: () => { queryKey: readonly unknown[]; queryFn?: (input: { signal?: AbortSignal }) => unknown }) => {
    const options = input()
    if (options.queryKey.includes("index")) void options.queryFn?.({})
    return {
      data: options.queryKey.includes("index")
        ? { sessions: [session], eventSequence: 0 }
        : { sequence: 0, entries: [] },
      isLoading: false,
    }
  },
}))
mock.module("@/context/global-sync/home-session-index", () => ({
  loadHomeSessionIndex: async (list: (input: unknown, options: unknown) => Promise<unknown>) => {
    await list({ limit: 5_000, order: "desc" }, {})
    return { sessions: [session], eventSequence: 0 }
  },
}))
mock.module("@/pages/home-session-archive", () => ({
  archiveHomeSession: async (input: { archive: (id: string) => Promise<unknown>; remove: () => void }) => {
    await input.archive(session.id)
    input.remove()
  },
}))
mock.module("@/utils/toast", () => ({ showToast: () => {} }))
mock.module("@opencode-ai/ui/icon", () => ({ Icon: () => document.createElement("span") }))
mock.module("../src/pages/layout/sidebar-items", () => ({
  SessionItem: (props: {
    session: Session
    href?: string
    dense?: boolean
    onSelect?: (session: Session) => void
  }) => {
    const button = document.createElement("button")
    button.dataset.sessionId = props.session.id
    if (props.href) button.dataset.href = props.href
    button.dataset.dense = props.dense ? "true" : "false"
    button.textContent = props.session.title
    button.addEventListener("click", () => props.onSelect?.(props.session))
    return button
  },
}))

const { createUnifiedSidebarController } = await import("../src/pages/layout/unified-sidebar-controller")
const { UnifiedSidebar } = await import("../src/pages/layout/unified-sidebar")

afterAll(() => mock.restore())

test("controller wires the selected server session cache and sidebar side effects", async () => {
  await createRoot(async (dispose) => {
    const controller = createUnifiedSidebarController()
    await Promise.resolve()

    expect(listCalls).toHaveLength(1)
    expect(controller.groups().map((group) => group.key)).toEqual(["chats", "/project"])

    controller.setQuery("rtl")
    expect(controller.query()).toBe("rtl")
    controller.toggle("/project")
    expect(controller.expanded("/project")).toBe(true)

    controller.open(session)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(opened).toEqual(["/project"])
    expect(touched).toEqual(["/project"])
    expect(addedTabs).toEqual([{ server: "selected-server", sessionId: "session-1" }])
    expect(selectedTabs).toHaveLength(1)

    controller.newSession()
    expect(drafts).toEqual([{ server: "selected-server", directory: "/project" }])
    controller.prefetch(session, "high")
    await Promise.resolve()
    expect(syncCalls).toEqual(["session-1"])

    await controller.archive(session)
    expect(removed).toEqual(["session-1"])
    dispose()
  })
})

test("view exposes search, expansion, session selection, density, and mobile close behavior", () => {
  const [query, setQuery] = createSignal("")
  const toggled: string[] = []
  const newSessions: string[] = []
  const closeCalls: string[] = []
  const controller = {
    groups: () => [{ key: "/project", project, sessions: [session], total: 2 }],
    loading: () => false,
    query,
    setQuery,
    expanded: () => false,
    toggle: (key: string) => toggled.push(key),
    open: () => {},
    archive: async () => {},
    prefetch: () => {},
    newSession: () => newSessions.push("new"),
  }
  const host = document.createElement("div")
  const dispose = render(
    () =>
      createComponent(UnifiedSidebar, {
        controller,
        density: "compact",
        mobile: true,
        onClose: () => closeCalls.push("closed"),
      }),
    host,
  )

  expect(host.querySelector("aside")?.getAttribute("data-component")).toBe("unified-sidebar")
  expect((host.querySelector("aside") as HTMLElement).style.width).toBe("252px")

  const input = host.querySelector("input[type=search]") as HTMLInputElement
  input.value = "search"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  expect(query()).toBe("search")

  ;(host.querySelector("button[data-action=sidebar-new-session]") as HTMLButtonElement).click()
  expect(newSessions).toEqual(["new"])
  ;(host.querySelector("nav button") as HTMLButtonElement).click()
  expect(toggled).toEqual(["/project"])

  const item = host.querySelector("button[data-session-id=session-1]") as HTMLButtonElement
  expect(item.dataset.href).toBe("/server/c2VsZWN0ZWQtc2VydmVy/session/session-1")
  expect(item.dataset.dense).toBe("true")
  item.click()
  expect(closeCalls).toEqual(["closed"])

  dispose()
  host.remove()
})
