## [www.pychess.org](https://www.pychess.org)

[![Python-CI](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/ci.yml)
[![Nodejs-CI](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gbtami/pychess-variants/actions/workflows/nodejs.yml)

pychess-variants is a free, open-source chess server designed to play chess variants.

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
- [Goro-Goro shogi](https://www.pychess.org/variants/gorogoroplus)
- [Tori Shogi](https://www.pychess.org/variants/torishogi)
- [Xiangqi](https://www.pychess.org/variants/xiangqi)
- [Manchu](https://www.pychess.org/variants/manchu)
- [Janggi](https://www.pychess.org/variants/janggi)
- [Minixiangqi](https://www.pychess.org/variants/minixiangqi)
- [Placement chess](https://www.pychess.org/variants/placement)
- [Crazyhouse](https://www.pychess.org/variants/crazyhouse)
- [Atomic](https://www.pychess.org/variants/atomic)
- [Three check](https://www.pychess.org/variants/3check)
- [King of the Hill](https://www.pychess.org/variants/kingofthehill)
- [Duck chess](https://www.pychess.org/variants/duck)
- [S-chess](https://www.pychess.org/variants/seirawan)
- [Capablanca](https://www.pychess.org/variants/capablanca)
- [Gothic](https://www.pychess.org/variants/gothic)
- [Grand](https://www.pychess.org/variants/grand)
- [Shako](https://www.pychess.org/variants/shako)
- [Shogun](https://www.pychess.org/variants/shogun)
- [Mansindam](https://www.pychess.org/variants/mansindam)
- [Orda](https://www.pychess.org/variants/orda)
- [Synochess](https://www.pychess.org/variants/synochess)
- [Hoppel-Poppel](https://www.pychess.org/variants/hoppelpoppel)
- [Shinobi+](https://www.pychess.org/variants/shinobiplus)
- [Empire Chess](https://www.pychess.org/variants/empire)
- [Orda Mirror](https://www.pychess.org/variants/ordamirror)
- [Chak](https://www.pychess.org/variants/chak)
- [Chennis](https://www.pychess.org/variants/chennis)
- [Spartan chess](https://www.pychess.org/variants/spartan)
- [S-house (S-chess+Crazyhouse)](https://www.pychess.org/variants/shouse)
- [Capahouse (Capablanca+Crazyhouse)](https://www.pychess.org/variants/capahouse)
- [Grandhouse (Grand chess+Crazyhouse)](https://www.pychess.org/variants/grandhouse)
- [Chess](https://www.pychess.org/variants/chess)
- [Ataxx](https://www.pychess.org/variants/ataxx)

Additionally you can check Chess960 option in for Chess, Crazyhouse, Atomic, Three check, King of the Hill, S-chess, Capablanca and Capahouse to start games from random positions with 
[Chess960 castling rules](https://en.wikipedia.org/wiki/Fischer_random_chess#Castling_rules)

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

## Supported browsers

Pychess-variants should support almost all browsers. Though older browsers (including any version of Internet Explorer) will not work. For your own sake, please upgrade. Security and performance, think about it!

Only [Fairy-Stockfish analysis](https://www.pychess.org/analysis/chess) might not work on all browsers.
