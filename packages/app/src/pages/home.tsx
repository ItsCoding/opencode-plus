import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { createEffect } from "solid-js"
import { createHomeController } from "./home/home-controller"

export function NewHome() {
  const home = createHomeController()
  const tabs = useTabs()
  let opening = false

  createEffect(() => {
    if (opening || !tabs.ready()) return
    const conn = home.server.focused()
    const directory = home.project.newSession()?.worktree ?? home.project.homedir()
    if (!conn || !directory) return
    opening = true
    void tabs.newDraft({ server: ServerConnection.key(conn), directory })
  })

  return null
}
