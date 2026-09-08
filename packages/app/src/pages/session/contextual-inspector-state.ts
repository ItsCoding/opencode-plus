export type InspectorTool = "review" | "files"
export type InspectorState = { hovered?: InspectorTool; pinned?: InspectorTool }
export type InspectorEvent =
  | { type: "enter"; tool: InspectorTool; hoverable: boolean }
  | { type: "leave"; tool: InspectorTool }
  | { type: "toggle"; tool: InspectorTool }
  | { type: "close"; tool: InspectorTool }

export function updateInspector(state: InspectorState, event: InspectorEvent): InspectorState {
  if (event.type === "enter") return event.hoverable ? { ...state, hovered: event.tool } : state
  if (event.type === "leave") return state.hovered === event.tool ? { ...state, hovered: undefined } : state
  if (event.type === "close") return state.pinned === event.tool ? { ...state, pinned: undefined } : state
  if (state.pinned === event.tool) return { hovered: state.hovered }
  return { pinned: event.tool }
}
