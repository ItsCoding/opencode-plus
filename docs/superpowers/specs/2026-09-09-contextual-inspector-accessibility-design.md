# Contextual Inspector Accessibility Design

## Decision

Render each inspector action as one native `IconButtonV2`. The action itself owns hover-preview, click, and keyboard activation behavior.

## Scope

- Preserve the existing review/files rail, counts, pinning, hover preview, LTR/RTL placement, and touch behavior.
- Remove the redundant `TooltipV2` wrapper from inspector actions.
- Do not render a Kobalte hover-card trigger around a native button. The preview will be attached to the button without adding a second focusable element.
- Keep the visible UI unchanged except that keyboard Tab moves directly from Review to All files.

## Accessibility

- Each action has one accessible native button with its existing localized label.
- Review and All files appear once each in the tab order.
- The hover preview remains supplementary and does not receive focus.

## Verification

- Extend the existing LTR and RTL E2E test to focus Review, press Tab, and assert All files is focused.
- Re-run contextual-inspector, unified-shell RTL, related sidebar regressions, app typecheck, and E2E typecheck.

## Non-goals

- No shared `TooltipV2` or Kobalte API changes.
- No visual redesign or new copy.
- No benchmark threshold changes.
