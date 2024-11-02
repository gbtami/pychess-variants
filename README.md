## [www.pychess.org](https://www.pychess.org)

[![Python-CI](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml)
[![Nodejs-CI](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml)

pychess-variants is a free, open-source chess server designed to play chess variants.

Currently supported games are listed on https://www.pychess.org/variants

For move generation, validation, analysis and engine play it uses
- [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
- [fairy-stockfish.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm)
- [fairyfishnet](https://github.com/gbtami/fairyfishnet) fork of [fishnet](https://github.com/lichess-org/fishnet)

On client side it is based on
[chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/lichess-org/chessground)

##

As you know, pychess-variants is a free server and it will remain free forever. However, maintaining and improving the server costs time and money.

If you like our work and find our server useful, please donate through [patreon](https://www.patreon.com/pychess) or directly through [paypal](https://www.paypal.com/paypalme/gbtami)!!
Your contribution will be greatly appreciated and help me continue to develop this awesome server.

## Installation

### Prerequisites
* You need mongodb up and running. [Mongo daemon](https://www.mongodb.com/docs/manual/installation/)


### Project setup
```
pip3 install -r requirements.txt --user // Install python requirements
yarn install                            // Install node requirements
yarn dev                                // Compile typescript files to javascript
yarn md                                 // Compile md files to html
```

### Start server
```
python3 server/server.py
```

### Docker setup
If you want to avoid installing dependencies (mongo, node, python) you can instead run the server locally in docker using compose. To start it, simply run:
```
docker compose up --build
```
This recompiles the frontend and starts the server and DB. Once it is up, you can connect to `localhost:8080` in your browser.


## Supported browsers

Pychess-variants should support almost all browsers. Though older browsers (including any version of Internet Explorer) will not work. For your own sake, please upgrade. Security and performance, think about it!

Only [Fairy-Stockfish analysis](https://www.pychess.org/analysis/chess) might not work on all browsers.
