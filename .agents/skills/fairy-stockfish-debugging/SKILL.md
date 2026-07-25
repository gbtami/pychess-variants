---
name: fairy-stockfish-debugging
description: Debug Fairy-Stockfish engine behavior, pyffish behavior, fairyfishnet worker behavior, and pychess-variants BOT move or analysis flows. Use when investigating invalid moves, SAN/FEN/legal-move discrepancies, custom-FEN behavior, engine-versus-server-versus-client responsibility, fishnet payloads, or issues where local engine reproduction is more reliable than browser-only debugging.
---

# Fairy-Stockfish Debugging

Localize engine-related bugs before changing code.

## Locate Optional Repositories

1. Resolve the pychess root with `git rev-parse --show-toplevel`.
2. Resolve Fairy-Stockfish from `FAIRY_STOCKFISH_DIR` or a sibling `Fairy-Stockfish` directory.
3. Resolve fairyfishnet from `FAIRYFISHNET_DIR` or a sibling `fairyfishnet` directory.
4. Require only the external repository needed for the current investigation. If it is unavailable, report the missing path rather than guessing.

## Workflow

1. Reproduce at the lowest layer first.
   - For legality, SAN, status, variant-rule, or FEN issues, start with Fairy-Stockfish or `pyffish`.

2. Decide which layer owns the bug.
   - Engine: direct Fairy-Stockfish or `pyffish` reproduces it.
   - Worker: engine output is correct, but fairyfishnet transforms or posts it incorrectly.
   - Server: engine and worker output are correct, but server code processes it incorrectly.
   - Client: the browser sends malformed, stale, or out-of-position messages.

3. Prefer a minimal reproduction.
   - Try one FEN and one engine action for move bugs.
   - Prove the worker JSON shape before running the full server.
   - Prefer focused server tests or direct calls over browser reproduction.

4. Check the correct rule source.
   - Built-in Fairy-Stockfish variants: `src/variant.cpp` in Fairy-Stockfish.
   - User-defined pychess variants: `variants.ini` in this repository.
   - Do not infer engine rules from UI behavior.

5. Use Fairy-Stockfish's `test.py` corpus for legality, insufficient-material, variant-draw, custom-variant, and position-validation issues.

6. Trace BOT flows through:
   - `server/ai.py` for queued move jobs.
   - `server/fishnet.py` for worker responses.
   - `server/wsr.py` for human websocket moves.
   - `server/utils.py` and `server/game.py` for move application and state transitions.

## Decision Rules

- If direct engine or `pyffish` calls reproduce an invalid move, investigate the engine before the browser.
- If engine behavior is correct but worker JSON is wrong, inspect fairyfishnet.
- If the worker payload is correct but game transitions are wrong, inspect the server before the client.
- For custom FEN, check whether the position is already terminal or invalid.
- For BOT issues, distinguish a bad engine choice from the server requesting a move in the wrong position.
- Treat worker configuration as potentially sensitive. Never print or commit API keys, tokens, or credentials from it.

## Reference

For recurring commands and a compact reproduction checklist, read `references/engine-workflows.md`.
