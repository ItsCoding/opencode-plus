import { expect, test } from "bun:test"
import { runForkSetup } from "./fork-setup"

test("adds upstream and delegates to the updater", async () => {
  const commands: string[] = []
  let updated = false
  await runForkSetup({
    run: async (command) => {
      commands.push(command)
      if (command === "git remote get-url upstream") throw new Error("missing")
      return ""
    },
    update: async () => {
      updated = true
    },
  })
  expect(commands).toEqual([
    "git remote get-url upstream",
    "git remote add upstream https://github.com/anomalyco/opencode.git",
  ])
  expect(updated).toBe(true)
})

test("accepts the official SSH upstream URL", async () => {
  await runForkSetup({
    run: () => "git@github.com:anomalyco/opencode.git\n",
    update: async () => {},
  })
})
