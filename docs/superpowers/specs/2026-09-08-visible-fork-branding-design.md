# Visible Fork Branding Design

## Goal

Identify this fork at runtime by rendering its application name as `OpenCode+` wherever the frontend presents the product itself.

## Scope

Update explicit application identity labels in the TUI, embedded web interface, and desktop shell. This includes welcome and logo text, terminal and browser window titles, and desktop application or menu labels where they name the app.

Do not change API names, source identifiers, CLI commands, URLs, comments, tests, legal or marketing copy, translated prose, or sub-brand names such as OpenCode Zen and OpenCode Go.

## Implementation

Locate the existing rendered product-name literals and replace only the identity-label values with `OpenCode+`. Keep the current components and translation structure; no shared branding abstraction is needed for this narrow fork marker.

## Verification

Run the focused package type checks and existing relevant frontend tests. Confirm the changed literals are limited to product identity surfaces and that excluded names such as `OpenCode Zen` remain unchanged.
