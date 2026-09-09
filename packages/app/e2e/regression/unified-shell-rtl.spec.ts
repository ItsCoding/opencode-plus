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
  test("uses the configured desktop density and removes the sidebar from focus navigation", async ({ page }) => {
    await setup(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(sessionHref)

    const sidebar = page.locator('[data-component="unified-sidebar"]:visible')
    await expect(sidebar).toBeVisible()
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(300)

    const toggle = page.getByRole("button", { name: "Toggle sidebar" })
    await toggle.click()
    await expect(page.locator('[data-component="unified-sidebar"]:visible')).toHaveCount(0)
    await expect(page.locator('[data-component="unified-sidebar"] a:visible')).toHaveCount(0)

    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(300)
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
    await expect.poll(async () => (await shell.boundingBox())?.x ?? -1).toBe(0)
    const drawerBox = await shell.boundingBox()
    if (!drawerBox) throw new Error("mobile drawer geometry is unavailable")
    expect(drawerBox.x).toBe(0)

    await drawer.locator(`[data-session-id="${targetSessionID}"]`).click()
    await expect(page).toHaveURL(targetSessionHref)
    await expect(shell).toHaveAttribute("inert", "")

    await toggle.click()
    await expect(page.locator('[data-component="unified-sidebar"]:visible')).toBeVisible()
    await page.locator("div.bg-v2-overlay-simple-overlay-scrim").click({ position: { x: direction === "rtl" ? 1 : 389, y: 400 } })
    await expect(shell).toHaveAttribute("inert", "")
    })
  }

  for (const mode of ["locale", "forced"] as const) {
    test(`keeps inline-end inspector and bidi content in ${mode} RTL`, async ({ page }) => {
      await setup(page, { locale: mode === "locale" ? "ar" : undefined })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(sessionHref)
      await page.evaluate(() => (document.documentElement.dir = "rtl"))

      await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
      const sidebar = page.locator('[data-component="unified-sidebar"]:visible')
      await expect(sidebar.locator('bdi[dir="auto"]')).toHaveCount(3)
      await expect(sidebar.locator(`[data-session-id="${sessionID}"] bdi[dir="auto"]`)).toContainText("جلسة")

      const inspector = page.locator('[data-component="contextual-inspector"]')
      const sessionPanel = page.locator("main")
      const inspectorBox = await inspector.boundingBox()
      const panelBox = await sessionPanel.boundingBox()
      if (!inspectorBox || !panelBox) throw new Error("RTL shell geometry is unavailable")
      expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(panelBox.x)
      const inspectorButtons = inspector.getByRole("button")
      expect(
        await inspectorButtons.nth(0).evaluate((button, next) =>
          !!(button.compareDocumentPosition(next as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
          await inspectorButtons.nth(1).elementHandle(),
        ),
      ).toBe(true)
      await inspectorButtons.nth(1).focus()
      await expect(inspectorButtons.nth(1)).toBeFocused()
    })
  }
})

async function setup(
  page: Parameters<typeof mockOpenCodeServer>[0],
  options: { sidebarDensity?: "comfortable" | "compact"; locale?: string } = {},
) {
  await mockOpenCodeServer(page, {
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
    provider: { all: [], connected: [], default: {} },
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
          { type: "session", server, sessionId },
          { type: "session", server, sessionId: targetSessionID },
        ]),
      )
      if (locale) localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale }))
    },
    { density: options.sidebarDensity ?? "comfortable", locale: options.locale, server, sessionID, targetSessionID },
  )
}
