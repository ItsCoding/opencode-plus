# Fork Setup Design

## Goal

Provide a one-command first-time setup for an OpenCode fork that configures the official upstream remote and delegates all update, build, backup, and installation work to the existing fork updater.

## Setup Command

Add `fork:setup`. It checks for the `upstream` remote. If absent, it adds `https://github.com/anomalyco/opencode.git`; if present, it requires that exact URL. It then invokes the existing `fork:update` flow.

## Safety

`fork:setup` does not duplicate merge, build, or installation logic. The delegated updater retains its clean-worktree, `dev` branch, release-tag, verification, backup, and atomic-install safeguards.
