## PyChess-Variants

PyChess-Variants is a free, open-source chess server designed to play several chess variants.

Currently supported games are:

- [Makruk](https://en.wikipedia.org/wiki/Makruk)
- [Ouk Chatrang](https://en.wikipedia.org/wiki/Makruk#Cambodian_chess)
- [Sittuyin](https://en.wikipedia.org/wiki/Sittuyin)
- [Shogi](https://en.wikipedia.org/wiki/Shogi)
- [Minishogi](https://en.wikipedia.org/wiki/Minishogi)
- [Kyoto shogi](https://en.wikipedia.org/wiki/Kyoto_shogi)
- [Xiangqi](https://en.wikipedia.org/wiki/Xiangqi)
- [Minixiangqi](http://mlwi.magix.net/bg/minixiangqi.htm)
- [Placement chess](http://www.quantumgambitz.com/blog/chess/cga/bronstein-chess-pre-chess-shuffle-chess)
- [Crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse)
- [S-chess](https://en.wikipedia.org/wiki/Seirawan_chess)
- [Capablanca](https://en.wikipedia.org/wiki/Capablanca_Chess)
- [Gothic](https://en.wikipedia.org/wiki/Gothic_chess)
- [Grand](https://en.wikipedia.org/wiki/Grand_Chess)
- [Shako](https://www.chessvariants.com/large.dir/shako.html)
- [Shogun](https://pychess-variants.herokuapp.com/guides/Variants)
- [S-house (S-chess+Crazyhouse)](https://pychess-variants.herokuapp.com/IRVxMG72)
- [Capahouse (Capablanca+Crazyhouse)](https://www.twitch.tv/videos/466253815)
- [Gothhouse (Gothic+Crazyhouse)](https://pychess-variants.herokuapp.com/kGOcweH3)
- [Grandhouse (Grand chess+Crazyhouse)](https://youtu.be/In9NOBCpS_4)
- [Standard chess](https://en.wikipedia.org/wiki/Chess)

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
