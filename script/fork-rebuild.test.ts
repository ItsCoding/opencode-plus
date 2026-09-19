import { expect, test } from "bun:test"
import { runForkRebuild, type Options } from "./fork-rebuild"

const paths = {
  root: "/repo",
  binary: "/repo/packages/opencode/dist/opencode-darwin-arm64/bin/opencode",
  installed: "/home/alex/.local/bin/opencode",
}

function fake() {
  const commands: string[] = []
  const versions: (string | undefined)[] = []
  const copies: [string, string][] = []
  const renames: [string, string][] = []
  const options: Options = {
    platform: "darwin",
    paths,
    now: () => new Date("2026-09-11T08:00:00.000Z"),
    run(command, runOptions) {
      commands.push(command)
      if (command.endsWith("--single")) versions.push(runOptions?.env?.OPENCODE_VERSION)
      return command === "git describe --tags --abbrev=0" ? "v1.18.29\n" : ""
    },
    fs: {
      exists: async (value) => value === paths.installed,
      copy: async (from, to) => {
        copies.push([from, to])
      },
      rename: async (from, to) => {
        renames.push([from, to])
      },
    },
  }
  return { commands, versions, copies, renames, options }
}

test("builds the current checkout at its latest tag and installs via a new file, without touching git", async () => {
  const { commands, versions, copies, renames, options } = fake()

  await runForkRebuild(options)

  expect(commands).toEqual(["git describe --tags --abbrev=0", "bun run --cwd packages/opencode build -- --single"])
  expect(versions).toEqual(["v1.18.29"])
  expect(copies).toEqual([
    [paths.installed, "/home/alex/.local/bin/opencode.bak"],
    [paths.binary, "/home/alex/.local/bin/opencode.2026-09-11T08-00-00-000Z.tmp"],
  ])
  expect(renames).toEqual([["/home/alex/.local/bin/opencode.2026-09-11T08-00-00-000Z.tmp", paths.installed]])
})

test("uses a passed tag instead of git describe", async () => {
  const { commands, versions, options } = fake()

  await runForkRebuild({ ...options, tag: "v1.18.30" })

  expect(commands).toEqual(["bun run --cwd packages/opencode build -- --single"])
  expect(versions).toEqual(["v1.18.30"])
})

test("rejects an invalid tag before building", async () => {
  const { commands, copies, options } = fake()

  await expect(runForkRebuild({ ...options, tag: "1.18.29-typo.." })).rejects.toThrow("invalid release tag")

  expect(commands).toEqual([])
  expect(copies).toEqual([])
})
