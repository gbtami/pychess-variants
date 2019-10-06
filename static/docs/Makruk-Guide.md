# Makruk

![Makruk](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Makruk.png?raw=true)

## What is Makruk?

*Makruk*, or Thai Chess is a classic board game native to Thailand and is closely descended from Chatturanga, the same ancestor as Chess. The game is played in Thailand and Cambodia, where it is known as *Ouk Chatrang* (with slightly different rules).

## Rules

The general rules are extremely similar to Chess, so this guide will focus on the few differences. The major difference is the some pieces having different moves and the starting positions, with the pawns starting on the third rank. There is no castling as in chess. Stalemates are draws, as in chess.

### Counting Rules

When neither side has any pawns, the game must be completed within a certain number of moves or it is declared a draw. When a piece is captured the count restarts only if it is the last piece of a player in the game.
* When neither player has any pawns left, mate must be achieved in 64 moves. The disadvantaged player counts, and may at any time choose to stop counting. If the disadvantaged player checkmates the advantage side and did not stop counting, the game is declared a draw.

When the last piece (that is not the king) of the disadvantaged player is captured, the count may be started, or restarted from the aforementioned counting, by the weaker player, and the stronger player now has a maximum number of moves based on the pieces left:
* If there are two rooks left: 8 moves
* If there is one rook left: 16 moves
* If there are no rooks left, but there are two bishops: 22 moves
* If there are no rooks or bishops left, but there are two knights: 32 moves
* If there are no rooks left, but there is one bishop: 44 moves
* If there are no rooks or bishops left, but there is one knight: 64 moves
* If there are no rooks, bishops or knights left, but only queens: 64 moves

The disadvantaged player announces the counting of his fleeing moves, starting from the number of pieces left on the board, including both kings. The winning player has to checkmate his opponent's king before the maximum number is announced, otherwise the game is declared a draw. During this process, the count may restart if the counting player would like to stop and start counting again.
For example, if White has two rooks and a knight against a lone black king, he has three moves to checkmate his opponent (the given value of 8 minus the total number of pieces, 5). If Black captures a white rook, the count does not automatically restart, unless Black is willing to do so, at his own disadvantage. However, many players do not understand this and restart the counting while fleeing the king.


## The Pieces

Thai piece names are in parentheses.

### King (*Khun*)

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/King.png?raw=true) 

The king moves exactly the same as in chess.

### Queen (*Met*)

![Queen](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Queen.png?raw=true)

Unlike the queen in chess, the queen is a weak piece that only moves one space diagonally.

### Bishop (*Khon*)

![Bishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Bishop.png?raw=true)

The bishop moves one step diagonally or one step forward, just like the silver general in shogi.

### Knight (*Ma*)

 ![Knight](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Knight.png?raw=true)

The knight moves exactly the same as in chess.

### Rook (*Ruea*)

 ![Rook](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Rook.png?raw=true)

The rook moves exactly the same as in chess.

### Pawn (*Bia*)

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Pawn.png?raw=true)

The pawn moves and attacks the same as in chess. However, there is no double-step first move. Pawns promote and move like queens when they reach the sixth rank.
