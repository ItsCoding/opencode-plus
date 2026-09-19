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

export type Options = {
  tag?: string
  keepBackups?: boolean
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

export async function runForkRebuild(options: Options = {}) {
  const paths = options.paths ?? {
    root,
    binary: path.join(root, "packages", "opencode", "dist", "opencode-darwin-arm64", "bin", "opencode"),
    installed,
  }
  const run = options.run ?? commandRunner
  const fs = options.fs ?? fileSystem
  const command = (value: string, commandOptions?: CommandOptions) => Promise.resolve(run(value, commandOptions))

  if ((options.platform ?? process.platform) !== "darwin") throw new Error("fork:rebuild requires macOS")
  const tag = options.tag ?? (await command("git describe --tags --abbrev=0", { cwd: paths.root })).trim()
  if (!semver.valid(tag)) throw new Error(`invalid release tag: ${tag}`)
  await command("bun run --cwd packages/opencode build -- --single", {
    cwd: paths.root,
    env: { OPENCODE_VERSION: tag },
  })

  // Never write over the installed binary in place: macOS keeps the old signature for that inode and SIGKILLs the new one.
  const stamp = (options.now ?? (() => new Date()))().toISOString().replaceAll(":", "-").replace(".", "-")
  // ponytail: plain rebuilds keep one rolling backup; a 344MB timestamped copy per rebuild fills the disk.
  const backup = options.keepBackups ? `${paths.installed}.${stamp}.bak` : `${paths.installed}.bak`
  const temporary = `${paths.installed}.${stamp}.tmp`
  if (await fs.exists(paths.installed)) {
    if (options.keepBackups && (await fs.exists(backup))) throw new Error(`backup already exists: ${backup}`)
    await fs.copy(paths.installed, backup)
  }
  await fs.copy(paths.binary, temporary)
  await fs.rename(temporary, paths.installed)
}

export function commandRunner(command: string, options: CommandOptions = {}) {
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
  runForkRebuild({ tag: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
