import { expect, test } from "bun:test"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { BackgroundJob as CoreBackgroundJob } from "@opencode-ai/core/background-job"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Deferred, Effect, Layer } from "effect"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Session } from "../../src/session/session"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { testEffect } from "../lib/effect"
import { ClaudeCodeLLM } from "../../src/session/llm/claude-code"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Session.node, EventV2Bridge.node, SessionProjector.node, CrossSpawnSpawner.node, InstanceStore.node]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
      [InstanceBootstrap.node, Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))],
    ],
  ),
)

test("claims each background task ID once in SDK metadata", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }

  const first = ClaudeCodeLLM.claimTask(mapping, "task-1")
  const duplicate = ClaudeCodeLLM.claimTask(first.metadata, "task-1")

  expect(first).toEqual({
    claimed: true,
    metadata: { ...mapping, completedTaskIDs: ["task-1"] },
  })
  expect(duplicate).toEqual({ claimed: false, metadata: first.metadata })
})

test("does not claim a task from another process mapping", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
    completedTaskIDs: ["task-1"],
  }

  expect(ClaudeCodeLLM.canResume(mapping, { ...mapping, processInstanceID: "next" })).toBe(false)
})

test("keeps completed task claims when merging a refreshed SDK mapping", () => {
  const mapping = {
    sessionID: "sdk-session",
    processInstanceID: "process",
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-5",
    lineage: "opencode-session",
  }

  expect(ClaudeCodeLLM.mergeMetadata({ claudeCode: { ...mapping, completedTaskIDs: ["task-1"] } }, mapping)).toEqual({
    claudeCode: { ...mapping, completedTaskIDs: ["task-1"] },
  })
})

test("process restart drops active background work without a completion prompt or SDK resume", async () => {
  const complete = await Effect.runPromise(Deferred.make<void>())
  let completionPrompts = 0
  let sdkResumes = 0

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const jobs = yield* CoreBackgroundJob.make
        yield* jobs.start({
          id: "task-1",
          type: "task",
          run: Deferred.await(complete).pipe(Effect.as("done")),
        })
        yield* jobs
          .wait({ id: "task-1" })
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                completionPrompts++
                sdkResumes++
              }),
            ),
            Effect.forkScoped,
          )
      }),
    ),
  )

  await Effect.runPromise(Deferred.succeed(complete, undefined))
  const afterRestart = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const jobs = yield* CoreBackgroundJob.make
        return yield* jobs.wait({ id: "task-1" })
      }),
    ),
  )

  expect(afterRestart).toEqual({ timedOut: false })
  expect(completionPrompts).toBe(0)
  expect(sdkResumes).toBe(0)
})

it.instance("claims a completion atomically and loses it across a process restart", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create({
      metadata: {
        claudeCode: {
          sessionID: "sdk-session",
          processInstanceID: "process",
          alias: "sonnet",
          resolvedModel: "claude-sonnet-4-5",
          lineage: "opencode-session",
        },
      },
    })

    const claims = yield* Effect.all(
      [1, 2].map(() =>
        sessions.claimMetadataTask({
          sessionID: session.id,
          key: "claudeCode",
          processInstanceID: "process",
          taskID: "task-1",
        }),
      ),
      { concurrency: "unbounded" },
    )
    expect(claims.toSorted()).toEqual([false, true])
    expect((yield* sessions.get(session.id)).metadata?.claudeCode).toMatchObject({ completedTaskIDs: ["task-1"] })
    expect(
      yield* sessions.claimMetadataTask({
        sessionID: session.id,
        key: "claudeCode",
        processInstanceID: "next-process",
        taskID: "task-2",
      }),
    ).toBe(false)
  }),
)

it.instance("preserves completed task claims when the SDK session mapping is refreshed", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create({
      metadata: {
        claudeCode: {
          sessionID: "sdk-session",
          processInstanceID: "process",
          alias: "sonnet",
          resolvedModel: "claude-sonnet-4-5",
          lineage: "opencode-session",
          completedTaskIDs: ["task-1"],
        },
      },
    })

    yield* sessions.mergeMetadata({
      sessionID: session.id,
      metadata: {
        claudeCode: {
          sessionID: "refreshed-sdk-session",
          processInstanceID: "process",
          alias: "sonnet",
          resolvedModel: "claude-sonnet-4-5",
          lineage: "opencode-session",
        },
      },
    })

    expect((yield* sessions.get(session.id)).metadata?.claudeCode).toMatchObject({
      sessionID: "refreshed-sdk-session",
      completedTaskIDs: ["task-1"],
    })
  }),
)
