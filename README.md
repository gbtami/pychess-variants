[![Python-CI](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml)
[![Nodejs-CI](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml)
## PyChess-Variants

PyChess-Variants is a free, open-source chess server designed to play chess variants.

Currently supported games are:

- [Makruk](https://www.pychess.org/variant/makruk)
- [Makpong](https://www.pychess.org/variant/makpong)
- [Ouk Chatrang](https://www.pychess.org/variant/cambodian)
- [Sittuyin](https://www.pychess.org/variant/sittuyin)
- [Shogi](https://www.pychess.org/variant/shogi)
- [Minishogi](https://www.pychess.org/variant/minishogi)
- [Kyoto shogi](https://www.pychess.org/variant/kyotoshogi)
- [Dobutsu shogi](https://www.pychess.org/variant/dobutsu)
- [Goro-Goro shogi](https://www.pychess.org/variant/gorogoro)
- [Xiangqi](https://www.pychess.org/variant/xiangqi)
- [Manchu](https://www.pychess.org/variant/manchu)
- [Janggi](https://www.pychess.org/variant/janggi)
- [Minixiangqi](https://www.pychess.org/variant/minixiangqi)
- [Placement chess](https://www.pychess.org/variant/placement)
- [Crazyhouse](https://www.pychess.org/variant/crazyhouse)
- [Atomic](https://www.pychess.org/variant/atomic)
- [S-chess](https://www.pychess.org/variant/seirawan)
- [Capablanca](https://www.pychess.org/variant/capablanca)
- [Gothic](https://www.pychess.org/variant/gothic)
- [Grand](https://www.pychess.org/variant/grand)
- [Shako](https://www.pychess.org/variant/shako)
- [Shogun](https://www.pychess.org/variant/shogun)
- [Orda](https://www.pychess.org/variant/orda)
- [Synochess](https://www.pychess.org/variant/synochess)
- [Hoppel-Poppel](https://www.pychess.org/variant/hoppelpoppel)
- [Shinobi](https://www.pychess.org/variant/shinobi)
- [Empire Chess](https://www.pychess.org/variant/empire)
- [Orda Mirror](https://www.pychess.org/variant/ordamirror)
- [S-house (S-chess+Crazyhouse)](https://www.pychess.org/variant/shouse)
- [Capahouse (Capablanca+Crazyhouse)](https://www.pychess.org/variant/capahouse)
- [Grandhouse (Grand chess+Crazyhouse)](https://www.pychess.org/variant/grandhouse)
- [Standard chess](https://www.pychess.org/variant/chess)

Additionally you can check Chess960 option in for Standard, Crazyhouse, Atomic, S-chess, Capablanca and Capahouse to start games from random positions with 
[Chess960 castling rules](https://en.wikipedia.org/wiki/Chess960#Castling_rules)

For move generation, validation, analysis and engine play it uses
- [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)
- [fairyfishnet](https://github.com/gbtami/fairyfishnet) fork of [fishnet](https://github.com/niklasf/fishnet)
- [lichess-bot-variants](https://github.com/gbtami/lichess-bot-variants) fork of [lichess-bot](https://github.com/careless25/lichess-bot)

On client side it is based on
[chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/ornicar/chessground)

##

As you know, pychess-variants is a free server and it will remain free forever. However, maintaining and improving the server costs time and money.

If you like our work and find our server useful, please donate through [patreon](https://www.patreon.com/pychess) or directly through [paypal](https://www.paypal.me/gbtami)!!
Your contribution will be greatly appreciated and help me continue to develop this awesome server.

## Installation

### Prerequisites
* [Mongo daemon](https://docs.mongodb.com/manual/installation/) (You need mongodb up and running)
* [Node](https://github.com/nodesource/distributions/blob/master/README.md#installation-instructions) (10.17.0 or later is supported)


### Project setup
```
pip3 install -r requirements.txt --user
yarn install
yarn dev
```

For MacOS, replace the last command with:
```
yarn dev-mac
```

### Start server
```
python3 server/server.py
```
