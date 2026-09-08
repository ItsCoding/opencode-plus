import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import { groupSidebarSessions } from "./unified-sidebar-model"

const project = (worktree: string, id: string): LocalProject => ({ id, worktree, expanded: false })
const session = (input: {
  id: string
  projectID?: string
  directory?: string
  updated: number
  parentID?: string
  archived?: number
  title?: string
}): Session =>
  ({
    id: input.id,
    slug: input.id,
    projectID: input.projectID ?? "unknown",
    directory: input.directory ?? "/unknown",
    title: input.title ?? input.id,
    version: "test",
    parentID: input.parentID,
    time: { created: input.updated, updated: input.updated, archived: input.archived },
  }) as Session

describe("groupSidebarSessions", () => {
  const projects = [project("/alpha", "alpha"), project("/beta", "beta")]
  const sessions = [
    ...Array.from({ length: 7 }, (_, index) =>
      session({ id: `alpha-${index}`, projectID: "alpha", directory: "/alpha", updated: 20 - index }),
    ),
    session({ id: "beta-root", projectID: "beta", directory: "/beta", updated: 30 }),
    session({ id: "beta-child", projectID: "beta", directory: "/beta", updated: 31, parentID: "beta-root" }),
    session({ id: "archived", projectID: "beta", directory: "/beta", updated: 32, archived: 33 }),
    session({ id: "loose", directory: "/loose", updated: 40, title: "Loose research" }),
  ]

  test("groups projects and unmatched chats with five collapsed roots", () => {
    const groups = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "" })
    expect(groups.map((group) => group.key)).toEqual(["chats", "/alpha", "/beta"])
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual(["loose"])
    expect(groups[1]?.sessions).toHaveLength(5)
    expect(groups[1]?.total).toBe(7)
    expect(groups[2]?.sessions.map((item) => item.id)).toEqual(["beta-root"])
  })

  test("expanded groups return every loaded root", () => {
    const groups = groupSidebarSessions({ projects, sessions, expanded: new Set(["/alpha"]), query: "" })
    expect(groups.find((group) => group.key === "/alpha")?.sessions).toHaveLength(7)
  })

  test("search ignores the collapsed limit and matches project or session title", () => {
    const byProject = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "alpha" })
    expect(byProject.find((group) => group.key === "/alpha")?.sessions).toHaveLength(7)
    const byTitle = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "research" })
    expect(byTitle.flatMap((group) => group.sessions).map((item) => item.id)).toEqual(["loose"])
  })

  test("uses directory and sandbox fallbacks when project ids are unavailable", () => {
    const sandbox = { ...projects[0]!, sandboxes: ["/alpha-worktree"] }
    const groups = groupSidebarSessions({
      projects: [sandbox, projects[1]!],
      sessions: [session({ id: "sandbox", directory: "/alpha-worktree", updated: 1 })],
      expanded: new Set(),
      query: "",
    })
    expect(groups.find((group) => group.key === "/alpha")?.sessions[0]?.id).toBe("sandbox")
  })

  test("uses id as a deterministic tie breaker", () => {
    const groups = groupSidebarSessions({
      projects,
      sessions: [
        session({ id: "b", projectID: "alpha", directory: "/alpha", updated: 1 }),
        session({ id: "a", projectID: "alpha", directory: "/alpha", updated: 1 }),
      ],
      expanded: new Set(),
      query: "",
    })
    expect(groups.find((group) => group.key === "/alpha")?.sessions.map((item) => item.id)).toEqual(["a", "b"])
  })
})
