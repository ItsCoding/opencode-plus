#!/usr/bin/env bun

import os from "node:os"
import path from "node:path"
import semver from "semver"

type CommandOptions = {
  cwd?: string
  env?: Record<string, string | undefined>
}

type Paths = {
  root: string
  binary: string
  installed: string
}

type Options = {
  tag?: string
  platform?: string
  paths?: Paths
  now?: () => Date
  run?: (command: string, options?: CommandOptions) => string | Promise<string>
  fs?: {
    exists: (value: string) => Promise<boolean>
    copy: (from: string, to: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
  }
}

const root = path.resolve(import.meta.dir, "..")
const installed = path.join(process.env.HOME ?? os.homedir(), ".local", "bin", "opencode")

export async function runForkUpdate(options: Options = {}) {
  const paths = options.paths ?? {
    root,
    binary: path.join(root, "packages", "opencode", "dist", "opencode-darwin-arm64", "bin", "opencode"),
    installed,
  }
  const run = options.run ?? commandRunner
  const fs = options.fs ?? fileSystem
  const command = (value: string, commandOptions?: CommandOptions) => Promise.resolve(run(value, commandOptions))

  if ((options.platform ?? process.platform) !== "darwin") throw new Error("fork:update requires macOS")
  if ((await command("git status --porcelain", { cwd: paths.root })).trim()) throw new Error("worktree is not clean")
  if ((await command("git branch --show-current", { cwd: paths.root })).trim() !== "dev") {
    throw new Error("fork:update requires the dev branch")
  }
  if (!(await command("git remote get-url upstream", { cwd: paths.root })).trim()) {
    throw new Error("fork:update requires an upstream remote")
  }

  await command("git fetch upstream --tags", { cwd: paths.root })
  const release = upstreamTag(await command("git ls-remote --tags upstream v*", { cwd: paths.root }), options.tag)

  await command(`git merge --no-edit ${release.revision}`, { cwd: paths.root })
  await command("bun test test/tool/task.test.ts test/tool/models.test.ts test/tool/registry.test.ts", {
    cwd: path.join(paths.root, "packages", "opencode"),
  })
  await command("bun run --cwd packages/opencode typecheck", { cwd: paths.root })
  await command("bun run --cwd packages/opencode build -- --single", {
    cwd: paths.root,
    env: { OPENCODE_VERSION: release.tag },
  })

  const stamp = (options.now ?? (() => new Date()))().toISOString().replaceAll(":", "-").replace(".", "-")
  const backup = `${paths.installed}.${stamp}.bak`
  const temporary = `${paths.installed}.${stamp}.tmp`
  if (await fs.exists(backup)) throw new Error(`backup already exists: ${backup}`)
  await fs.copy(paths.installed, backup)
  await fs.copy(paths.binary, temporary)
  await fs.rename(temporary, paths.installed)
}

function upstreamTag(output: string, requested?: string) {
  if (requested && !semver.valid(requested)) throw new Error(`invalid release tag: ${requested}`)

  const tags = new Map<string, { tag: string; revision: string }>()
  for (const line of output.split("\n")) {
    const [revision, ref] = line.trim().split(/\s+/)
    const match = ref?.match(/^refs\/tags\/(v[^\^]+)(\^\{\})?$/)
    if (!revision || !match || !semver.valid(match[1])) continue
    if (!tags.has(match[1]) || match[2]) tags.set(match[1], { tag: match[1], revision })
  }

  const tag = requested ?? semver.rsort([...tags.keys()])[0]
  if (!tag) throw new Error("no semver release tags found in upstream")
  const release = tags.get(tag)
  if (!release) throw new Error(`release tag not found in upstream: ${tag}`)
  return release
}

function commandRunner(command: string, options: CommandOptions = {}) {
  const result = Bun.spawnSync({
    cmd: command.split(" "),
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) throw new Error(`${command} failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString()
}

const fileSystem = {
  exists: (value: string) => Bun.file(value).exists(),
  copy: async (from: string, to: string) => {
    await Bun.write(to, Bun.file(from))
  },
  rename: async (from: string, to: string) => {
    await Bun.spawn(["mv", from, to]).exited.then((exitCode) => {
      if (exitCode !== 0) throw new Error(`failed to install ${to}`)
    })
  },
}

if (import.meta.main) {
  runForkUpdate({ tag: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
