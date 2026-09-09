import { expectSessionTitle } from "../../utils/waits"
import { benchmark, expect } from "../benchmark"
import { measureFirstNavigation } from "./first-navigation-probe"
import { fixture } from "./session-timeline-stress.fixture"
import {
  installStressSessionTabs,
  installTimelineSettings,
  mockStressTimeline,
  stressSessionHref,
} from "./timeline-test-helpers"
import { waitForStableTimeline } from "./session-tab-switch-probe"

const contentSelector = '[data-message-id], [data-component="prompt-input"]'
benchmark.describe("performance: first navigation paint", () => {
  benchmark("opens an unvisited sidebar session without a blank frame", async ({ page, report }) => {
    await setup(page)
    const href = stressSessionHref(fixture.targetID)
    const row = page.locator(
      `div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"] a`,
    )
    await expect(row).toBeVisible()
    const result = await measureFirstNavigation(page, {
      destinationPath: href,
      sourceSelector: messageSelector(fixture.expected.sourceMessageIDs.at(-1)!),
      destinationSelector: messageSelector(fixture.expected.targetMessageIDs.at(-1)!),
      contentSelector,
      triggerSelector: `div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"] a`,
      navigate: async () => {
        await row.click()
        await expectSessionTitle(page, fixture.expected.targetTitle)
      },
    })
    report(result)
    expect(result.summary.blankSamples).toBe(0)
    expect(result.summary.unknownSamples).toBe(0)
  })

  benchmark("opens the new sidebar session before its lazy module is used", async ({ page, report }) => {
    await setup(page)
    const action = page.locator('div:not([inert]) > [data-component="unified-sidebar"] [data-action="sidebar-new-session"]')
    await expect(action).toBeVisible()
    const result = await measureFirstNavigation(page, {
      destinationPath: "/new-session?draftId=",
      partialDestinationPath: true,
      sourceSelector: messageSelector(fixture.expected.sourceMessageIDs.at(-1)!),
      destinationSelector: '[data-component="prompt-input"]',
      contentSelector,
      triggerSelector: 'div:not([inert]) > [data-component="unified-sidebar"] [data-action="sidebar-new-session"]',
      navigate: async () => {
        await action.click()
        await expect(page).toHaveURL(/\/new-session\?draftId=/)
        await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
      },
    })
    report(result)
    expect(result.summary.blankSamples).toBe(0)
    expect(result.summary.unknownSamples).toBe(0)
  })

  benchmark("opens a child session without a blank frame", async ({ page, report }) => {
    await setup(page)
    const href = stressSessionHref(fixture.childID)
    const result = await measureFirstNavigation(page, {
      destinationPath: href,
      sourceSelector: messageSelector(fixture.expected.sourceMessageIDs.at(-1)!),
      destinationSelector: messageSelector(fixture.expected.childMessageIDs.at(-1)!),
      contentSelector,
      triggerSelector: `a[href="${href}"]`,
      navigate: async () => {
        await page.locator(`a[href="${href}"]`, { has: page.locator('[data-component="task-tool-card"]') }).click()
        await expectSessionTitle(page, fixture.expected.childTitle)
      },
    })
    report(result)
    expect(result.summary.blankSamples).toBe(0)
    expect(result.summary.unknownSamples).toBe(0)
  })
})

async function setup(page: Parameters<typeof mockStressTimeline>[0]) {
  await mockStressTimeline(page)
  await installTimelineSettings(page)
  await page.addInitScript(() => {
    localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true } }))
  })
  await installStressSessionTabs(page)
  await page.goto(stressSessionHref(fixture.sourceID))
  await expectSessionTitle(page, fixture.expected.sourceTitle)
  await waitForStableTimeline(page, fixture.expected.sourceMessageIDs.at(-1)!)
}

function messageSelector(id: string) {
  return `[data-message-id="${id}"]`
}
