import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "C:/OpenCode/UnifiedSidebar"
const projectID = "project-unified-sidebar"
const sessionA = session("session-a", "Session A")
const sessionB = session("session-b", "Session B")

test("mounts the unified sidebar and navigates sessions without titlebar tabs", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: { id: projectID, worktree: directory, name: "Unified Sidebar", vcs: "git", sandboxes: [] },
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

  await expect(page.locator('[data-slot="titlebar-tabs"]')).toHaveCount(0)
  await expect(page.locator('[data-component="unified-sidebar"]:visible')).toBeVisible()
  await page.locator('[data-session-id="session-b"]:visible').click()
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-b$/)
  await expect(page.locator('[data-session-id="session-b"]:visible')).toHaveClass(/active/)
})

test("keeps the bottom mobile titlebar outside the sidebar drawer and backdrop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOpenCodeServer(page, {
    directory,
    project: { id: projectID, worktree: directory, name: "Unified Sidebar", vcs: "git", sandboxes: [] },
    sessions: [sessionA, sessionB],
    provider: { all: [], connected: [], default: {} },
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ server, sessionA, sessionB }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, mobileTitlebarPosition: "bottom" } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ mobileSidebar: { opened: true } }))
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

  const titlebar = page.locator('[data-slot="titlebar-v2"]')
  const drawer = page.locator('[data-component="unified-sidebar"]:visible')
  const drawerShell = drawer.locator("..")
  const backdrop = page.locator("div.bg-v2-overlay-simple-overlay-scrim")
  await expect(drawer).toBeVisible()
  await expect(backdrop).toBeVisible()
  const titlebarBox = await titlebar.boundingBox()
  const drawerBox = await drawerShell.boundingBox()
  const backdropBox = await backdrop.boundingBox()
  if (!titlebarBox || !drawerBox || !backdropBox) throw new Error("sidebar geometry is unavailable")
  expect(drawerBox.y).toBe(0)
  expect(backdropBox.y).toBe(0)
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(titlebarBox.y + 1)
  expect(backdropBox.y + backdropBox.height).toBeLessThanOrEqual(titlebarBox.y + 1)
  await expect(drawerShell).not.toHaveAttribute("inert")

  await titlebar.locator('button[aria-expanded="true"]').click()
  await expect(drawerShell).toHaveAttribute("inert", "")
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
