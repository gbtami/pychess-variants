# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: `AGENTS.md` at the repo root contains equivalent guidance written for other coding agents. Keep the two in sync when updating commands or architecture notes; the Codex-specific skill paths listed there (under `${CODEX_HOME}`) don't apply here.

## Project Overview

Pychess-variants (www.pychess.org) is a free, open-source chess server for playing chess variants.

- **Backend**: Python (3.14+) with aiohttp, MongoDB for persistence
- **Frontend**: TypeScript compiled with esbuild, Snabbdom virtual DOM (no framework)
- **Chess engine**: Fairy-Stockfish, via `pyffish` server-side and `ffish-es6.js`/wasm client-side
- **Board**: chessgroundx (a pychess fork of lichess's chessground)

## Essential Commands

### Setup
```bash
uv sync --extra dev      # Python deps into project .venv
yarn install              # Node deps (also runs cp2static.sh via postinstall)
```

### Build / Run
```bash
yarn dev                          # frontend build with sourcemaps
yarn prod                         # minified frontend build
yarn md                           # compile markdown docs to HTML
uv run server/server.py           # start dev server
uv run server/server.py -a        # anon users behave as logged-in test users (for auth-gated UX testing)
```

### Lint / Typecheck / Test
Scope your checks to what changed: client-only changes need only the frontend commands; any Python/server change needs the Python gates too, run before considering the work done.

```bash
# Frontend
yarn typecheck
yarn test                         # jest

# Python — run all three for any server/Python change, even small edits
uv run ruff format .
uv run ruff check .
uv run pyright

# Python tests
env PYTHONPATH=server uv run python -m unittest discover -s tests
# single module/class/test (needs tests/ on path too):
env PYTHONPATH=server:tests uv run python -m unittest tests.some_test_module

# Playwright e2e/gui tests (install browsers once; skip --with-deps unless provisioning a fresh host)
uv run python -m playwright install
env PYTHONPATH=server uv run python -m pytest tests/test_e2e.py
env PYTHONPATH=server uv run python -m pytest tests/test_gui.py
```

All `uv run ...` prefixes assume the venv isn't already activated. `unittest`'s default output is noisy because tests init the app logger — redirect to a file and grep for `^Ran|^OK$|^FAILED|^ERROR:|^FAIL:` when you just need pass/fail.

### Docker
```bash
docker compose up --build         # server + mongodb (+ optional mongo-express)
```
Docker is rebuild-based, not live-reload: after editing `client/`, `server/`, `static/`, or `templates/`, run `docker compose build server && docker compose up -d server`. There's also a `ci` profile/service for running lint/typecheck/tests inside a container without installing anything locally — see `docker/README.md`.

## Architecture

### Server (`server/`)
- `server.py` — aiohttp app entry point; `routes.py` — URL routing for web + API
- `game.py` — core game state; `wsr.py` — WebSocket handling for live play/spectating/chat
- `pychess_global_app_state.py` — shared global application state
- `variants.py` + root `variants.ini` — variant definitions/rules (variant metadata lives in both; adding a variant touches both plus `client/variants.ts`)
- `tournament/` — arena, swiss, round-robin tournament systems; `glicko2/` — per-variant rating system
- `bot_api.py` — Lichess-compatible bot API; `fishnet.py` — distributed analysis workers
- `bug/`, `bugchess/` — bughouse-specific game logic
- Chess rule/FEN/PGN/UCI semantics are delegated to Fairy-Stockfish via `pyffish`; the variant-standards reference is at https://fairy-stockfish.github.io/chess-variant-standards/

### Client (`client/`)
- `main.ts` — app entry; `gameCtrl.ts`/`roundCtrl.ts` — game state/control; `view.ts` — top-level view wiring
- `socket/` — WebSocket client layer, mirrors `server/wsr.py`'s message shapes
- `lobby/` — lobby UI, organized by variant family
- `analysis*.ts` — analysis board (client-side engine via `fairyStockfish.ts`/wasm)
- `bug/` — bughouse-specific client logic (mirrors server's `bug/`)
- Board rendering goes through chessgroundx; UI is vanilla TS + Snabbdom, not React/Vue

### Cross-cutting
- `lang/` — gettext `.po` i18n files
- `tests/` — Jest specs (`*.test.ts`) alongside Python `unittest`/pytest tests in the same directory; `tests/test_e2e.py` and `tests/test_gui.py` are Playwright-driven
- MongoDB collections cover users, games, tournaments, seeks, etc.; games store move history + metadata

## Notes for Playwright/UI work
For flows requiring an authenticated session (PM/inbox, etc.), run the server with `-a` rather than setting up a real login.
