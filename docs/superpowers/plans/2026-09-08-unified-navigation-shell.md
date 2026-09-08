# Unified Navigation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace visible V2 session tabs and the dashboard-first flow with a project-grouped session sidebar, draft-backed new-session view, density setting, and contextual review/files inspector without changing internal tab lifecycle.

**Architecture:** Add a pure sidebar grouping model and fork-owned V2 sidebar/inspector components, then mount them through narrow changes in `layout-new.tsx`, `titlebar.tsx`, `home.tsx`, and `session.tsx`. Reuse the existing global session index, project/session stores, tab context, draft promotion, side panel, settings persistence, and responsive state; no backend or generated-client change is required.

**Tech Stack:** TypeScript, SolidJS, Solid Router, TanStack Solid Query, Tailwind CSS, Kobalte HoverCard, Bun test, Playwright.

## Global Constraints

- Implement Phase 1 only. Do not add disabled quota, MCP, usage, or PTY inspector icons.
- Target the active V2 shell in `packages/app/src/pages/layout-new.tsx`; do not extend the legacy `packages/app/src/pages/layout.tsx` shell.
- Keep `packages/app/src/context/tabs.tsx` and `TabsProvider` behavior unchanged. Sidebar navigation must call existing tab actions.
- Browser behavior is authoritative; desktop inherits the same frontend and must not require new Electron IPC.
- Show five recent unarchived root sessions per collapsed group. Put sessions with no known project in the `chats` group, expand groups inline, and search beyond the first five.
- `Comfortable` is the default 300 px sidebar; `Compact` is 252 px. Density does not hide status or controls.
- Treat a draft-backed `/new-session` route as “no selected real session”; do not create a second composer implementation.
- Use existing translated copy wherever it matches. Any new visible or accessible copy must be added to every app locale and pass `src/i18n/parity.test.ts`; never hardcode English in production components.
- Use logical inline CSS properties/classes, `<bdi dir="auto">` for user-controlled names, and LTR isolation for paths.
- Before changing session navigation or timeline integration, record the production benchmark baseline and compare it after the final task.
- Follow TDD: observe each focused test fail before adding its implementation.

---

### Task 1: Add The Pure Sidebar Grouping Model

**Files:**
- Create: `packages/app/src/pages/layout/unified-sidebar-model.ts`
- Create: `packages/app/src/pages/layout/unified-sidebar-model.test.ts`
- Reuse unchanged: `packages/app/src/pages/layout/helpers.ts:12-24,49-50,96-108`

**Interfaces:**
- Consumes: `LocalProject` from `@/context/layout`, `Session` from `@opencode-ai/sdk/v2/client`, and existing `compareSessionTime`, `displayName`, and `projectForSession` helpers.
- Produces: `UnifiedSidebarGroup` and `groupSidebarSessions(input)`, consumed by the controller and view in Task 3.

- [ ] **Step 1: Record the pre-change production benchmark baseline**

Run from `packages/app`:

```bash
bun run test:bench 2>&1 | tee /tmp/opencode-plus-unified-shell-baseline.txt
```

Expected: the benchmark suite exits 0 and emits `BENCHMARK` records. Keep `/tmp/opencode-plus-unified-shell-baseline.txt` for Task 7; do not commit it.

- [ ] **Step 2: Write the failing grouping tests**

Create `src/pages/layout/unified-sidebar-model.test.ts` with fixture builders and these complete cases:

```ts
import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import { groupSidebarSessions } from "./unified-sidebar-model"

const project = (worktree: string, id: string): LocalProject => ({ id, worktree, expanded: false })
const session = (input: {
  id: string
  projectID?: string
  directory?: string
  updated: number
  parentID?: string
  archived?: number
  title?: string
}): Session =>
  ({
    id: input.id,
    slug: input.id,
    projectID: input.projectID ?? "unknown",
    directory: input.directory ?? "/unknown",
    title: input.title ?? input.id,
    version: "test",
    parentID: input.parentID,
    time: { created: input.updated, updated: input.updated, archived: input.archived },
  }) as Session

describe("groupSidebarSessions", () => {
  const projects = [project("/alpha", "alpha"), project("/beta", "beta")]
  const sessions = [
    ...Array.from({ length: 7 }, (_, index) =>
      session({ id: `alpha-${index}`, projectID: "alpha", directory: "/alpha", updated: 20 - index }),
    ),
    session({ id: "beta-root", projectID: "beta", directory: "/beta", updated: 30 }),
    session({ id: "beta-child", projectID: "beta", directory: "/beta", updated: 31, parentID: "beta-root" }),
    session({ id: "archived", projectID: "beta", directory: "/beta", updated: 32, archived: 33 }),
    session({ id: "loose", directory: "/loose", updated: 40, title: "Loose research" }),
  ]

  test("groups projects and unmatched chats with five collapsed roots", () => {
    const groups = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "" })
    expect(groups.map((group) => group.key)).toEqual(["chats", "/alpha", "/beta"])
    expect(groups[0]?.sessions.map((item) => item.id)).toEqual(["loose"])
    expect(groups[1]?.sessions).toHaveLength(5)
    expect(groups[1]?.total).toBe(7)
    expect(groups[2]?.sessions.map((item) => item.id)).toEqual(["beta-root"])
  })

  test("expanded groups return every loaded root", () => {
    const groups = groupSidebarSessions({ projects, sessions, expanded: new Set(["/alpha"]), query: "" })
    expect(groups.find((group) => group.key === "/alpha")?.sessions).toHaveLength(7)
  })

  test("search ignores the collapsed limit and matches project or session title", () => {
    const byProject = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "alpha" })
    expect(byProject.find((group) => group.key === "/alpha")?.sessions).toHaveLength(7)
    const byTitle = groupSidebarSessions({ projects, sessions, expanded: new Set(), query: "research" })
    expect(byTitle.flatMap((group) => group.sessions).map((item) => item.id)).toEqual(["loose"])
  })

  test("uses directory and sandbox fallbacks when project ids are unavailable", () => {
    const sandbox = { ...projects[0]!, sandboxes: ["/alpha-worktree"] }
    const groups = groupSidebarSessions({
      projects: [sandbox, projects[1]!],
      sessions: [session({ id: "sandbox", directory: "/alpha-worktree", updated: 1 })],
      expanded: new Set(),
      query: "",
    })
    expect(groups.find((group) => group.key === "/alpha")?.sessions[0]?.id).toBe("sandbox")
  })

  test("uses id as a deterministic tie breaker", () => {
    const groups = groupSidebarSessions({
      projects,
      sessions: [
        session({ id: "b", projectID: "alpha", directory: "/alpha", updated: 1 }),
        session({ id: "a", projectID: "alpha", directory: "/alpha", updated: 1 }),
      ],
      expanded: new Set(),
      query: "",
    })
    expect(groups.find((group) => group.key === "/alpha")?.sessions.map((item) => item.id)).toEqual(["a", "b"])
  })
})
```

- [ ] **Step 3: Run the model test to verify it fails**

Run from `packages/app`:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/layout/unified-sidebar-model.test.ts
```

Expected: FAIL because `./unified-sidebar-model` does not exist.

- [ ] **Step 4: Implement the minimal grouping model**

Create `src/pages/layout/unified-sidebar-model.ts`:

```ts
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import { compareSessionTime, displayName, projectForSession } from "./helpers"

export type UnifiedSidebarGroup = {
  key: string
  project?: LocalProject
  sessions: Session[]
  total: number
}

export function groupSidebarSessions(input: {
  projects: LocalProject[]
  sessions: Session[]
  expanded: ReadonlySet<string>
  query: string
  limit?: number
}) {
  const limit = input.limit ?? 5
  const query = input.query.trim().toLocaleLowerCase()
  const roots = input.sessions
    .filter((session) => !session.parentID && typeof session.time.archived !== "number")
    .toSorted(compareSessionTime)
  const matched = new Set<string>()

  const projects = input.projects.map((project) => {
    const all = roots.filter((session) => {
      if (projectForSession(session, input.projects) !== project) return false
      matched.add(session.id)
      return true
    })
    const filtered = query
      ? displayName(project).toLocaleLowerCase().includes(query)
        ? all
        : all.filter((session) => session.title.toLocaleLowerCase().includes(query))
      : all
    return {
      key: project.worktree,
      project,
      sessions: query || input.expanded.has(project.worktree) ? filtered : filtered.slice(0, limit),
      total: filtered.length,
    } satisfies UnifiedSidebarGroup
  })

  const allChats = roots.filter((session) => !matched.has(session.id))
  const chats = query
    ? allChats.filter((session) => session.title.toLocaleLowerCase().includes(query))
    : allChats
  const result = [
    {
      key: "chats",
      sessions: query || input.expanded.has("chats") ? chats : chats.slice(0, limit),
      total: chats.length,
    } satisfies UnifiedSidebarGroup,
    ...projects,
  ]
  return query ? result.filter((group) => group.sessions.length > 0) : result
}
```

- [ ] **Step 5: Run the focused model test**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/layout/unified-sidebar-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the model**

```bash
git add packages/app/src/pages/layout/unified-sidebar-model.ts packages/app/src/pages/layout/unified-sidebar-model.test.ts
git commit -m "feat(app): model unified session sidebar"
```

### Task 2: Persist Sidebar Density In Appearance Settings

**Files:**
- Modify: `packages/app/src/context/settings.tsx:22-55,183-204,461-478`
- Modify: `packages/app/src/context/settings.test.ts`
- Modify: `packages/app/src/components/settings-v2/general-controllers.ts:75-113`
- Modify: `packages/app/src/components/settings-v2/general.tsx:122-176`

**Interfaces:**
- Produces: `settings.appearance.sidebarDensity(): "comfortable" | "compact"` and `settings.appearance.setSidebarDensity(value)` for Tasks 3 and 4.
- Preserves: the existing `settings.v3` persistence key and fallback behavior for older stored settings.

- [ ] **Step 1: Add a failing density normalization test**

Exported normalization keeps old or malformed persisted settings safe without mounting the provider. Extend `src/context/settings.test.ts`:

```ts
import { sidebarDensity } from "./settings"

test("normalizes sidebar density", () => {
  expect(sidebarDensity(undefined)).toBe("comfortable")
  expect(sidebarDensity("comfortable")).toBe("comfortable")
  expect(sidebarDensity("compact")).toBe("compact")
  expect(sidebarDensity("wide")).toBe("comfortable")
})
```

- [ ] **Step 2: Run the settings tests to verify they fail**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/context/settings.test.ts
```

Expected: FAIL because `sidebarDensity` is absent.

- [ ] **Step 3: Add the persisted setting and controller interface**

Add the normalizer near the exported settings helpers:

```ts
export type SidebarDensity = "comfortable" | "compact"

export function sidebarDensity(value: unknown): SidebarDensity {
  return value === "compact" ? "compact" : "comfortable"
}
```

Add to `Settings.appearance` and `defaultSettings.appearance`:

```ts
sidebarDensity: SidebarDensity
```

```ts
sidebarDensity: "comfortable",
```

Expose it beside the existing font settings:

```ts
sidebarDensity: withFallback(
  () => sidebarDensity(store.appearance?.sidebarDensity),
  defaultSettings.appearance.sidebarDensity,
),
setSidebarDensity(value: SidebarDensity) {
  setStore("appearance", "sidebarDensity", value)
},
```

Extend `createAppearanceSettingsController()`:

```ts
density: {
  options: ["comfortable", "compact"] as const,
  current: settings.appearance.sidebarDensity,
  select: settings.appearance.setSidebarDensity,
},
```

- [ ] **Step 4: Add the Appearance selector without new copy**

Add one `SettingsRowV2` after the theme row. Reuse the existing localized Appearance copy and use universal width labels, avoiding a new 63-locale translation change:

```tsx
<SettingsRowV2
  title={language.t("sidebar.nav.projectsAndSessions")}
  description={language.t("settings.general.row.appearance.description")}
>
  <SelectV2
    appearance="inline"
    data-action="settings-sidebar-density"
    options={props.controller.density.options}
    current={props.controller.density.current()}
    placement="bottom-end"
    gutter={6}
    label={(option) => (option === "comfortable" ? "300 px" : "252 px")}
    onSelect={(option) => option && props.controller.density.select(option)}
  />
</SettingsRowV2>
```

The labels are measurements, not untranslated prose. The selected value still persists as `comfortable` or `compact`.

- [ ] **Step 5: Run focused settings and parity tests**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/context/settings.test.ts ./src/i18n/parity.test.ts
```

Expected: PASS; no locale dictionary changes are required.

- [ ] **Step 6: Commit the density setting**

```bash
git add packages/app/src/context/settings.tsx packages/app/src/context/settings.test.ts packages/app/src/components/settings-v2/general-controllers.ts packages/app/src/components/settings-v2/general.tsx
git commit -m "feat(app): add sidebar density setting"
```

### Task 3: Build The Unified Sidebar Controller And View

**Files:**
- Create: `packages/app/src/pages/layout/unified-sidebar-controller.tsx`
- Create: `packages/app/src/pages/layout/unified-sidebar.tsx`
- Modify: `packages/app/src/pages/layout/sidebar-items.tsx:76-143,146-279`
- Reuse unchanged: `packages/app/src/context/global-sync/home-session-index.ts`
- Reuse unchanged: `packages/app/src/pages/home/home-controller.ts`
- Reuse unchanged: `packages/app/src/pages/home-session-archive.ts`

**Interfaces:**
- Consumes: `groupSidebarSessions`, `useTabs`, `createHomeController`, the selected server's existing home session index cache, and `SessionItem` status/archive/prefetch behavior.
- Produces: `createUnifiedSidebarController()` and `<UnifiedSidebar controller density mobile onClose />`, mounted by Task 4.

- [ ] **Step 1: Make `SessionItem` support direct V2 selection**

Extend `SessionItemProps`:

```ts
href?: string
onSelect?: (session: Session) => void
```

Pass both into `SessionRow`, use `props.href ?? \`/${props.slug}/session/${props.session.id}\`` for the anchor, and intercept selection only when supplied:

```tsx
onClick={(event) => {
  if (props.onSelect) {
    event.preventDefault()
    props.onSelect(props.session)
  }
  if (props.sidebarOpened()) return
  props.clearHoverProjectSoon()
}}
```

While touching the row, replace physical `text-left`, `pr-3`, `padding-left`, and `right-px` styling with logical equivalents and wrap the title:

```tsx
<span class="text-14-regular text-text-strong min-w-0 flex-1 truncate">
  <bdi dir="auto">{title()}</bdi>
</span>
```

- [ ] **Step 2: Implement the controller over the existing session index cache**

In `unified-sidebar-controller.tsx`, copy only the query wiring from `createHomeSessionsController`: call `loadHomeSessionIndex((input, options) => ctx.sdk.client.v2.session.list(input, options), ...)`, and read updates through `ctx.sync.homeSessions`. Do not create another cache key.

Export this exact public type and return it from `createUnifiedSidebarController()`:

```ts
export type UnifiedSidebarController = {
  groups: Accessor<UnifiedSidebarGroup[]>
  loading: Accessor<boolean>
  query: Accessor<string>
  setQuery(value: string): void
  expanded(key: string): boolean
  toggle(key: string): void
  open(session: Session): void
  archive(session: Session): Promise<void>
  prefetch(session: Session, priority?: "high" | "low"): void
  newSession(): void
}

export function createUnifiedSidebarController(): UnifiedSidebarController
```

Use one `createStore({ query: "", expanded: {} as Record<string, boolean> })`. Build groups with:

```ts
const groups = createMemo(() =>
  groupSidebarSessions({
    projects: home.project.list(),
    sessions: homeSessions().sessions(sessionLoad.data, sessionEventLoad.data),
    expanded: new Set(Object.keys(state.expanded).filter((key) => state.expanded[key])),
    query: state.query,
  }),
)
```

`open(session)` must use the proven V2 sequence from `createHomeSessionsController`:

```ts
const project = projectForSession(session, home.project.list())
const conn = home.server.focused()
const ctx = home.server.focusedContext()
if (!conn || !ctx) return
const directory = project?.worktree ?? session.directory
ctx.projects.open(directory)
ctx.projects.touch(directory)
void startTransition(() => {
  const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
  tabs.select(tab)
})
```

`newSession()` calls `tabs.newDraft` with the focused server and `home.project.newSession()?.worktree ?? home.project.homedir()`. Return without mutation until both values exist.

Reuse `archiveHomeSession` and the existing `showToast(errorMessage(...))` failure behavior. Prefetch through the selected server sync's existing `session.sync(session.id)` path; do not fetch message history for every visible row.

- [ ] **Step 3: Implement the grouped sidebar view**

In `unified-sidebar.tsx`, export:

```ts
export function UnifiedSidebar(props: {
  controller: ReturnType<typeof createUnifiedSidebarController>
  density: "comfortable" | "compact"
  mobile?: boolean
  onClose: () => void
}): JSX.Element
```

Render one `<aside>` with:

```tsx
<aside
  data-component="unified-sidebar"
  class="h-full min-h-0 flex flex-col border-e border-v2-border-weak-base bg-v2-background-bg-base"
  style={{ width: props.density === "compact" ? "252px" : "300px" }}
>
  <button data-action="sidebar-new-session" onClick={props.controller.newSession}>
    {language.t("command.session.new")}
  </button>
  <input
    type="search"
    value={props.controller.query()}
    placeholder={language.t("home.sessions.search.placeholder")}
    onInput={(event) => props.controller.setQuery(event.currentTarget.value)}
  />
  <nav aria-label={language.t("sidebar.nav.projectsAndSessions")} class="min-h-0 flex-1 overflow-y-auto">
    <For each={props.controller.groups()}>{(group) => renderGroup(group)}</For>
  </nav>
</aside>
```

`renderGroup` uses `displayName(group.project)` or the existing localized `home.sessions.search.sessions` value for the virtual chats group, wraps names in `<bdi dir="auto">`, renders existing `SessionItem`, and shows `sidebar.project.viewAllSessions` only when `group.total > group.sessions.length`. The collapse action uses the same translated label and `aria-expanded`; do not add English copy.

For each `SessionItem`, pass `href={sessionHref(serverKey, session.id)}`, `onSelect={controller.open}`, existing archive/prefetch callbacks, `dense={props.density === "compact"}`, and `showChild`. Mobile selection calls `props.onClose()` after `controller.open(session)`.

- [ ] **Step 4: Run the model test and type check**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/layout/unified-sidebar-model.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the sidebar component**

```bash
git add packages/app/src/pages/layout/unified-sidebar-controller.tsx packages/app/src/pages/layout/unified-sidebar.tsx packages/app/src/pages/layout/sidebar-items.tsx
git commit -m "feat(app): add unified session sidebar"
```

### Task 4: Mount The Sidebar And Remove Visible Session Tabs

**Files:**
- Modify: `packages/app/src/pages/layout-new.tsx:1-49`
- Modify: `packages/app/src/components/titlebar.tsx:31,64-76,238-435`
- Preserve unchanged: `packages/app/src/components/titlebar-tab-strip.tsx`
- Preserve unchanged: `packages/app/src/context/tabs.tsx`
- Create: `packages/app/e2e/regression/unified-sidebar.spec.ts`
- Create: `packages/app/e2e/regression/hidden-session-tabs.spec.ts`

**Interfaces:**
- Consumes: `createUnifiedSidebarController`, `UnifiedSidebar`, sidebar density, `layout.sidebar`, `layout.mobileSidebar`, and existing tab commands/effects.
- Produces: the persistent desktop aside, mobile drawer, sidebar titlebar toggle, and no visible `TitlebarTabStrip`.

- [ ] **Step 1: Write failing shell regressions**

Create Playwright regressions that establish these exact contracts:

```ts
await expect(page.locator('[data-slot="titlebar-tabs"]')).toHaveCount(0)
await expect(page.locator('[data-component="unified-sidebar"]')).toBeVisible()
await page.locator('[data-session-id="session-b"]').click()
await expect(page).toHaveURL(/\/server\/[^/]+\/session\/session-b$/)
await expect(page.locator('[data-session-id="session-b"]')).toHaveClass(/active/)
```

In `hidden-session-tabs.spec.ts`, type a draft, switch through sidebar rows, return through the sidebar, and assert draft text survives. Then assert `mod+w` closes the internal active session and `mod+shift+t` reopens it even though no titlebar strip exists.

- [ ] **Step 2: Run the shell regressions to verify they fail**

Run from `packages/app`; the Playwright configuration starts its configured app and mock-server environment:

```bash
bun run test:e2e -- e2e/regression/unified-sidebar.spec.ts e2e/regression/hidden-session-tabs.spec.ts
```

Expected: FAIL because the V2 shell has no unified sidebar and still renders titlebar tabs.

- [ ] **Step 3: Mount desktop and mobile sidebar shells**

In `layout-new.tsx`, create the controller once and wrap the existing `<main>` in a flex row. Use existing layout state and fixed density widths:

```tsx
const layout = useLayout()
const settings = useSettings()
const sidebar = createUnifiedSidebarController()

<div class="flex-1 min-h-0 min-w-0 flex">
  <Show when={layout.sidebar.opened()}>
    <div class="hidden xl:block shrink-0">
      <UnifiedSidebar
        controller={sidebar}
        density={settings.appearance.sidebarDensity()}
        onClose={layout.sidebar.close}
      />
    </div>
  </Show>
  <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
    <Suspense>{props.children}</Suspense>
  </main>
</div>
```

Add a fixed mobile backdrop and inline-start drawer under `xl`, controlled by `layout.mobileSidebar.opened()`. The closed transform is `ltr:-translate-x-full rtl:translate-x-full`; the drawer contains the same `UnifiedSidebar` with `mobile` and `onClose={layout.mobileSidebar.hide}`. Apply `inert` while closed so hidden links are not focusable.

- [ ] **Step 4: Turn the V2 home button into the responsive sidebar toggle**

In `titlebar.tsx`, add:

```ts
const desktopSidebar = createMediaQuery("(min-width: 1280px)")
const toggleSidebar = () => (desktopSidebar() ? layout.sidebar.toggle() : layout.mobileSidebar.toggle())
```

Replace the V2 `grid-plus` home button with `menu`, translated `command.sidebar.toggle` copy, and the appropriate `aria-expanded`. Replace the V2 `titlebar-home` command registration with:

```ts
command.register("titlebar-sidebar", () => [
  {
    id: "sidebar.toggle",
    title: language.t("command.sidebar.toggle"),
    category: language.t("command.category.view"),
    keybind: "mod+b",
    hidden: true,
    onSelect: toggleSidebar,
  },
])
```

- [ ] **Step 5: Remove only visible V2 tab controls**

Delete the V2 `<TitlebarTabStrip ... />`, visible plus-button tooltip, `tabsAreOverflowing`, and now-unused `TitlebarTabStrip` import. Keep all route-to-tab reconciliation, `SESSION_TABS_REMOVED_EVENT`, `openNewTab`, and `tabs` command registration so `mod+t`, `mod+n`, `mod+w`, and `mod+shift+t` continue to work.

Do not delete `titlebar-tab-strip.tsx`; leaving the upstream component intact makes future merges smaller.

- [ ] **Step 6: Run shell, tab lifecycle, and type checks**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/context/tabs.test.ts ./src/components/titlebar-history.test.ts ./src/components/titlebar-session-events.test.ts
bun run test:e2e -- e2e/regression/unified-sidebar.spec.ts e2e/regression/hidden-session-tabs.spec.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the shell mount**

```bash
git add packages/app/src/pages/layout-new.tsx packages/app/src/components/titlebar.tsx packages/app/e2e/regression/unified-sidebar.spec.ts packages/app/e2e/regression/hidden-session-tabs.spec.ts
git commit -m "feat(app): replace visible session tabs"
```

### Task 5: Replace The Dashboard Route With The Existing Draft Composer

**Files:**
- Modify: `packages/app/src/pages/home.tsx:1-50`
- Reuse unchanged: `packages/app/src/pages/new-session.tsx`
- Reuse unchanged: `packages/app/src/pages/new-session/new-session-view.tsx`
- Reuse unchanged: `packages/app/src/pages/new-session/new-session-draft-controller.ts`
- Reuse unchanged: `packages/app/src/components/prompt-project-selector.tsx`
- Create: `packages/app/e2e/regression/new-session-shell.spec.ts`

**Interfaces:**
- Consumes: `createHomeController`, `useTabs().newDraft`, focused server, selected/default project, and server home directory.
- Produces: `/` immediately transitions into a durable draft-backed `/new-session?draftId=...` composer, including the no-project project-selection state.

- [ ] **Step 1: Write the failing no-session composer regression**

Create `e2e/regression/new-session-shell.spec.ts` and assert:

```ts
await page.goto("/")
await expect(page).toHaveURL(/\/new-session\?draftId=/)
await expect(page.locator('[data-action="prompt-project"]')).toBeVisible()
await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
await page.locator('[data-action="prompt-project"]').click()
await page.getByText("opencode-plus", { exact: true }).click()
await page.locator('[data-component="prompt-input"]').fill("Create the first session")
await page.keyboard.press("Enter")
await expect(page).toHaveURL(/\/server\/[^/]+\/session\//)
await expect(page.locator('[data-component="unified-sidebar"] [data-session-id]')).toContainText("Create the first session")
```

Build the page state with `mockOpenCodeServer` from `e2e/utils/mock-server` and seed `settings.v3`, the selected server/project, and tab storage using the exact pattern in `e2e/regression/new-session-panel-corner.spec.ts`.

- [ ] **Step 2: Run the regression to verify it fails**

Run:

```bash
bun run test:e2e -- e2e/regression/new-session-shell.spec.ts
```

Expected: FAIL because `/` renders `NewHome`.

- [ ] **Step 3: Reduce `NewHome` to a one-shot draft redirect**

Replace dashboard controller/view composition in `home.tsx` with the existing home controller plus tab creation:

```tsx
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { createEffect } from "solid-js"
import { createHomeController } from "./home/home-controller"

export function NewHome() {
  const home = createHomeController()
  const tabs = useTabs()
  let opening = false

  createEffect(() => {
    if (opening || !tabs.ready()) return
    const conn = home.server.focused()
    const directory = home.project.newSession()?.worktree ?? home.project.homedir()
    if (!conn || !directory) return
    opening = true
    void tabs.newDraft({ server: ServerConnection.key(conn), directory })
  })

  return null
}
```

Do not mount `NewSessionView` here; the new draft route already provides the centered composer and promotion behavior.

- [ ] **Step 4: Run draft, route, and new-session regressions**

Run:

```bash
bun run test:e2e -- e2e/regression/new-session-shell.spec.ts e2e/regression/hidden-session-tabs.spec.ts
bun test --conditions=solid --preload ./happydom.ts ./src/context/tabs.test.ts
```

Expected: PASS. Closing the final real session returns to `/`, which creates a fresh draft instead of the old dashboard.

- [ ] **Step 5: Commit the route change**

```bash
git add packages/app/src/pages/home.tsx packages/app/e2e/regression/new-session-shell.spec.ts
git commit -m "feat(app): open composer as home"
```

### Task 6: Add The Contextual Review And Files Inspector

**Files:**
- Create: `packages/app/src/pages/session/contextual-inspector-state.ts`
- Create: `packages/app/src/pages/session/contextual-inspector-state.test.ts`
- Create: `packages/app/src/pages/session/contextual-inspector.tsx`
- Modify: `packages/app/src/pages/session.tsx:2249-2353`
- Reuse unchanged: `packages/app/src/pages/session/session-side-panel.tsx`
- Reuse unchanged: `packages/app/src/pages/session/v2/session-file-browser-tab.tsx`
- Create: `packages/app/e2e/regression/contextual-inspector.spec.ts`

**Interfaces:**
- Produces: `InspectorTool`, `InspectorState`, `updateInspector(state, event)`, and `<ContextualInspector />`.
- Consumes: existing `view().reviewPanel`, `layout.fileTree`, review count, file tree state, and `SessionSidePanel` rendering. Phase 1 exposes only `review` and `files`.

- [ ] **Step 1: Write the failing inspector state tests**

Create `contextual-inspector-state.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the state test to verify it fails**

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/session/contextual-inspector-state.test.ts
```

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the inspector reducer**

Create `contextual-inspector-state.ts`:

```ts
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
```

- [ ] **Step 4: Implement the rail and hover previews**

In `contextual-inspector.tsx`, use one `createStore<InspectorState>({})` and Kobalte `HoverCard`, following the existing portalled theme handling in `titlebar-tab-popover.tsx`. Export:

```ts
export function ContextualInspector(props: {
  review: { opened: () => boolean; count: () => number; open: () => void; close: () => void }
  files: { opened: () => boolean; count: () => number; open: () => void; close: () => void }
}): JSX.Element
```

Define exactly two item records inside the component. Use existing translated review/files labels and existing V2 icons. A hover preview renders only label, count, and open state; it never mounts full review or file content. On click, apply `updateInspector(..., { type: "toggle", tool })`, close the other panel, and open or close the selected existing panel. Use `createMediaQuery("(hover: hover)")`; non-hover input pins on activation.

Render the rail at inline end with `data-component="contextual-inspector"`, `aria-pressed`, tooltips, and no physical left/right classes. Synchronize the local `pinned` value to external panel closure with a small `createEffect`; do not duplicate panel width or content state.

- [ ] **Step 5: Mount the rail beside the existing V2 side panel**

In the V2 branch of `session.tsx`, append `<ContextualInspector>` after the existing panel container. Wire review to `view().reviewPanel.open/close` and files to `layout.fileTree.open/close`; opening one closes the other. Pass `reviewCount` and the loaded file count already available in the page. Do not modify `SessionSidePanel` rendering.

Keep the rail absent when `params.id` is missing and on the draft route. Future inspector items are added by their own phases.

- [ ] **Step 6: Add and run the inspector E2E regression**

Create `contextual-inspector.spec.ts` covering:

```ts
await reviewButton.hover()
await expect(page.locator('[data-component="contextual-inspector-preview"]')).toBeVisible()
await expect(sessionPanel).toHaveJSProperty("clientWidth", initialWidth)
await page.mouse.move(0, 0)
await expect(page.locator('[data-component="contextual-inspector-preview"]')).toHaveCount(0)
await reviewButton.click()
await expect(reviewButton).toHaveAttribute("aria-pressed", "true")
await expect(page.locator('[data-component="session-side-panel"]')).toBeVisible()
await reviewButton.click()
await expect(reviewButton).toHaveAttribute("aria-pressed", "false")
```

Add keyboard activation and a touch-emulated project where the first tap pins without preview.

Run:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/session/contextual-inspector-state.test.ts
bun run test:e2e -- e2e/regression/contextual-inspector.spec.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the inspector**

```bash
git add packages/app/src/pages/session/contextual-inspector-state.ts packages/app/src/pages/session/contextual-inspector-state.test.ts packages/app/src/pages/session/contextual-inspector.tsx packages/app/src/pages/session.tsx packages/app/e2e/regression/contextual-inspector.spec.ts
git commit -m "feat(app): add contextual session inspector"
```

### Task 7: Complete Responsive, RTL, Regression, And Performance Coverage

**Files:**
- Create: `packages/app/e2e/regression/unified-shell-rtl.spec.ts`
- Modify: `packages/app/e2e/performance/timeline/session-tab-switch-benchmark.spec.ts`
- Modify: `packages/app/e2e/performance/timeline/home-tab-navigation-benchmark.spec.ts`
- Verify unchanged: `packages/app/e2e/performance/timeline/review-pane-scaling-benchmark.spec.ts`
- Verify unchanged: `packages/app/e2e/performance/timeline-stability/`

**Interfaces:**
- Consumes: completed sidebar, draft route, titlebar, and inspector contracts.
- Produces: final Phase 1 regression and benchmark evidence.

- [ ] **Step 1: Write the RTL and responsive regression**

Create `unified-shell-rtl.spec.ts` with desktop, mobile, and forced-RTL projects. Assert:

- Desktop sidebar width is exactly 300 px in comfortable mode and 252 px in compact mode.
- The titlebar toggle removes the desktop sidebar from focus navigation and restores it.
- Mobile drawer enters from inline start in LTR and RTL and closes after selection or backdrop click.
- Inspector rail is at inline end and its pinned panel does not reverse DOM/focus order.
- Mixed Arabic/English project and session names render in `<bdi dir="auto">`.
- Any displayed path retains `dir="ltr"`.

Use bounding-box comparisons rather than physical class names so the same assertions cover both directions.

- [ ] **Step 2: Run the RTL regression to verify any remaining failures**

Run:

```bash
bun run test:e2e -- e2e/regression/unified-shell-rtl.spec.ts
```

Expected before final cleanup: FAIL on any missed logical property, focusability, or drawer direction. If it passes immediately, retain it as regression evidence.

- [ ] **Step 3: Fix only failures exposed by the RTL/responsive test**

Apply these required patterns in new shell code:

```tsx
class="border-e ps-2 pe-3 text-start"
style={{ "inset-inline-start": "0", "inline-size": sidebarWidth() }}
classList={{ "ltr:-translate-x-full rtl:translate-x-full": !layout.mobileSidebar.opened() }}
```

Use `inert={!opened() ? true : undefined}` for hidden navigation. Do not use `row-reverse`, `left-*`, `right-*`, `pl-*`, `pr-*`, or sticky-left/sticky-right in the new components.

- [ ] **Step 4: Retarget existing navigation benchmarks**

In `session-tab-switch-benchmark.spec.ts`, change only the interaction helper from titlebar-tab selection to `[data-component="unified-sidebar"] [data-session-id="..."]`; preserve cold/hot and review-open/review-closed measurements.

In `home-tab-navigation-benchmark.spec.ts`, replace home/titlebar milestones with sidebar-row interaction, destination timeline paint, and active sidebar state. Replace “close only tab paints home” with “close selected session paints the new draft composer.” Do not add machine-dependent timing thresholds; preserve emitted `BENCHMARK` medians and completion assertions.

- [ ] **Step 5: Run all focused Phase 1 verification**

Run from `packages/app`:

```bash
bun test --conditions=solid --preload ./happydom.ts ./src/pages/layout/unified-sidebar-model.test.ts ./src/pages/session/contextual-inspector-state.test.ts ./src/context/settings.test.ts ./src/context/tabs.test.ts ./src/i18n/parity.test.ts
bun run test:e2e -- e2e/regression/unified-sidebar.spec.ts e2e/regression/hidden-session-tabs.spec.ts e2e/regression/new-session-shell.spec.ts e2e/regression/contextual-inspector.spec.ts e2e/regression/unified-shell-rtl.spec.ts
bun typecheck
bun run build
bun run test:stability
```

Expected: every command exits 0.

- [ ] **Step 6: Run and compare production benchmarks**

Run:

```bash
bun run test:bench 2>&1 | tee /tmp/opencode-plus-unified-shell-after.txt
```

Expected: suite exits 0 and emits the same benchmark families as the baseline. Compare `BENCHMARK` medians in `/tmp/opencode-plus-unified-shell-baseline.txt` and `/tmp/opencode-plus-unified-shell-after.txt`; investigate any material session-switch or timeline regression before committing.

- [ ] **Step 7: Commit final coverage and benchmark retargeting**

```bash
git add packages/app/e2e/regression/unified-shell-rtl.spec.ts packages/app/e2e/performance/timeline/session-tab-switch-benchmark.spec.ts packages/app/e2e/performance/timeline/home-tab-navigation-benchmark.spec.ts packages/app/src/pages/layout/unified-sidebar.tsx packages/app/src/pages/session/contextual-inspector.tsx
git commit -m "test(app): cover unified navigation shell"
```

## Deferred To Later Roadmap Plans

- Prompt-bar auto-permission belongs to Phase 2.
- Guided MCP/plugin/config management belongs to Phase 2.
- Subtle built-in and custom tool rows belong to Phase 3.
- Native persistent PTY tools and viewer belong to Phase 4.
- Durable usage facts, dashboard, and rich datagrid belong to Phase 5.
- Codex quota adapter and inspector item belong to Phase 6.
- Server-side session search is deferred until the existing V2 full-index adapter becomes a measured bottleneck.
