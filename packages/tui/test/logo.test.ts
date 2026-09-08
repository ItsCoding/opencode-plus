import { expect, test } from "bun:test"
import { logo } from "../src/logo"

test("marks the TUI welcome logo as the fork", () => {
  expect(logo.right).toEqual([
    "                  ",
    "█▀▀▀ █▀▀█ █▀▀█ █▀▀█   ▄",
    "█___ █__█ █__█ █^^^ █▄▄▄",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀   ▀",
  ])
})
