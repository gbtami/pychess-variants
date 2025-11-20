# AGENTS.md

## Project Overview

Pychess-variants is a free, open-source chess server for playing chess variants. It's a full-stack web application with:

- **Backend**: Python with aiohttp web framework, MongoDB for data persistence
- **Frontend**: TypeScript compiled with esbuild, using Snabbdom virtual DOM
- **Chess Engine**: Fairy-Stockfish and fairy-stockfish.wasm for move validation and AI
- **Board Library**: chessgroundx (fork of lichess chessground)

## Essential Commands

### Development Setup
```bash
# Install dependencies
pip3 install .[dev] --user
yarn install

# Development build (with sourcemaps)
yarn dev

# Production build (minified)
yarn prod

# Compile markdown docs to HTML
yarn md

# Start development server
python3 server/server.py
```

### Testing and Quality
```bash
# Run TypeScript type checking
yarn typecheck

# Run JavaScript/TypeScript tests
yarn test

# Python code formatting
black .

# Python linting
flake8

# Python unit tests
PYTHONPATH=server python -m unittest discover -s tests

# Python Playwright tests
python -m playwright install --with-deps
PYTHONPATH=server python -m pytest tests/test_e2e.py
PYTHONPATH=server python -m pytest tests/test_gui.py
```

### Docker Development
```bash
# Run entire stack with docker-compose
docker compose up --build
```

## Architecture

### Server Architecture (Python)
- **Entry point**: `server/server.py` - Main aiohttp application
- **Routes**: `server/routes.py` - URL routing for both web and API endpoints
- **Game logic**: `server/game.py` - Core game state management
- **WebSocket**: `server/wsr.py` - Real-time communication for gameplay
- **Bot API**: `server/bot_api.py` - Lichess-compatible bot API
- **Database**: MongoDB with pymongo (async driver)
- **Authentication**: Session-based with optional OAuth2 integration

### Client Architecture (TypeScript)
- **Entry point**: `client/main.ts` - Main application initialization
- **Views**: Separate modules for lobby, game, analysis, tournaments, etc.
- **Game control**: `client/gameCtrl.ts` and `client/roundCtrl.ts` for game state
- **Board**: Uses chessgroundx for visual chess board representation
- **Chess engine**: Integrates fairy-stockfish.wasm for client-side analysis

### Key Components
- **Variants**: Chess variant definitions in `variants.ini` and `server/variants.py`
- **Internationalization**: `lang/` directory with gettext .po files
- **Real-time features**: WebSocket-based for live games, spectating, chat
- **Analysis**: Server-side Fairy-Stockfish integration + client-side WASM engine

## Important Files and Directories

### Configuration
- `variants.ini` - Chess variant definitions and rules
- `tsconfig.json` - TypeScript compiler configuration
- `esbuild.mjs` - Frontend build configuration

### Python Server
- `server/pychess_global_app_state.py` - Global application state management
- `server/users.py` - User management and authentication
- `server/lobby.py` - Game lobbies and matchmaking
- `server/tournament/` - Tournament system implementation

### TypeScript Client
- `client/variants.ts` - Client-side variant definitions
- `client/socket/` - WebSocket communication layer
- `client/analysis*.ts` - Analysis board functionality
- `client/lobby/` - Lobby UI components organized by variant family

## Development Patterns

### Adding New Chess Variants
1. Define variant rules in `variants.ini`
2. Add variant metadata to `server/variants.py`
3. Add client-side variant info to `client/variants.ts`
4. Add piece/board graphics to `static/` if needed
5. Create documentation in `static/docs/`

### WebSocket Communication
- Server uses `server/wsr.py` for WebSocket message handling
- Client uses `client/socket/` for WebSocket communication
- Messages follow a structured JSON format for different game events

### Frontend Development
- Uses Snabbdom virtual DOM (similar to React but smaller)
- CSS organized by feature/component in `static/`
- No framework dependencies - vanilla TypeScript with utility libraries

### Testing
- Jest for JavaScript/TypeScript unit tests in `tests/`
- Python tests using standard unittest in `tests/`
- Some integration tests for game scenarios

## Database Schema
- MongoDB collections for users, games, tournaments, seeks, etc.
- Games stored with move history and metadata
- User ratings tracked per variant using Glicko2 system (`server/glicko2/`)

## Deployment
- Heroku-ready with `Procfile` and `heroku-postbuild` script
- Docker support via `docker-compose.yaml`
- Static assets served from `static/` directory
- CDN integration for piece sets and board themes
