# AGENTS.md

## Project

Pychess-variants is a full-stack chess-variant server: Python/aiohttp and MongoDB on the backend, TypeScript/Snabbdom on the frontend, Fairy-Stockfish for chess logic, and chessgroundx for boards.

Use `README.md` for installation and common commands. Inspect the repository for architecture and file ownership rather than relying on a duplicated directory guide here.

## Project Skills

Use these focused skills when their trigger applies. Project-owned skills are checked into `.agents/skills/`.

- `lichess`: borrow lila code or assets for lichess UI/behavior parity.
- `fairy-stockfish-debugging`: investigate engine, legal-move, FEN, SAN, fishnet, or BOT behavior.
- `pychess-css-debugging`: change or debug CSS, themes, responsive layout, or interaction states.
- `pychess-testing`: select and run change-scoped quality gates before completion or commit.
- Optional personal skill `lichess-local-server`: when installed, run or stop local lila for live parity checks.

Keep detailed workflows in their skills rather than duplicating them here.

## Verification Policy

Use `pychess-testing` after code changes. The required baseline is:

| Change scope | Required checks |
| --- | --- |
| TypeScript, CSS, or static UI only | `yarn typecheck`, `yarn test`; skip Python gates |
| Python or server code | `uv run ruff format .`, `uv run ruff check .`, `uv run pyright`, plus targeted Python tests |
| Mixed frontend and server | Both frontend and Python checks |
| Rendered/browser behavior | Add relevant browser or Playwright verification |

- Run targeted Python tests by default. Reserve the full suite for broad or cross-cutting changes, explicit requests, or when targeted coverage is insufficient.
- Run tournament tests only when tournament code changed, shared code can affect tournaments, or the task explicitly requires tournament coverage.
- Run Python commands through `uv run` unless the project virtualenv is already active.

## Generated Piece CSS

- Edit piece styles under `static/piece/<family>/<style>.css`; keep image URLs under `static/images/pieces/`.
- Never hand-edit `static/piece-css/`.
- Regenerate one style with:

  ```bash
  python3 piece_image_to_css.py static/piece/<family>/<style>.css
  ```

- Passing a directory regenerates every CSS file below it. Commit both the source and generated files.

## Engine Integration

Server-side `pyffish` and client-side `ffish-es6` both enforce variant rules. When notation or engine behavior matters, consult the `fairy-stockfish-debugging` skill and the [Fairy-Stockfish chess variant standards](https://fairy-stockfish.github.io/chess-variant-standards/).
