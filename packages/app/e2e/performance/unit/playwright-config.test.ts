import { expect, test } from "bun:test"

test("performance Playwright config only discovers benchmark specs", async () => {
  const previousPort = process.env.PLAYWRIGHT_PORT
  const previousServerPort = process.env.PLAYWRIGHT_SERVER_PORT
  const previousRunID = process.env.OPENCODE_PERFORMANCE_RUN_ID
  process.env.PLAYWRIGHT_PORT = "4096"
  try {
    const { default: config } = await import("../playwright.config")
    expect(config.testMatch).toBe("timeline/**/*.spec.ts")
  } finally {
    if (previousPort === undefined) delete process.env.PLAYWRIGHT_PORT
    else process.env.PLAYWRIGHT_PORT = previousPort
    if (previousServerPort === undefined) delete process.env.PLAYWRIGHT_SERVER_PORT
    else process.env.PLAYWRIGHT_SERVER_PORT = previousServerPort
    if (previousRunID === undefined) delete process.env.OPENCODE_PERFORMANCE_RUN_ID
    else process.env.OPENCODE_PERFORMANCE_RUN_ID = previousRunID
  }
})
