import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/OpenCode/ContextualInspector"
const projectID = "project-contextual-inspector"
const sessionID = "session-contextual-inspector"

test("previews on hover, pins on click, and preserves the full panel width", async ({ page }) => {
  await setup(page)
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)

  const inspector = page.locator('[data-component="contextual-inspector"]')
  const reviewButton = inspector.getByRole("button", { name: "Review" })
  const sessionPanel = page.locator("#review-panel")
  await expect(reviewButton).toBeVisible()
  const initialWidth = await sessionPanel.evaluate((element) => element.clientWidth)

  await reviewButton.hover()
  await expect(page.locator('[data-component="contextual-inspector-preview"]')).toBeVisible()
  await expect(sessionPanel).toHaveJSProperty("clientWidth", initialWidth)

  await page.mouse.move(0, 0)
  await expect(page.locator('[data-component="contextual-inspector-preview"]')).toHaveCount(0)

  await reviewButton.click()
  await expect(reviewButton).toHaveAttribute("aria-pressed", "true")
  await expect(sessionPanel).toBeVisible()
  await reviewButton.click()
  await expect(reviewButton).toHaveAttribute("aria-pressed", "false")

  await reviewButton.focus()
  await reviewButton.press("Enter")
  await expect(reviewButton).toHaveAttribute("aria-pressed", "true")
})

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test("pins on tap without opening a hover preview", async ({ page }) => {
    await setup(page)
    await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)

    const inspector = page.locator('[data-component="contextual-inspector"]')
    const reviewButton = inspector.getByRole("button", { name: "Review" })
    const preview = page.locator('[data-component="contextual-inspector-preview"]')
    await expect(reviewButton).toBeVisible()
    await expect(preview).toHaveCount(0)
    await reviewButton.tap()
    await expect(reviewButton).toHaveAttribute("aria-pressed", "true")
    await expect(preview).toHaveCount(0)
  })
})

test("places the RTL preview at the rail inline-start with its count", async ({ page }) => {
  await setup(page, "ar")
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)

  const reviewButton = page.locator('[data-component="contextual-inspector"]').getByRole("button", { name: "مراجعة" })
  await expect(reviewButton).toBeVisible()
  await reviewButton.hover()
  const preview = page.locator('[data-component="contextual-inspector-preview"]')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute("data-placement", "right")
  await expect(preview).toContainText("1")
})

async function setup(page: Parameters<typeof mockOpenCodeServer>[0], locale?: string) {
  await mockOpenCodeServer(page, {
    directory,
    project: { id: projectID, worktree: directory, name: "Contextual Inspector", vcs: "git", sandboxes: [] },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory,
        title: "Contextual Inspector",
        version: "dev",
        time: { created: 1, updated: 1 },
      },
    ],
    provider: { all: [], connected: [], default: {} },
    vcsDiff: [{ file: "README.md", status: "modified", additions: 1, deletions: 0 }],
    fileList: () => [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ review: { panelOpened: true } }))
  })
  if (locale) {
    await page.addInitScript((value) => {
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale: value }))
    }, locale)
  }
}
