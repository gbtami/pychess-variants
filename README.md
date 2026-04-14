## [www.pychess.org](https://www.pychess.org)

[![Python-CI](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml)
[![Nodejs-CI](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml)
[![Discord](https://img.shields.io/discord/634298688663191582?label=Discord&logo=discord&style=flat)](https://discord.gg/aPs8RKr)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/gbtami/pychess-variants)

---
![pychess-variants.png](https://github.com/gbtami/pychess-variants/blob/c9617275f6f927b5a15d4424c4a847a73489c805/static/images/pychess-variants.png)

Pychess-variants is a free, open-source chess server designed to play chess variants.

Currently supported games are listed on https://www.pychess.org/variants

For move generation, validation, analysis and engine play it uses:
- [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
- [fairy-stockfish.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm)
- [fairyfishnet](https://github.com/gbtami/fairyfishnet) fork of [fishnet](https://github.com/lichess-org/fishnet)

On client side it is based on
[chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/lichess-org/chessground)

##

As you know, pychess-variants is a free server and it will remain free forever. However, maintaining and improving the server costs time and money.

If you like our work and find our server useful, please donate through [Patreon](https://www.patreon.com/pychess) or directly through [paypal](https://www.paypal.com/paypalme/gbtami) !!
Your contribution will be greatly appreciated and help me continue to develop this awesome server.

## Installation

### Prerequisites
* You need MongoDB up and running. [Mongo daemon](https://www.mongodb.com/docs/manual/installation/)


### Project setup
```bash
# Install python requirements with pip
pip install . --user
# Use pip with [dev] for local development with testing tools
pip install .[dev] --user

# Alternatively, use uv to install python requirements in a virtual env
uv sync
# Use uv with --extra dev for local development with testing tools
uv sync --extra dev

yarn install                            # Install node requirements
yarn dev                                # Compile typescript files to javascript
yarn md                                 # Compile md files to html
```

### Start server
```bash
python3 server/server.py
```
Or if `uv` is used
```bash
uv run server/server.py
```

### Docker setup
If you want to avoid installing dependencies (mongo, node, python) you can instead run the server locally in docker using compose. To start it, simply run:
```bash
docker compose up --build
```
This recompiles the frontend and starts the server and DB. Once it is up, you can connect to `localhost:8080` in your browser.

For development checks inside Docker there is also an optional `ci` service. It has the Python dev tools and Node dependencies needed for linting, type-checking, and tests, while using your working tree from the host machine.

Run one-off checks with:
```bash
docker compose run --rm ci ruff format .
docker compose run --rm ci ruff check .
docker compose run --rm ci pyright
docker compose run --rm ci yarn test
docker compose run --rm ci env PYTHONPATH=server python -m unittest discover -s tests
```

If you want an interactive shell in the same environment:
```bash
docker compose --profile ci up -d mongodb ci
docker compose exec ci bash
```

The `ci` service uses a named Docker volume for `node_modules`, so your host checkout does not need a local Node install. If dependencies change, rebuild the image with:
```bash
docker compose build ci
```

The MongoDB service is only exposed inside the compose network by default. Uncomment the `mongodb` port mapping in `docker-compose.yaml` only if you want host tools such as `mongosh` or MongoDB Compass to connect directly.

More detailed Docker workflows are documented in [docker/README.md](/home/tami/pychess-variants/docker/README.md).


## Supported browsers

Pychess-variants should support almost all browsers. Though older browsers (including any version of Internet Explorer) will not work. For your own sake, please upgrade. Security and performance, think about it!

Only [Fairy-Stockfish analysis](https://www.pychess.org/analysis/chess) might not work on all browsers.
