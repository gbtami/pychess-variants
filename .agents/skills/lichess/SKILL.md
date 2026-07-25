---
name: lichess
description: Reuse lichess/lila code and assets when implementing or refining pychess-variants features to match lichess look and feel. Use when tasks involve UI parity, behavior parity, borrowing styles/icons/components, or checking how lichess implemented a feature. This skill defines a minimal reuse workflow. Do not use it to run local lila processes; use a local-server workflow when runtime comparison is required.
---

# Lichess Reuse

Use the lila codebase as the canonical reference when building lichess-parity features in pychess.

## Locate the Repositories

1. Resolve the pychess root with `git rev-parse --show-toplevel`.
2. Resolve lila from `LILA_DIR` when set.
3. Otherwise, try a sibling `lila` directory next to the pychess repository.
4. If lila is unavailable, stop and ask for its location. Do not invent code or assets from memory.

## Reuse Workflow

1. Find the closest lila implementation using `rg`, `find`, `git log`, and `git show`.
2. Copy or adapt the smallest viable code, style, asset, or behavior slice.
3. Adapt it to pychess architecture and variant-specific behavior.
4. Preserve notices or attribution comments that exist in copied files.
5. Run the relevant pychess checks after integration.

Use this skill for code and asset reuse only. Start local lila processes only through an explicitly available local-server workflow.
