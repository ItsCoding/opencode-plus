import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import { compareSessionTime, displayName, projectForSession } from "./helpers"

export type UnifiedSidebarGroup = {
  key: string
  project?: LocalProject
  sessions: Session[]
  total: number
}

export function groupSidebarSessions(input: {
  projects: LocalProject[]
  sessions: Session[]
  expanded: ReadonlySet<string>
  query: string
  limit?: number
}) {
  const limit = input.limit ?? 5
  const query = input.query.trim().toLocaleLowerCase()
  const roots = input.sessions
    .filter((session) => !session.parentID && typeof session.time.archived !== "number")
    .toSorted(compareSessionTime)
  const matched = new Set<string>()

  const projects = input.projects.map((project) => {
    const all = roots.filter((session) => {
      if (projectForSession(session, input.projects) !== project) return false
      matched.add(session.id)
      return true
    })
    const filtered = query
      ? displayName(project).toLocaleLowerCase().includes(query)
        ? all
        : all.filter((session) => session.title.toLocaleLowerCase().includes(query))
      : all
    return {
      key: project.worktree,
      project,
      sessions: query || input.expanded.has(project.worktree) ? filtered : filtered.slice(0, limit),
      total: filtered.length,
    } satisfies UnifiedSidebarGroup
  })

  const allChats = roots.filter((session) => !matched.has(session.id))
  const chats = query
    ? allChats.filter((session) => session.title.toLocaleLowerCase().includes(query))
    : allChats
  const result = [
    {
      key: "chats",
      sessions: query || input.expanded.has("chats") ? chats : chats.slice(0, limit),
      total: chats.length,
    } satisfies UnifiedSidebarGroup,
    ...projects,
  ]
  return query ? result.filter((group) => group.sessions.length > 0) : result
}
