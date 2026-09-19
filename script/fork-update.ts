#!/usr/bin/env bun

import path from "node:path"
import semver from "semver"
import { commandRunner, runForkRebuild, type Options } from "./fork-rebuild"

const defaultRoot = path.resolve(import.meta.dir, "..")

export async function runForkUpdate(options: Options = {}) {
  const root = options.paths?.root ?? defaultRoot
  const run = options.run ?? commandRunner
  const command = (value: string, cwd = root) => Promise.resolve(run(value, { cwd }))

  if ((options.platform ?? process.platform) !== "darwin") throw new Error("fork:update requires macOS")
  if ((await command("git status --porcelain")).trim()) throw new Error("worktree is not clean")
  if ((await command("git branch --show-current")).trim() !== "dev") {
    throw new Error("fork:update requires the dev branch")
  }
  if (!(await command("git remote get-url upstream")).trim()) {
    throw new Error("fork:update requires an upstream remote")
  }

  await command("git fetch upstream --tags")
  const release = upstreamTag(await command("git ls-remote --tags upstream v*"), options.tag)

  await command(`git merge --no-edit ${release.revision}`)
  await command(
    "bun test test/tool/task.test.ts test/tool/models.test.ts test/tool/registry.test.ts",
    path.join(root, "packages", "opencode"),
  )
  await command("bun run --cwd packages/opencode typecheck")
  await runForkRebuild({ ...options, tag: release.tag, keepBackups: true })
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

if (import.meta.main) {
  runForkUpdate({ tag: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
