import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "C:/OpenCode/NewSessionShell"
const sessions: { id: string; [key: string]: unknown }[] = [
  {
    id: "session-new-session-shell",
    projectID: "project-new-session-shell",
    directory,
    title: "Create the first session",
    time: { created: 1700000000000, updated: 1700000000000 },
  },
]

test("opens the draft composer from home and promotes it on submit", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "project-new-session-shell",
      worktree: directory,
      vcs: "git",
      name: "opencode-plus",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [{ id: "opencode", name: "OpenCode", models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } } }],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions,
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, server }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { directory },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([]))
    },
    { directory, server },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === "POST" && (url.pathname === "/session" || url.pathname === "/api/session")) {
      const session = {
        id: "session-new-session-shell",
        projectID: "project-new-session-shell",
        directory,
        location: { directory },
        title: "Create the first session",
        time: { created: 1700000000000, updated: 1700000000000 },
      }
      if (!sessions.some((item) => item.id === session.id)) sessions.push(session)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(url.pathname === "/api/session" ? { data: session } : session),
      })
    }
    if (
      route.request().method() === "POST" &&
      (url.pathname === "/session/session-new-session-shell/message" ||
        url.pathname === "/api/session/session-new-session-shell/message")
    ) {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
    }
    return route.fallback()
  })

  await page.goto("/")
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-action="prompt-project"]')).toBeVisible()
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
  await page.locator('[data-action="prompt-project"]').click()
  await page.locator('[role="menu"]').getByText("opencode-plus", { exact: true }).click()
  const input = page.locator('[data-component="prompt-input"]')
  await input.fill("Create the first session")
  await expect(input).toHaveText("Create the first session")
  await input.focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/server\/[^/]+\/session\//)
  await expect(page.locator('[data-component="unified-sidebar"]:visible [data-session-id]')).toContainText(
    "Create the first session",
  )
})
