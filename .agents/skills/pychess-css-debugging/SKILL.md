---
name: pychess-css-debugging
description: Diagnose and fix CSS cascade, layout, theme, responsive, and interaction-state conflicts in pychess-variants. Use whenever changing or debugging CSS, hover/focus states, colors, spacing, visibility, responsive behavior, or styles that differ between pages, themes, or viewports. Requires checking all served stylesheets and browser computed styles before reporting completion.
---

# Pychess CSS Debugging

Work from the repository root. Treat the rendered cascade, not the nearest feature stylesheet, as the source of truth.

## Workflow

1. Locate the rendered element and stylesheet chain.
   - Inspect the template or client view that creates the element.
   - Check `templates/base.html` for stylesheet load order and `server/views/__init__.py` or the relevant view for `view_css`.
   - Search all relevant files under `static/`, including `site.css`, `style.css`, feature CSS, imported CSS, media queries, and CSS variables.

2. Reproduce before editing.
   - Open the running page at the affected viewport, theme, authentication state, and interaction state.
   - Confirm the stylesheet actually served by the browser; account for cache/versioned static URLs.
   - Inspect computed styles and matched rules for the property. Reproduce `:hover`, `:focus-visible`, responsive, or modal states as applicable.
   - If pointer interaction fails, check whether an overlay or modal intercepts pointer events.

3. Fix the owning rule.
   - Prefer narrowing an accidentally broad shared selector to its intended container.
   - Add a feature-level override only when the feature genuinely owns the exception.
   - Do not escalate specificity or add `!important` merely to overpower an unidentified rule.
   - Preserve the intended behavior of the original selector and check neighboring consumers.

4. Verify the rendered result.
   - Exercise the real pseudo-state in Chromium and inspect the final computed value.
   - Compare before/after values when color, size, visibility, or layout is at issue.
   - Check desktop/mobile and light/dark modes when the changed selector or variable can affect them.
   - Run the frontend checks required by `AGENTS.md`.

## Decision Rules

- Never conclude that a CSS fix works from one-file inspection or static specificity reasoning alone.
- Never assume the feature stylesheet owns the final style.
- If the computed value is unexpected, identify the winning matched rule before editing.
- Do not report completion until the affected state has been verified in the browser when a local reproduction is practical.
