## PyChess-Variants

PyChess-Variants is a free, open-source chess server designed to play several chess variants.

Currently supported games are:

- [Makruk](https://www.pychess.org/variant/makruk)
- [Ouk Chatrang](https://www.pychess.org/variant/cambodian)
- [Sittuyin](https://www.pychess.org/variant/sittuyin)
- [Shogi](https://www.pychess.org/variant/shogi)
- [Minishogi](https://www.pychess.org/variant/minishogi)
- [Kyoto shogi](https://www.pychess.org/variant/kyotoshogi)
- [Xiangqi](https://www.pychess.org/variant/xiangqi)
- [Minixiangqi](https://www.pychess.org/variant/minixiangqi)
- [Placement chess](https://www.pychess.org/variant/placement)
- [Crazyhouse](https://www.pychess.org/variant/crazyhouse)
- [S-chess](https://www.pychess.org/variant/seirawan)
- [Capablanca](https://www.pychess.org/variant/capablanca)
- [Gothic](https://www.pychess.org/variant/gothic)
- [Grand](https://www.pychess.org/variant/grand)
- [Shako](https://www.pychess.org/variant/shako)
- [Shogun](https://www.pychess.org/variant/shogun)
- [S-house (S-chess+Crazyhouse)](https://www.pychess.org/variant/shouse)
- [Capahouse (Capablanca+Crazyhouse)](https://www.pychess.org/variant/capahouse)
- [Grandhouse (Grand chess+Crazyhouse)](https://www.pychess.org/variant/grandhouse)
- [Standard chess](https://www.pychess.org/variant/chess)

Additionally you can check Chess960 option in for Standard, Crazyhouse, Capablanca and Capahouse to start games from random positions with 
[Chess960 castling rules](https://en.wikipedia.org/wiki/Chess960#Castling_rules)

For move generation, validation, analysis and engine play it uses
- [Fairy-Stockfish Python3 bindings](https://github.com/gbtami/Fairy-Stockfish) fork of [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)
- [fairyfishnet](https://github.com/gbtami/fairyfishnet) fork of [fishnet](https://github.com/niklasf/fishnet)
- [lichess-bot-variants](https://github.com/gbtami/lichess-bot-variants) fork of [lichess-bot](https://github.com/careless25/lichess-bot)

On client side it is based on
[chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/ornicar/chessground)

## [![Patreon](https://c5.patreon.com/external/logo/become_a_patron_button.png)](https://www.patreon.com/bePatron?u=29103205)

As you know, pychess-variants is a free server and it will remain free forever. However, maintaining and improving the server costs time and money.

If you like our work and find our server useful, please donate through [patreon](https://www.patreon.com/pychess) or directly through [paypal](https://www.paypal.me/gbtami)!!
Your contribution will be greatly appreciated and help me continue to develop this awesome server.

## Installation
```
(You need mongodb up and running)

pip3 install -r requirements.txt --user

yarn install
gulp dev

python3 server/server.py
```
