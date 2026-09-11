import { expect, test } from "bun:test"
import { isTextStreaming } from "../../../src/routes/session"

test("stops streaming when an assistant text part is complete", () => {
  expect(isTextStreaming(undefined)).toBe(true)
  expect(isTextStreaming(1)).toBe(false)
})
