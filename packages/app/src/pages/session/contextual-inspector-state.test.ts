import { expect, test } from "bun:test"
import { countLoadedFiles, updateInspector } from "./contextual-inspector-state"

test("counts loaded files recursively without counting directories", () => {
  const children = new Map<string, readonly { path: string; type: "file" | "directory" }[]>([
    ["", [{ path: "src", type: "directory" }, { path: "README.md", type: "file" }]],
    ["src", [{ path: "src/nested.ts", type: "file" }, { path: "src/lib", type: "directory" }]],
    ["src/lib", [{ path: "src/lib/deep.ts", type: "file" }]],
  ])
  const loaded = new Set(["", "src", "src/lib"])

  expect(countLoadedFiles((path) => children.get(path) ?? [], (path) => loaded.has(path))).toBe(3)
})

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
