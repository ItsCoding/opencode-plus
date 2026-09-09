# Contextual Inspector Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Review and All files each one native keyboard focus stop while preserving contextual inspector preview and pinning behavior.

**Architecture:** Replace the nested Kobalte hover-card/tooltip trigger composition with one inspector-local native-button preview mechanism. The existing `state.hovered`, `state.pinned`, `updateInspector`, panel callbacks, labels, and direction-aware preview placement remain the source of truth. The existing RTL E2E test proves the actual button focus order in both directions.

**Tech Stack:** SolidJS, `createStore`, native button events, Playwright, Bun.

## Global Constraints

- Preserve the existing review/files rail, counts, pinning, touch behavior, and LTR/RTL preview placement.
- Do not change shared `TooltipV2` or Kobalte APIs.
- Use localized existing labels only; do not add user-visible copy.
- Do not add delays or retries to E2E tests.

---

### Task 1: Make inspector actions native focus stops

**Files:**
- Modify: `packages/app/src/pages/session/contextual-inspector.tsx:1-107`
- Modify: `packages/app/e2e/regression/unified-shell-rtl.spec.ts:135-168`

**Interfaces:**
- Consumes: `updateInspector(state, { type: "enter" | "leave" | "toggle", tool, hoverable? })`, existing `review`/`files` panel callbacks, and `language.direction()`.
- Produces: two native `IconButtonV2` elements where pressing Tab from Review focuses All files in LTR and RTL.

- [ ] **Step 1: Write the failing E2E assertion**

Replace the wrapper-link locators in the existing inspector test with actual accessible buttons and assert the browser focus transition:

```ts
const reviewButton = inspector.getByRole("button", { name: "Review" })
const filesButton = inspector.getByRole("button", { name: "All files" })

await reviewButton.focus()
await expect(reviewButton).toBeFocused()
await reviewButton.press("Tab")
await expect(filesButton).toBeFocused()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `PLAYWRIGHT_PORT=3043 bun run test:e2e -- e2e/regression/unified-shell-rtl.spec.ts --workers=1` from `packages/app`.

Expected: the LTR and RTL inspector tests fail because a nested hover-card/tooltip wrapper consumes an extra Tab stop before All files.

- [ ] **Step 3: Remove nested interactive wrappers without changing inspector state**

Render the existing `IconButtonV2` directly in the inspector rail. Attach the current pointer, keyboard, and click handlers to that button. Render the existing count preview as a non-focusable sibling/portal controlled by `state.hovered`, `state.pinned`, `hoverable()`, and `placement()`.

```tsx
<IconButtonV2
  type="button"
  aria-label={item.label()}
  aria-pressed={state.pinned === item.tool}
  onPointerEnter={() => setState(updateInspector(state, { type: "enter", tool: item.tool, hoverable: hoverable() }))}
  onPointerLeave={() => setState(updateInspector(state, { type: "leave", tool: item.tool }))}
  onKeyDown={/* existing Enter/Space activation */}
  onClick={/* existing pointer-only activation */}
/>
```

Keep the preview content and `data-placement={placement()}` unchanged. Do not add a second focusable trigger.

- [ ] **Step 4: Run the test to verify it passes**

Run: `PLAYWRIGHT_PORT=3044 bun run test:e2e -- e2e/regression/unified-shell-rtl.spec.ts --workers=1` from `packages/app`.

Expected: 8 passed, including direct Review-to-All-files focus order in both LTR and RTL.

- [ ] **Step 5: Run related regression and type checks**

Run from `packages/app`:

```bash
PLAYWRIGHT_PORT=3045 bun run test:e2e -- e2e/regression/contextual-inspector.spec.ts e2e/regression/unified-sidebar.spec.ts --workers=1
bun typecheck
bun run typecheck:e2e
```

Expected: all selected E2E tests and both type checks pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/pages/session/contextual-inspector.tsx packages/app/e2e/regression/unified-shell-rtl.spec.ts
git commit -m "fix(app): simplify inspector focus order"
```

## Plan Self-Review

- Spec coverage: preserves each named interaction and verifies focus order plus existing inspector/sidebar behavior.
- Placeholder scan: no incomplete implementation steps or deferred requirements.
- Type consistency: uses existing `IconButtonV2`, inspector state, and panel interfaces; no new public API.
