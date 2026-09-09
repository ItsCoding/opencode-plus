# Visible Fork Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `OpenCode+` at every application-identity surface in the TUI, web UI, and desktop shell.

**Architecture:** Change existing display literals and title strings only. The desktop native-menu bundle will force its app-menu label to `OpenCode+`, preserving the existing locale bundles and excluding prose such as OpenCode Zen.

**Tech Stack:** TypeScript, SolidJS, OpenTUI, Electron, Bun test.

## Global Constraints

- Render the product name as exactly `OpenCode+`.
- Do not change API names, CLI commands, URLs, source identifiers, comments, tests unrelated to branding, legal or marketing copy, or sub-brands such as OpenCode Zen and OpenCode Go.
- Do not create a general branding abstraction; retain the existing presentation boundaries.

---

### Task 1: Mark the TUI Welcome Screen and Titles

**Files:**
- Modify: `packages/tui/src/logo.ts:1-4`
- Modify: `packages/tui/src/app.tsx:452-475`
- Create: `packages/tui/test/logo.test.ts`

**Interfaces:**
- Consumes: `logo.right`, the four text rows rendered by `packages/tui/src/component/logo.tsx`.
- Produces: A visible `+` glyph in the welcome logo and `OpenCode+`/`OC+` terminal titles.

- [ ] **Step 1: Write the failing welcome-logo test**

```ts
import { expect, test } from "bun:test"
import { logo } from "../src/logo"

test("marks the TUI welcome logo as the fork", () => {
  expect(logo.right).toEqual([
    "                  ",
    "█▀▀▀ █▀▀█ █▀▀█ █▀▀█   ▄",
    "█___ █__█ █__█ █^^^ █▄▄▄",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀   ▀",
  ])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test test/logo.test.ts`

Expected: FAIL because the current logo has no fork marker.

- [ ] **Step 3: Add the `+` glyph and update title prefixes**

```ts
export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["                  ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█   ▄", "█___ █__█ █__█ █^^^ █▄▄▄", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀   ▀"],
}
```

Replace the two home/default calls to `renderer.setTerminalTitle("OpenCode")` with `renderer.setTerminalTitle("OpenCode+")`. Replace the session and plugin prefixes from `OC |` to `OC+ |`.

- [ ] **Step 4: Run the focused test and type check**

Run: `bun test test/logo.test.ts && bun typecheck`

Expected: PASS with no type errors.

- [ ] **Step 5: Commit the TUI change**

```bash
git add packages/tui/src/app.tsx packages/tui/src/logo.ts packages/tui/test/logo.test.ts
git commit -m "feat(tui): mark fork branding"
```

### Task 2: Mark Web and Desktop Application Names

**Files:**
- Modify: `packages/app/index.html:9`
- Modify: `packages/app/src/components/windows-app-menu.tsx:82`
- Modify: `packages/app/src/i18n/desktop-native.ts:224-338`
- Modify: `packages/desktop/src/main/index.ts:53-57,141`
- Modify: `packages/desktop/src/main/windows.ts:176-184`
- Modify: `packages/desktop/src/renderer/index.html:6`
- Modify: `packages/app/src/i18n/desktop-native.test.ts:83-107`

**Interfaces:**
- Consumes: `createDesktopNativeBundle(locale, translate)`, which supplies labels to Electron's native app menu.
- Produces: `OpenCode+` browser titles, Windows app-menu heading, Electron app/window names, and native macOS app-menu label in every locale.

- [ ] **Step 1: Write the failing native-menu branding test**

Add `DESKTOP_NATIVE_LOCALES` to the existing import from `./desktop-native`, then add this test:

```ts
test("uses the fork marker for the native app menu in every locale", () => {
  for (const locale of DESKTOP_NATIVE_LOCALES) {
    expect(createDesktopNativeBundle(locale, () => "OpenCode").messages["desktop.menu.app"]).toBe("OpenCode+")
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test --conditions=solid --preload ./happydom.ts ./src/i18n/desktop-native.test.ts`

Expected: FAIL because `createDesktopNativeBundle` currently preserves the translated app-name value.

- [ ] **Step 3: Make only product-identity labels show `OpenCode+`**

Set the HTML titles and the Windows menu group label to `OpenCode+`. Set all `APP_NAMES` values to `OpenCode+ Dev`, `OpenCode+ Beta`, and `OpenCode+`; use `OpenCode+ Dev` for the unpackaged Electron name; and set the `BrowserWindow` title to `OpenCode+`.

Set the English native-menu default to `OpenCode+`, and special-case only `desktop.menu.app` while assembling the native bundle:

```ts
messages: Object.fromEntries(
  DESKTOP_NATIVE_KEYS.map((key) => [key, key === "desktop.menu.app" ? "OpenCode+" : translate(key)]),
) as DesktopNativeMessages,
```

This leaves all locale-specific prose and sub-brand text unchanged while keeping the macOS application menu branded in every supported locale.

- [ ] **Step 4: Run focused tests and package type checks**

Run: `bun test --conditions=solid --preload ./happydom.ts ./src/i18n/desktop-native.test.ts && bun typecheck`

Run from `packages/app`.

Run: `bun typecheck`

Run from `packages/desktop`.

Expected: all commands exit 0.

- [ ] **Step 5: Check that excluded branding remains unchanged**

Run: `rg -n "OpenCode (Zen|Go)" packages/app packages/tui packages/desktop`

Expected: existing OpenCode Zen and OpenCode Go copy is present and unchanged.

- [ ] **Step 6: Commit the web and desktop change**

```bash
git add packages/app/index.html packages/app/src/components/windows-app-menu.tsx packages/app/src/i18n/desktop-native.ts packages/app/src/i18n/desktop-native.test.ts packages/desktop/src/main/index.ts packages/desktop/src/main/windows.ts packages/desktop/src/renderer/index.html
git commit -m "feat(app): mark visible fork branding"
```
