#!/usr/bin/env bun

import path from "node:path"
import { runForkUpdate } from "./fork-update"

const root = path.resolve(import.meta.dir, "..")
const upstream = "https://github.com/anomalyco/opencode.git"

export async function runForkSetup(options: {
  tag?: string
  run?: (command: string) => string | Promise<string>
  update?: (options: { tag?: string }) => Promise<void>
} = {}) {
  const run = options.run ?? ((command: string) => {
    const result = Bun.spawnSync({ cmd: command.split(" "), cwd: root, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) throw new Error(`${command} failed`)
    return result.stdout.toString()
  })
  let remote = ""
  try { remote = (await run("git remote get-url upstream")).trim() } catch {}
  if (remote && remote !== upstream) throw new Error(`upstream must be ${upstream}`)
  if (!remote) await run(`git remote add upstream ${upstream}`)
  await (options.update ?? runForkUpdate)({ tag: options.tag })
}

if (import.meta.main) runForkSetup({ tag: process.argv[2] }).catch((error) => { console.error(error); process.exit(1) })
