## PyChess-Variants

PyChess-Variants is a free, open-source chess server designed to play several chess variants
Currently supported games are:

- [Makruk](https://en.wikipedia.org/wiki/Makruk)
- [Sittuyin](https://en.wikipedia.org/wiki/Sittuyin)
- [Shogi](https://en.wikipedia.org/wiki/Shogi)
- [Xiangqi](https://en.wikipedia.org/wiki/Xiangqi)
- [Placement chess](http://www.quantumgambitz.com/blog/chess/cga/bronstein-chess-pre-chess-shuffle-chess)
- [Crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse)
- [Seirawan](https://en.wikipedia.org/wiki/Seirawan_chess)
- [Capablanca](https://en.wikipedia.org/wiki/Capablanca_Chess)
- [Gothic](https://www.chessvariants.com/large.dir/gothicchess.html)
- [Grand](https://en.wikipedia.org/wiki/Grand_Chess)
- [Shouse (Seirawan+Crazyhouse)](https://pychess-variants.herokuapp.com/IRVxMG72)
- [Capahouse (Capablanca+Crazyhouse)](https://www.twitch.tv/videos/466253815)
- [Gothhouse (Gothic+Crazyhouse)](https://pychess-variants.herokuapp.com/kGOcweH3)
- [Grandhouse (Grand chess+Crazyhouse)](https://youtu.be/In9NOBCpS_4)
- [Standard chess](https://en.wikipedia.org/wiki/Chess)

Additionally you can check Chess960 option in for Standard, Crazyhouse, Capablanca and Capahouse to start games from random positions with 
[Chess960 castling rules](https://en.wikipedia.org/wiki/Chess960#Castling_rules)

For move generation, validation, analysis and engine play it uses
- [Fairy-Stockfish Python3 bindings](https://github.com/gbtami/Fairy-Stockfish) fork of [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)
- [ElephantEye](https://github.com/xqbase/eleeye)
- [moonfish](https://github.com/walker8088/moonfish)
- [fairyfishnet](https://github.com/gbtami/fairyfishnet) fork of [fishnet](https://github.com/niklasf/fishnet)
- [lichess-bot-variants](https://github.com/gbtami/lichess-bot-variants) fork of [lichess-bot](https://github.com/careless25/lichess-bot)

On client side it is based on
[chessgroundx](https://github.com/gbtami/chessgroundx) fork of [chessground](https://github.com/ornicar/chessground)

## Installation
```
pip3 install -r requirements.txt --user

yarn install
gulp dev
python3 server.py
```

If you are brave enough you can try an experimental version [here](https://pychess-variants.herokuapp.com)
