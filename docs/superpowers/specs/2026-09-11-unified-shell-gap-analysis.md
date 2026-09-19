# Unified Navigation Shell: Spec vs. Shipped

Date: 2026-09-11. Sources: `specs/2026-09-08-web-ui-roadmap-design.md`, `plans/2026-09-08-unified-navigation-shell.md`, chosen brainstorm mockup `.superpowers/brainstorm/89762-1788876431/content/shell-density.html` (user clicked **comfortable**), `inspector-layout.html` (no recorded choice). Live check against `opencode web` on `localhost:4096` (binary built 2026-09-10 20:13, contains all Phase 1 commits).

Status: the alignment pass on 2026-09-11 fixed defects #1–#5 and shipped elapsed age, the brand row, and the footer. The changes are in the working tree and not yet committed.

## Why it drifted

1. The plan never references the mockups (0 mentions of brainstorm/mockup/visual). The visual design lived only in brainstorm HTML.
2. Plan Task 3 Step 3 prescribes a bare `<button>` and `<input type="search">` without classes. The implementation copied it verbatim.
3. The plan traded visible copy for zero i18n work:
   - density shows `300 px` / `252 px`
   - the chats group reuses the search heading `home.sessions.search.sessions`
   - the group toggle reuses `sidebar.project.viewAllSessions`
4. Verification was behavioral plus *relative* geometry (Task 7: "bounding-box comparisons"). Relative boxes pass for an element that sits outside the viewport, so the clipped rail shipped under "no confirmed runtime defects". No screenshot-vs-mockup review step existed.

## Defects

| # | Issue | Status |
| --- | --- | --- |
| 1 | Inspector rail clipped to ~1 px of its 37 px width until a panel was open. The chat panel was `shrink-0 md:flex-none` with `width: 100%`. | **Fixed.** The panel may now shrink (min-width 0) when no side panel is open (`session.tsx`). A new e2e test checks `rail.right <= 1280`: it failed at 1316 before the fix and passes after. Live: right edge at 1791 in an 1800 px window. |
| 2 | Sidebar closed by default, although it is the only visible session navigator. | **Fixed.** `context/layout.tsx` default is now `opened: true`. |
| 3 | Empty project groups rendered as headers with no rows. | **Fixed.** `groupSidebarSessions` now always drops groups with no sessions; covered by a model test. |
| 4 | Group chevron never reflected `expanded`; the header and the footer button shared the same label. | **Fixed.** The header is a plain label. **Caveat:** show-all is one-way; there is no collapse control without a new or reused i18n key. |
| 5 | No loading or empty state. | **Fixed.** Loading shows a skeleton; otherwise `home.sessions.empty` / `home.sessions.search.noResults`. There is still no inline retry on load failure. |
| 6 | Blank main pane from the user screenshot. | **Unresolved.** These all render: sidebar click, grouped (Radiance) click, and cold reload of the session route. The open sidebar is not the cause (`main` renders at 1148 ms with it open vs. 1174 ms closed). A fully black frame seen in dev was Vite's dependency re-optimization reload, which happens only in development. Needs the URL and whether a reload fixes it. |

## Visual gaps vs. chosen mockup (Comfortable)

| Mockup | Before | After alignment |
| --- | --- | --- |
| Sidebar brand row `≡ OpenCode+` | Missing | Brand row shipped (toggle stays in titlebar) |
| `New session`: filled rounded row, leading icon | Bare centered button | Shipped |
| Search: icon + muted placeholder | Bare `<input>` | Shipped |
| Group title: bold, colored project dot | Weak text + chevron | Shipped |
| Row: status, title, elapsed age | No elapsed | Elapsed age shipped (`getRelativeTime`, computed at render, does not tick). Rows still use V1 tokens from shared `SessionItem`. |
| `Show all 12` with count | No count | Still no count (i18n declined) |
| Footer: settings, keybinds, info | Missing | Shipped (settings dialog, shortcuts tab, help link) |
| New session: "What are we working on?" + picker above composer | Upstream wordmark, picker below | Unchanged (functionally meets spec) |

## Spec'd but not shipped (still open)

- **Inspector session summary and MCP/context status.** The spec lists them as rail items; the plan restricted Phase 1 to review/files and assigned them to no phase. The user deferred them on 2026-09-11.
- **Hover summary card** (mockup A: context %, quota, MCP n/n, PTY, tools). The preview shows only label, count, open/closed. Deferred with the above.
- **Pinned summary in right sidebar.** Pin opens the full review/file side panel instead.
- **Rail on new-session view** (mockup shows it; the plan removes it on the draft route).
- **Density names** `Comfortable` / `Compact`, the `chats` label, and show-all counts. The user declined new i18n keys for this pass.
- **Show-all pagination.** The full index is loaded client-side; this deviation is not recorded in the spec.

## Process follow-up

Future UI plans should link the chosen mockup and include a screenshot comparison step per UI task. Geometry tests must assert viewport containment, not only relative positions.
