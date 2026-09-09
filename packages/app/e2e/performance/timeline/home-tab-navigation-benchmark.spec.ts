import { benchmark, expect } from "../benchmark"
import { expectSessionTitle } from "../../utils/waits"
import { measureNavigationMilestones } from "./navigation-milestones"
import { fixture } from "./session-timeline-stress.fixture"
import {
  installStressSessionTabs,
  installTimelineSettings,
  mockStressTimeline,
  stressSessionHref,
} from "./timeline-test-helpers"
import { waitForStableTimeline } from "./session-tab-switch-probe"

const sidebarRow = 'div:not([inert]) > [data-component="unified-sidebar"] [data-session-id]'

benchmark.describe("performance: home and tab navigation", () => {
  benchmark("switches through the sidebar and paints its destination timeline", async ({ page, report }) => {
    await setup(page, [fixture.sourceID, fixture.targetID])
    await page.goto(stressSessionHref(fixture.sourceID))
    await expectSessionTitle(page, fixture.expected.sourceTitle)
    await waitForStableTimeline(page, fixture.expected.sourceMessageIDs.at(-1)!)
    const row = page.locator(`div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"]`)
    await expect(row).toBeVisible()
    const result = await measureNavigationMilestones(page, {
      triggerSelector: `[data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"]`,
      milestones: {
        content: { selector: messageSelector(fixture.expected.targetMessageIDs.at(-1)!) },
        activeSidebar: {
          selector: `div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"] .active`,
        },
      },
      navigate: async () => {
        await row.click()
        await expectSessionTitle(page, fixture.expected.targetTitle)
      },
    })
    report(result)
    await expect(row).toHaveClass(/active/)
  })

  benchmark("stages the review body after cold session content", async ({ page, report }) => {
    await setup(page, [fixture.sourceID, fixture.targetID])
    await page.goto(stressSessionHref(fixture.sourceID))
    await expectSessionTitle(page, fixture.expected.sourceTitle)
    await waitForStableTimeline(page, fixture.expected.sourceMessageIDs.at(-1)!)
    const row = page.locator(`div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.targetID}"]`)
    await expect(row).toBeVisible()
    const result = await page.evaluate(
      ({ rowSelector, title, contentSelector }) =>
        new Promise<{ contentBeforeReview: boolean; samples: number }>((resolve) => {
          let samples = 0
          const sample = () => {
            samples++
            const content = !!document.querySelector(contentSelector)
            const review = !!document.querySelector('[data-component="session-review"]')
            if (content && !review) {
              resolve({ contentBeforeReview: true, samples })
              return
            }
            if (content && review) {
              resolve({ contentBeforeReview: false, samples })
              return
            }
            requestAnimationFrame(sample)
          }
          const target = [...document.querySelectorAll<HTMLElement>(rowSelector)].find((item) =>
            item.textContent?.includes(title),
          )
          if (!target) throw new Error(`Home session row not found: ${title}`)
           target.querySelector("a")?.click()
          requestAnimationFrame(sample)
        }),
      {
        rowSelector: sidebarRow,
        title: fixture.expected.targetTitle,
        contentSelector: messageSelector(fixture.expected.targetMessageIDs.at(-1)!),
      },
    )
    report(result)
    expect(result.contentBeforeReview).toBe(true)
    await page.getByRole("button", { name: "Toggle review" }).click()
    await expect(page.locator('[data-component="session-review-v2"]')).toBeVisible()
  })

  benchmark("closes the selected session and paints the new draft composer", async ({ page, report }) => {
    await setup(page, [fixture.sourceID])
    await page.goto(stressSessionHref(fixture.sourceID))
    await expectSessionTitle(page, fixture.expected.sourceTitle)
    await waitForStableTimeline(page, fixture.expected.sourceMessageIDs.at(-1)!)
    const selected = page.locator(`div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.sourceID}"]`)
    await expect(selected).toHaveClass(/active/)
    const result = await measureNavigationMilestones(page, {
      triggerSelector: `div:not([inert]) > [data-component="unified-sidebar"] [data-session-id="${fixture.sourceID}"]`,
      milestones: {
        composer: { selector: '[data-component="prompt-input"]' },
      },
      navigate: async () => {
        await selected.click()
        await page.keyboard.press("Control+w")
        await expect(page).toHaveURL(/\/new-session\?draftId=/)
      },
    })
    report(result)
  })
})

async function setup(page: Parameters<typeof mockStressTimeline>[0], sessionIDs: string[]) {
  await mockStressTimeline(page)
  await installTimelineSettings(page)
  await page.addInitScript(() => {
    localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ sidebar: { opened: true } }))
  })
  await installStressSessionTabs(page, { sessionIDs })
}

function messageSelector(id: string) {
  return `[data-message-id="${id}"]`
}
