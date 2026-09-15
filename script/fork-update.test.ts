import { describe, expect, test } from "bun:test"
import { binaryPath, runForkUpdate } from "./fork-update"

const paths = {
  root: "/repo",
  binary: "/repo/packages/cli/dist/cli-darwin-arm64/bin/opencode",
  installed: "/home/alex/.local/bin/opencode",
}

describe("fork update", () => {
  test("selects the local macOS CLI artifact", () => {
    expect(binaryPath("/repo", "arm64")).toBe("/repo/packages/cli/dist/cli-darwin-arm64/bin/opencode")
    expect(binaryPath("/repo", "x64")).toBe("/repo/packages/cli/dist/cli-darwin-x64/bin/opencode")
  })

  test("stops before fetch, build, or install when the worktree is dirty", async () => {
    const commands: string[] = []

    await expect(
      runForkUpdate({
        platform: "darwin",
        paths,
        run(command) {
          commands.push(command)
          return command === "git status --porcelain" ? " M packages/cli/src/index.ts\n" : ""
        },
        fs: { exists: async () => false, copy: async () => {}, rename: async () => {} },
      }),
    ).rejects.toThrow("worktree is not clean")

    expect(commands).toEqual(["git status --porcelain"])
  })

  test("merges, verifies, builds, and atomically installs the requested tag", async () => {
    const commands: string[] = []
    const copies: [string, string][] = []
    const renames: [string, string][] = []

    await runForkUpdate({
      tag: "v2.0.3",
      platform: "darwin",
      paths,
      now: () => new Date("2026-09-15T12:34:56.000Z"),
      run(command, options) {
        commands.push(command)
        expect(options?.env?.OPENCODE_VERSION).toBe(command.endsWith("--single") ? "2.0.3" : undefined)
        if (command === "git branch --show-current") return "dev\n"
        if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
        if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v2.0.3\n"
        return ""
      },
      fs: {
        exists: async (value) => value === paths.installed,
        copy: async (from, to) => copies.push([from, to]),
        rename: async (from, to) => renames.push([from, to]),
      },
    })

    expect(commands).toEqual([
      "git status --porcelain",
      "git branch --show-current",
      "git remote get-url upstream",
      "git fetch upstream --tags",
      "git ls-remote --tags upstream v*",
      "git merge --no-edit abc123",
      "bun run --cwd packages/cli typecheck",
      "bun run --cwd packages/cli build -- --single",
    ])
    expect(copies).toEqual([
      [paths.installed, "/home/alex/.local/bin/opencode.2026-09-15T12-34-56-000Z.bak"],
      [paths.binary, "/home/alex/.local/bin/opencode.2026-09-15T12-34-56-000Z.tmp"],
    ])
    expect(renames).toEqual([['/home/alex/.local/bin/opencode.2026-09-15T12-34-56-000Z.tmp', paths.installed]])
  })

  test("installs without a backup when no binary is installed", async () => {
    const copies: [string, string][] = []

    await runForkUpdate({
      tag: "v2.0.3",
      platform: "darwin",
      paths,
      now: () => new Date("2026-09-15T12:34:56.000Z"),
      run(command) {
        if (command === "git branch --show-current") return "dev\n"
        if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
        if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v2.0.3\n"
        return ""
      },
      fs: {
        exists: async () => false,
        copy: async (from, to) => copies.push([from, to]),
        rename: async () => {},
      },
    })

    expect(copies).toEqual([[paths.binary, "/home/alex/.local/bin/opencode.2026-09-15T12-34-56-000Z.tmp"]])
  })

  test("rejects an install when the timestamped backup already exists", async () => {
    await expect(
      runForkUpdate({
        tag: "v2.0.3",
        platform: "darwin",
        paths,
        now: () => new Date("2026-09-15T12:34:56.000Z"),
        run(command) {
          if (command === "git branch --show-current") return "dev\n"
          if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
          if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v2.0.3\n"
          return ""
        },
        fs: { exists: async () => true, copy: async () => {}, rename: async () => {} },
      }),
    ).rejects.toThrow("backup already exists")
  })
})
