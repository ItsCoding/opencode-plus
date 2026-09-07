# Fork Update and Install Design

## Goal

Maintain the OpenCode fork with explicit upstream release updates and install its native macOS binary where OpenChamber Desktop launches OpenCode.

## Update Policy

Set global OpenCode `autoupdate` to `"notify"`. OpenCode continues to announce official updates but does not replace the fork binary automatically.

## Fork Update Command

Add a `fork-update` command backed by `script/fork-update.ts`. It runs only from the fork root and requires a clean worktree. It fetches `upstream` tags, selects the newest release tag by default or a requested tag, and merges that tag into the checked-out `dev` branch. Merge conflicts stop the command for human resolution.

After a successful merge, it runs focused verification, builds a single native macOS binary with `OPENCODE_VERSION` set to the merged release tag, saves the currently installed binary as a timestamped backup, and atomically replaces `~/.opencode/bin/opencode`.

## Installation

The native build embeds the WebUI, so installation copies only the compiled binary. No external frontend asset directory is needed.

## Native Task Skill

Add an optional `skill_name` argument to the built-in `task` tool. When supplied, it prefixes the child prompt with an instruction to invoke exactly that installed skill before work begins. It does not read skill files or inject their contents.

## Development Wrapper and Sessions

The temporary source wrapper executes the absolute OpenCode entrypoint without changing the process working directory. This preserves OpenChamber's project/session scope. The compiled binary installed by `fork-update` replaces the wrapper path and reports the merged release version instead of `local`.

## Scope

Add the update script, package command, native Task skill argument, wrapper correction, and concise maintenance documentation. Do not add an update check to normal OpenCode startup or modify the desktop application.
