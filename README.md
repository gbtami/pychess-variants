## [PyChess-Variants](https://www.pychess.org)

[![Python-CI](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml)
[![Nodejs-CI](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml)

PyChess-Variants is a free, open-source chess server designed to play chess variants.

Currently supported games are:

- [Makruk](https://www.pychess.org/variants/makruk)
- [Makpong](https://www.pychess.org/variants/makpong)
- [Ouk Chatrang](https://www.pychess.org/variants/cambodian)
- [Sittuyin](https://www.pychess.org/variants/sittuyin)
- [ASEAN Chess](https://www.pychess.org/variants/asean)
- [Shogi](https://www.pychess.org/variants/shogi)
- [Minishogi](https://www.pychess.org/variants/minishogi)
- [Kyoto shogi](https://www.pychess.org/variants/kyotoshogi)
- [Dobutsu shogi](https://www.pychess.org/variants/dobutsu)
- [Goro-Goro shogi](https://www.pychess.org/variants/gorogoro)
- [Tori Shogi](https://www.pychess.org/variants/torishogi)
- [Xiangqi](https://www.pychess.org/variants/xiangqi)
- [Manchu](https://www.pychess.org/variants/manchu)
- [Janggi](https://www.pychess.org/variants/janggi)
- [Minixiangqi](https://www.pychess.org/variants/minixiangqi)
- [Placement chess](https://www.pychess.org/variants/placement)
- [Crazyhouse](https://www.pychess.org/variants/crazyhouse)
- [Atomic](https://www.pychess.org/variants/atomic)
- [S-chess](https://www.pychess.org/variants/seirawan)
- [Capablanca](https://www.pychess.org/variants/capablanca)
- [Gothic](https://www.pychess.org/variants/gothic)
- [Grand](https://www.pychess.org/variants/grand)
- [Shako](https://www.pychess.org/variants/shako)
- [Shogun](https://www.pychess.org/variants/shogun)
- [Orda](https://www.pychess.org/variants/orda)
- [Synochess](https://www.pychess.org/variants/synochess)
- [Hoppel-Poppel](https://www.pychess.org/variants/hoppelpoppel)
- [Shinobi](https://www.pychess.org/variants/shinobi)
- [Empire Chess](https://www.pychess.org/variants/empire)
- [Orda Mirror](https://www.pychess.org/variants/ordamirror)
- [Chak](https://www.pychess.org/variants/chak)
- [S-house (S-chess+Crazyhouse)](https://www.pychess.org/variants/shouse)
- [Capahouse (Capablanca+Crazyhouse)](https://www.pychess.org/variants/capahouse)
- [Grandhouse (Grand chess+Crazyhouse)](https://www.pychess.org/variants/grandhouse)
- [Standard chess](https://www.pychess.org/variants/chess)

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
* You need mongodb up and running. [Mongo daemon](https://docs.mongodb.com/manual/installation/)


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
