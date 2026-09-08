import { expect, test } from "bun:test"
import { updateInspector } from "./contextual-inspector-state"

test("previews on hover without pinning", () => {
  expect(updateInspector({}, { type: "enter", tool: "review", hoverable: true })).toEqual({ hovered: "review" })
  expect(updateInspector({ hovered: "review" }, { type: "leave", tool: "review" })).toEqual({})
})

test("pins directly when hover is unavailable", () => {
  expect(updateInspector({}, { type: "enter", tool: "files", hoverable: false })).toEqual({})
  expect(updateInspector({}, { type: "toggle", tool: "files" })).toEqual({ pinned: "files" })
})

test("toggles and switches pinned tools", () => {
  expect(updateInspector({}, { type: "toggle", tool: "review" })).toEqual({ pinned: "review" })
  expect(updateInspector({ pinned: "review" }, { type: "toggle", tool: "files" })).toEqual({ pinned: "files" })
  expect(updateInspector({ pinned: "files" }, { type: "toggle", tool: "files" })).toEqual({})
})
