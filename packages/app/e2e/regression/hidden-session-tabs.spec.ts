import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "C:/OpenCode/HiddenSessionTabs"
const projectID = "project-hidden-session-tabs"
const sessionA = session("session-a", "Session A")
const sessionB = session("session-b", "Session B")

test("preserves session drafts and tab lifecycle when titlebar tabs are hidden", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: { id: projectID, worktree: directory, name: "Hidden Session Tabs", vcs: "git", sandboxes: [] },
    sessions: [sessionA, sessionB],
    provider: { all: [], connected: [], default: {} },
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ server, sessionA, sessionB }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true } }))
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server, sessionId: sessionA },
          { type: "session", server, sessionId: sessionB },
        ]),
      )
    },
    { server, sessionA: sessionA.id, sessionB: sessionB.id },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  const input = page.locator('[data-component="prompt-input"]')
  await expect(input).toBeVisible()
  await input.fill("draft survives sidebar navigation")

  await page.locator('[data-session-id="session-b"]:visible').click()
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-b$/)
  await page.locator('[data-session-id="session-a"]:visible').click()
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-a$/)
  await expect(input).toHaveText("draft survives sidebar navigation")

  await page.keyboard.press("Control+w")
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-b$/)
  await page.keyboard.press("Control+Shift+t")
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-a$/)
  await expect(page.locator('[data-component="prompt-input"]')).toHaveText("draft survives sidebar navigation")
})

function session(id: string, title: string) {
  return {
    id,
    slug: id,
    projectID,
    directory,
    title,
    version: "dev",
    time: { created: 1, updated: 1 },
  }
}
