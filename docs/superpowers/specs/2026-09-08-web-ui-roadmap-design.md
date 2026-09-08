# Web UI Extension Roadmap Design

## Goal

Extend the OpenCode fork with a unified browser-first workspace for navigation, observability, and configuration while keeping upstream merges inexpensive. The packaged desktop app inherits the same frontend because it reuses `packages/app`; no Electron-only capability is required.

The roadmap covers:

- A project-grouped session sidebar that replaces visible session tabs.
- A centered new-session view instead of the current dashboard/welcome flow.
- A collapsible contextual inspector.
- A one-click session auto-permission toggle in the prompt bar.
- Subtle, expandable tool-call presentation for built-in and custom tools.
- Native persistent agent PTY tools with a read-only terminal viewer.
- Permanent local usage analytics and a dashboard.
- Codex plan and quota usage.
- Guided global and project management for MCP servers, plugins, and common config.

## Design Principles

### Thin fork extension layer

Fork-owned UI components live beside upstream code and consume existing OpenCode contexts, stores, routes, and UI primitives. High-churn upstream files receive narrow mount-point changes rather than feature implementations.

New server behavior uses isolated experimental HTTP API groups backed by existing services. Canonical Schema, Core, and Protocol code changes only when ownership belongs there, such as PTY metadata or durable analytics facts.

The fork ships one navigation model. It does not maintain the old and new shells behind a feature flag. Compatibility comes from small integration seams, not duplicated UX.

### Preserve internal tab lifecycle

Session tabs disappear from the titlebar, but the existing tab context remains responsible for open-session lifecycle, warm mounted routes, drafts, closed-tab history, and keyboard behavior. Sidebar selection activates that state instead of replacing it.

### Capability-aware browser

Fork-only server capabilities advertise availability. The browser hides unsupported controls when connected to an older or upstream-only server. A failure in quota, analytics, management, or PTY observation must not block chat.

## Feasibility

| Feature | Relative effort | Upstream conflict risk | Existing foundation |
| --- | --- | --- | --- |
| Prompt auto-permission toggle | Small | Low | Session/directory state, lineage inheritance, and command already exist. |
| Unified session sidebar | Medium | Medium | Project stores, session rows, statuses, prefetch, archive, and mobile drawer exist. |
| New-session view and inspector | Medium | Medium | Composer, status surfaces, and resizable side panel exist. |
| Subtle tool rows | Medium | Medium-high | Specialized renderers, generic fallback, disclosure, and tool registry exist. |
| Guided MCP/config/plugin management | Medium-high | Medium | Config GET/PATCH and MCP runtime APIs exist. |
| Native persistent PTYs | Medium-high | Medium | Location-scoped PTY lifecycle, list, replay, and terminal rendering exist. |
| Codex quota | Medium | High provider-contract risk | OAuth refresh and ChatGPT account ID handling exist. |
| Permanent usage dashboard | Large | Medium | Session totals and message/tool records exist, but deletion-proof facts do not. |

The highest-conflict frontend files are `packages/app/src/pages/layout.tsx`, `packages/app/src/components/prompt-input-v2.tsx`, and `packages/session-ui/src/components/message-part.tsx`. Implementations should keep changes in these files to imports, mount points, or small rendering branches where possible.

## Phase 1: Unified Navigation Shell

Phase 1 is the first implementation-plan boundary.

### Left sidebar

The left sidebar is the only visible session navigator.

- Its header contains `New session`.
- The existing menu control folds or unfolds the sidebar on desktop and opens or closes the drawer on mobile.
- A `chats` group contains sessions not associated with a known project.
- Each known project is a separate group.
- Each group initially shows its five most recent unarchived root sessions.
- `Show all` expands a project inline and loads more sessions through pagination.
- Search matches project names and session titles, including results beyond the initial five rows.
- Child-agent sessions remain attached to their root session.
- Existing unread, working, permission-blocked, error, and elapsed indicators are reused.

Selecting a session activates or opens its internal tab and navigates to it. The titlebar no longer renders session tabs.

### Sidebar density

Appearance settings offer two sidebar densities:

- `Comfortable`, the default: 300 px width and taller rows.
- `Compact`: 252 px width and tighter rows.

Density changes layout only. It does not hide status, alter features, or change prompt controls.

### New-session main view

With no selected session, the main pane shows a centered composer with an explicit project picker and the normal model, agent, and prompt controls. Project and session discovery no longer require the dashboard/welcome route.

Submitting the first prompt creates the session in the selected project and moves the same composer into the normal chat layout.

### Contextual inspector

A narrow tool rail remains on the right. It provides session summary, Codex quota, MCP/context status, review/files, usage, and persistent PTY access.

- Hovering an icon shows a floating summary card without changing layout.
- Moving away dismisses the preview.
- Clicking an icon pins the same content in the right sidebar.
- Clicking the active icon closes the pinned panel.
- Touch and mobile skip hover and open the panel directly.
- Large files, reviews, and terminals use the existing resizable main side-panel area.
- On narrow screens, pinned content overlays or becomes a drawer rather than squeezing chat.

### Phase 1 acceptance

- Projects and recent sessions are discoverable without the old dashboard.
- Visible titlebar session tabs are removed without losing draft, warm-route, history, or keyboard behavior.
- New sessions can be started for an explicit project.
- Sidebar fold, mobile drawer, density, search, expansion, archive, and status behavior work in LTR and RTL.
- Shell production benchmarks show no unacceptable session-switching or timeline regression.

## Phase 2: Controls And Guided Management

### Session auto-permission

The prompt bar gains a one-click auto-permission control for the current session. It uses the existing permission context and child-session lineage behavior.

There is no confirmation dialog. Active state must remain unmistakable through label, color, tooltip, and accessible pressed state. No second permission store or global default is introduced.

### Settings placement

Management extends the existing Settings V2 dialog. It does not become a main-pane route.

Fork-owned sections cover `MCP servers`, `Plugins`, `Config`, and `Appearance`. Each applicable section has an explicit `Global` or `Project` scope selector.

### MCP management

The UI supports:

- Sanitized configured entries and runtime status.
- Add, edit, and remove persisted entries.
- Enable, disable, connect, and disconnect.
- Existing OAuth flows.
- Inline validation and connection failures.

Headers, OAuth client secrets, and tokens are write-only. Read contracts return redacted values.

### Plugin management

The first release manages configured package or path specifiers only:

- List configured entries and their source scope.
- Add or remove an entry.
- Show `configured`, `ready`, or `error` status. An entry that has not loaded since the last required reload remains `configured`; loader failures expose a sanitized error.

OpenCode remains responsible for package loading. There is no marketplace, catalog, plugin source editor, or arbitrary plugin-options form.

### Common config

The first guided Config section is limited to permission defaults, default agent, default model, and sharing policy. Existing unknown JSONC fields are preserved.

Desktop may offer `Open config file`. Browser clients may show and copy the resolved path but do not receive raw secret-bearing config content.

Runtime MCP actions apply immediately. Persisted config and plugin changes validate before writing and show any required instance reconnect or reload state.

### Management APIs

Management uses narrow server-side mutations instead of browser-side read/modify/write of complete config objects. Mutations preserve unrelated keys, require existing authorization and location routing, redact secrets, and return typed validation failures.

Optimistic UI changes roll back on failure while retaining the user's editable values.

## Phase 3: Tool Presentation

Tool calls use subtle inline disclosure rows rather than enclosing activity cards.

Each collapsed row shows:

- A disclosure chevron and restrained icon.
- Human-readable tool name.
- The most meaningful target or operation summary.
- Muted status, duration, exit state, or compact change counts.

Rows use hover background only. Status color is restrained and reserved for running, failure, or useful completion distinctions.

Built-in tools retain specialized expanded content:

- Read shows path and line range.
- Search shows query, scope, and result count.
- Shell shows command, working directory, output, and exit state.
- Edit/apply-patch shows affected files, additions/deletions, and diff.
- Task links to its child session.
- PTY shows lifecycle state and an `Open terminal` action.

MCP and plugin tools use the same row structure. Their fallback derives a readable server/tool name, summarizes safe scalar arguments, and exposes structured input/output beneath the row. Unknown tools remain fully inspectable without custom registrations.

The component structure follows the useful AI Elements separation of header, collapsible content, input, and output, but reuses OpenCode's Solid components and does not add a React dependency.

## Phase 4: Native Persistent Agent PTYs

### Agent tools

The fork adds native `pty_spawn`, `pty_read`, `pty_write`, and `pty_kill` tools backed by the existing location-scoped `Pty.Service`.

PTY creation records:

- Owning session ID.
- Originating message/tool-call ID.
- Title and agent-provided description.
- Working directory and command metadata, available only through the authorized PTY contracts.
- Creation, completion, and exit state timestamps.

Ordinary one-shot shell calls remain normal tool calls and do not become PTYs.

### Read-only viewer

The active session inspector lists its PTYs. Selecting one opens output in the existing resizable main side panel.

The browser uses an authenticated read-only output endpoint with cursor-based incremental polling while the process runs. It receives no input-capable socket or terminal controls. Agents interact through `pty_write`.

Exited output remains readable within existing retention limits. Current limits remain the baseline: capped output retention and a bounded exited-session inventory.

`Persistent` means the process survives tool calls, chat turns, and browser navigation while the OpenCode server process remains alive. Recovery across server restarts is out of scope.

### Security

PTY output, arguments, and working directories can contain secrets. Observation requires normal server authorization and matching location/session access. The read route never returns process environment variables.

## Phase 5: Permanent Local Usage Analytics

### Durable facts

Analytics stores two deletion-independent fact sets without cascading session foreign keys:

- One row per completed assistant message, keyed by message ID, with UTC day, captured project/session IDs and labels, provider/model, estimated cost, and input/output/reasoning/cache token categories.
- One row per completed tool part, keyed by part ID, with UTC day, captured project/session IDs and labels, tool name, outcome, and duration.

Writes occur at existing durable projection boundaries. Upserts make retries idempotent. Deleting a session does not delete analytics.

A one-time best-effort backfill scans retained messages and tool parts and then records completion. Missing or malformed historical entries are skipped and reported instead of blocking startup.

Dashboard labels use current project/session names while those records exist and fall back to the captured historical labels after deletion. Tool calls without complete timing data remain countable but are excluded from duration statistics.

Daily and dimensional summaries are computed from fact rows through a read-only aggregate API. No speculative pre-aggregation table is introduced initially.

### Dashboard

Usage opens as a full main-pane route. Compact summaries in the sidebar or inspector link to it.

The dashboard combines visual overview and dense analysis:

- Global date, project, and model filters.
- KPI cards for tokens, estimated cost, tool calls, success rate, sessions, and projects.
- Daily token and estimated-cost trends.
- Provider/model breakdown.
- Tool failure and duration summaries.
- A rich server-backed breakdown datagrid.

The datagrid supports:

- Sortable and filterable columns.
- Resizable and hideable columns.
- Grouping by project, provider, model, or tool.
- Expandable drill-down into sessions or calls.
- Pinned identity columns.
- Server-backed pagination.
- Browser-local persistence of grid view state.

CSV export is out of scope for the first release.

Stored cost is labeled `Estimated cost` because it uses OpenCode model pricing and is not provider billing reconciliation. Analytics never stores prompts, tool inputs, or tool output.

## Phase 6: Codex Plan Usage

A fork-owned server adapter reuses the existing OpenAI Codex OAuth refresh and ChatGPT account ID handling. It calls the current ChatGPT Codex `/backend-api/wham/usage` endpoint server-side and normalizes:

- Plan type.
- Primary and secondary usage windows.
- Usage percentages and reset times.
- Available credits when provided.

The adapter caches briefly and returns one of `supported`, `unavailable`, or `error`. OAuth tokens, JWT claims, and raw provider payloads never reach the browser.

The sidebar shows a compact remaining/reset summary. Hovering its inspector icon previews details; clicking pins the detail view and exposes manual refresh.

The current ChatGPT Codex usage endpoint is private and may change without notice. Parsing remains isolated behind this adapter, and failures never affect local analytics, authentication, or model execution.

## Data And Error Flow

### Session navigation

The sidebar reads existing project/session stores, requests additional pages only for expansion or search, and activates the existing tab state before navigation. A failed page request leaves already-loaded rows usable and provides an inline retry.

### Config mutation

The client submits a scoped narrow mutation. The server validates, patches the latest config representation while preserving unrelated keys, writes it, and emits or returns reload state. The client commits optimistic state only after success.

### Analytics

Durable message and part projection upserts analytics facts. The dashboard requests server-side filtered aggregates and paginated datagrid rows. Backfill progress and skipped-row counts are observable but do not block chat startup.

### Provider quota

The server refreshes credentials, calls the private provider endpoint, normalizes the response, and caches it. UI panels render the normalized state and remain isolated from provider errors.

## Accessibility, Responsive Design, And RTL

- All disclosure rows, inspector icons, sidebar items, and settings controls support keyboard navigation and visible focus.
- Tool and inspector status does not rely on color alone.
- Auto-permission exposes an accessible pressed state and warning label.
- Mobile uses the existing sidebar drawer behavior and opens inspector content as an overlay/drawer.
- Logical CSS properties (`start`, `end`, and inline borders/insets) are required.
- Paths, commands, code, diffs, terminal output, URLs, and provider/model IDs render LTR inside RTL UI.
- The rich datagrid pins its identity column to inline start and supports horizontal scrolling in either direction.

## Verification

### Frontend

- Pure tests for project grouping, five-row limits, expansion, search, status summaries, and generic tool labels.
- Component/browser tests for session navigation, new-session project selection, sidebar density, folding, auto-permission, inspector hover/pin, management errors, and PTY opening.
- Keyboard, mobile viewport, and RTL coverage for the shell, inspector, tools, settings, and datagrid.
- Existing session/tab lifecycle and production timeline benchmarks before and after shell/tool changes.

### Core and server

- PTY ownership, process-lifetime persistence, incremental reads, exited output, retention, authorization, and redaction.
- Analytics idempotency, retry updates, backfill, malformed history, session deletion survival, dimensions, filtering, grouping, and pagination.
- MCP/plugin/config scope, secret redaction, validation, preservation of unknown keys, reload behavior, and rollback failures.
- Codex normalization, cache, credential refresh, unsupported accounts, malformed provider responses, and provider failures.

### Generated clients

After public Protocol or Server `HttpApi` changes, run `bun run generate` from `packages/client`. Do not edit generated client sources directly. Run package-local type checks and focused tests for every changed package.

## Rollout And Planning Boundaries

The phases are ordered to deliver the defining UX before adding new durable server behavior:

1. Unified navigation shell.
2. Prompt control and guided management.
3. Tool presentation.
4. Native persistent PTYs.
5. Permanent local analytics.
6. Codex quota adapter.

Each phase receives its own implementation plan and can ship without placeholder controls for later phases. The first plan covers Phase 1 only.

## Explicit Non-Goals

- Maintaining both titlebar-tab and sidebar session navigation modes.
- Replacing the internal tab lifecycle or session stores.
- Electron-only core behavior.
- Turning every one-shot shell command into a PTY.
- PTY recovery after server restart.
- Provider invoice reconciliation.
- Persisting prompts or tool output in analytics.
- Plugin marketplace/catalog or source authoring.
- Full schema-generated config editor.
- First-release CSV export.
- Making Codex quota availability a requirement for chat.
