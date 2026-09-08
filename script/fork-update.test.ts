import { describe, expect, test } from "bun:test"
import { runForkUpdate } from "./fork-update"

const paths = {
  root: "/repo",
  binary: "/repo/packages/opencode/dist/opencode-darwin-arm64/bin/opencode",
  installed: "/home/alex/.opencode/bin/opencode",
}

describe("fork update", () => {
  test("stops before fetch, build, or install when the worktree is dirty", async () => {
    const commands: string[] = []

    await expect(
      runForkUpdate({
        platform: "darwin",
        paths,
        run(command) {
          commands.push(command)
          return command === "git status --porcelain" ? " M packages/opencode/src/tool/task.ts\n" : ""
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
      tag: "v1.18.30",
      platform: "darwin",
      paths,
      now: () => new Date("2026-09-07T12:34:56.000Z"),
      run(command, options) {
        commands.push(command)
        expect(options?.env?.OPENCODE_VERSION).toBe(command.endsWith("--single") ? "v1.18.30" : undefined)
        if (command === "git branch --show-current") return "dev\n"
        if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
        if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v1.18.30\n"
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
      "bun test test/tool/task.test.ts test/tool/models.test.ts test/tool/registry.test.ts",
      "bun run --cwd packages/opencode typecheck",
      "bun run --cwd packages/opencode build -- --single",
    ])
    expect(copies).toEqual([
      [paths.installed, "/home/alex/.opencode/bin/opencode.2026-09-07T12-34-56-000Z.bak"],
      [paths.binary, "/home/alex/.opencode/bin/opencode.2026-09-07T12-34-56-000Z.tmp"],
    ])
    expect(renames).toEqual([["/home/alex/.opencode/bin/opencode.2026-09-07T12-34-56-000Z.tmp", paths.installed]])
  })

  test("installs without a backup when no binary is installed", async () => {
    const copies: [string, string][] = []

    await runForkUpdate({
      tag: "v1.18.30",
      platform: "darwin",
      paths,
      now: () => new Date("2026-09-07T12:34:56.000Z"),
      run(command) {
        if (command === "git branch --show-current") return "dev\n"
        if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
        if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v1.18.30\n"
        return ""
      },
      fs: {
        exists: async () => false,
        copy: async (from, to) => copies.push([from, to]),
        rename: async () => {},
      },
    })

    expect(copies).toEqual([[paths.binary, "/home/alex/.opencode/bin/opencode.2026-09-07T12-34-56-000Z.tmp"]])
  })

  test("selects the newest release tag advertised by upstream, not a local tag", async () => {
    const commands: string[] = []

    await runForkUpdate({
      platform: "darwin",
      paths,
      now: () => new Date("2026-09-07T12:34:56.000Z"),
      run(command) {
        commands.push(command)
        if (command === "git branch --show-current") return "dev\n"
        if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
        if (command === "git tag --list v*") return "v99.0.0\n"
        if (command === "git ls-remote --tags upstream v*") {
          return "release-old\trefs/tags/v1.18.29\nrelease-new\trefs/tags/v1.18.30\n"
        }
        return ""
      },
      fs: { exists: async () => false, copy: async () => {}, rename: async () => {} },
    })

    expect(commands).not.toContain("git tag --list v*")
    expect(commands).toContain("git merge --no-edit release-new")
  })

  test("rejects an install when the timestamped backup already exists", async () => {
    const copies: [string, string][] = []

    await expect(
      runForkUpdate({
        tag: "v1.18.30",
        platform: "darwin",
        paths,
        now: () => new Date("2026-09-07T12:34:56.000Z"),
        run(command) {
          if (command === "git branch --show-current") return "dev\n"
          if (command === "git remote get-url upstream") return "https://github.com/anomalyco/opencode.git\n"
          if (command === "git ls-remote --tags upstream v*") return "abc123\trefs/tags/v1.18.30\n"
          return ""
        },
        fs: {
          exists: async () => true,
          copy: async (from, to) => copies.push([from, to]),
          rename: async () => {},
        },
      }),
    ).rejects.toThrow("backup already exists")

    expect(copies).toEqual([])
  })
})
