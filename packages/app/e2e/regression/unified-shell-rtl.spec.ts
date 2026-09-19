import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/OpenCode/UnifiedShell"
const projectID = "project-unified-shell"
const sessionID = "session-unified-shell"
const targetSessionID = "session-unified-shell-target"
const sessionHref = `/server/${base64Encode(server)}/session/${sessionID}`
const targetSessionHref = `/server/${base64Encode(server)}/session/${targetSessionID}`

test.describe("unified shell responsive and direction behavior", () => {
  test("renders the review file path with LTR direction in RTL", async ({ page }) => {
    await setup(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(sessionHref)
    await page.evaluate(() => (document.documentElement.dir = "rtl"))

    const inspector = page.locator('[data-component="contextual-inspector"]')
    await inspector.getByRole("button", { name: "Review" }).click()
    await expect(page.locator("#review-panel")).toBeVisible()

    const row = page.locator(
      '[data-component="file-tree-v2"] [data-slot="file-tree-v2-row"][data-path="src/main.ts"]',
    )
    const path = row.locator("span.flex-1.min-w-0")
    await expect(row).toBeVisible()
    await expect(path).toBeVisible()
    await expect(path).toHaveAttribute("dir", "ltr")
  })

  test("keeps the inspector rail inside the viewport before any panel is pinned", async ({ page }) => {
    await setup(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(sessionHref)

    const inspector = page.locator('[data-component="contextual-inspector"]')
    await expect(inspector).toBeVisible()
    await expect
      .poll(async () => {
        const box = await inspector.boundingBox()
        return box ? Math.round(box.x + box.width) : Number.POSITIVE_INFINITY
      })
      .toBeLessThanOrEqual(1280)
  })

  test("uses the configured desktop density and removes the sidebar from focus navigation", async ({ page }) => {
    await setup(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(sessionHref)

    const sidebar = page.locator('[data-component="unified-sidebar"]:visible')
    const newSession = page.getByRole("button", { name: "New session" })
    await expect(sidebar).toBeVisible()
    await expect(newSession).toBeVisible()
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(300)

    const toggle = page.getByRole("button", { name: "Toggle sidebar" })
    await toggle.click()
    await expect(page.locator('[data-component="unified-sidebar"]:visible')).toHaveCount(0)
    await expect(newSession).toHaveCount(0)
    await toggle.focus()
    await page.keyboard.press("Tab")
    expect(await page.locator(":focus").getAttribute("data-action")).not.toBe("sidebar-new-session")

    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(300)
    await toggle.press("Tab")
    await page.keyboard.press("Tab")
    await expect(sidebar.locator("button:focus, a:focus")).toHaveCount(1)
  })

  test("uses compact desktop geometry", async ({ page }) => {
    await setup(page, { sidebarDensity: "compact" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(sessionHref)

    const sidebar = page.locator('[data-component="unified-sidebar"]:visible')
    await expect(sidebar).toBeVisible()
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(252)
  })

  for (const direction of ["ltr", "rtl"] as const) {
    test(`opens the mobile ${direction.toUpperCase()} drawer from inline start and closes after selection or backdrop click`, async ({ page }) => {
    await setup(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(sessionHref)
    if (direction === "rtl") await page.evaluate(() => (document.documentElement.dir = "rtl"))

    const toggle = page.getByRole("button", { name: "Toggle sidebar" })
    await toggle.click()
    const drawer = page.locator('[data-component="unified-sidebar"]:visible')
    const shell = drawer.locator("..").filter({ has: drawer })
    await expect(drawer).toBeVisible()
    await expect
      .poll(async () => {
        const drawerBox = await drawer.boundingBox()
        if (!drawerBox) return -1
        return direction === "ltr" ? drawerBox.x : drawerBox.x + drawerBox.width
      })
      .toBe(direction === "ltr" ? 0 : 390)

    await drawer.locator(`[data-session-id="${targetSessionID}"]`).click()
    await expect(page).toHaveURL(targetSessionHref)
    await expect(shell).toHaveAttribute("inert", "")

    await toggle.click()
    await expect(page.locator('[data-component="unified-sidebar"]:visible')).toBeVisible()
    await page.locator("div.bg-v2-overlay-simple-overlay-scrim").click({ position: { x: direction === "rtl" ? 1 : 389, y: 400 } })
    await expect(shell).toHaveAttribute("inert", "")
    })
  }

  test("keeps the terminal direction LTR in RTL", async ({ page }) => {
    await setup(page, { protocol: "v2" })
    await page.route("**/api/pty*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          location: { directory, project: { id: projectID, directory } },
          data: { id: "pty-unified-shell", title: "Terminal 1", command: "cmd.exe", args: [], cwd: directory, status: "running", pid: 1 },
        }),
      }),
    )
    await page.route("**/api/pty/pty-unified-shell/connect-token*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          location: { directory, project: { id: projectID, directory } },
          data: { ticket: "e2e-ticket", expires_in: 60 },
        }),
      }),
    )
    await page.routeWebSocket(/\/api\/pty\/pty-unified-shell\/connect/, () => undefined)
    await page.goto(sessionHref)
    await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await page.keyboard.press("Control+Backquote")

    const terminal = page.locator('[data-component="terminal"]')
    await expect(terminal).toBeVisible()
    await expect(terminal).toHaveAttribute("dir", "ltr")
  })

  for (const direction of ["ltr", "rtl"] as const) {
    test(`keeps the pinned review inspector at inline end in ${direction.toUpperCase()}`, async ({ page }) => {
      await setup(page)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(sessionHref)
      await page.evaluate((value) => (document.documentElement.dir = value), direction)

      const sidebar = page.locator('[data-component="unified-sidebar"]:visible')
      await expect(sidebar.locator('bdi[dir="auto"]')).toHaveCount(3)
      await expect(sidebar.locator(`[data-session-id="${sessionID}"] bdi[dir="auto"]`)).toContainText("جلسة")

      const inspector = page.locator('[data-component="contextual-inspector"]')
      const reviewButton = inspector.getByRole("button", { name: "Review" })
      const filesButton = inspector.getByRole("button", { name: "All files" })
      const reviewPanel = page.locator("#review-panel")
      await reviewButton.click()
      await expect(reviewButton).toHaveAttribute("aria-pressed", "true")
      await expect(reviewPanel).toBeVisible()
      const inspectorBox = await inspector.boundingBox()
      const panelBox = await reviewPanel.boundingBox()
      if (!inspectorBox || !panelBox) throw new Error("RTL shell geometry is unavailable")
      if (direction === "ltr") expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(inspectorBox.x)
      if (direction === "rtl") expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(panelBox.x)
      await reviewButton.focus()
      await expect(reviewButton).toBeFocused()
      await reviewButton.press("Tab")
      await expect(filesButton).toBeFocused()
    })
  }
})

async function setup(
  page: Parameters<typeof mockOpenCodeServer>[0],
  options: { sidebarDensity?: "comfortable" | "compact"; locale?: string; protocol?: "v2" } = {},
) {
  await mockOpenCodeServer(page, {
    protocol: options.protocol,
    directory,
    project: { id: projectID, worktree: directory, name: "مشروع OpenCode", vcs: "git", sandboxes: [] },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory,
        title: "جلسة OpenCode",
        version: "dev",
        time: { created: 1, updated: 1 },
      },
      {
        id: targetSessionID,
        slug: targetSessionID,
        projectID,
        directory,
        title: "جلسة ثانية",
        version: "dev",
        time: { created: 2, updated: 2 },
      },
    ],
    provider: options.protocol
      ? {
          all: [
            {
              id: "opencode",
              name: "OpenCode",
              models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
            },
          ],
          connected: ["opencode"],
          default: { providerID: "opencode", modelID: "test" },
        }
      : { all: [], connected: [], default: {} },
    vcsDiff: [{ file: "src/main.ts", status: "modified", additions: 1, deletions: 0 }],
    fileList: () => [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ density, locale, server, sessionID }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true }, appearance: { sidebarDensity: density } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true } }))
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server, sessionId: sessionID },
          { type: "session", server, sessionId: targetSessionID },
        ]),
      )
      if (locale) localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale }))
    },
    { density: options.sidebarDensity ?? "comfortable", locale: options.locale, server, sessionID, targetSessionID },
  )
}
