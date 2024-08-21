# ![Mansindam](https://github.com/gbtami/pychess-variants/blob/master/static/icons/mansindam.svg) Mansindam (Pantheon tale)

_A variant that combines the Shogi's drop rule with strong pieces, and has no draws._

![Mansindam](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/board.png)

![Mansindam](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/promotions.png)

## Pieces
Every piece gains the additional ability to move as a non-royal King when promoted.
### Bo(步)/Pawn(P) 
![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/pawn.png)

Moves one square orthogonally forward. Promotes to Guard.

### Cho(哨)/Guard(G)
![Guard](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/guard.png)

Moves one square orthogonally or diagonally.

### Gi(騎)/Knight(N)
![Knight](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/knight.png)

Moves like a standard Chess Knight, moving to the nearest squares that do not correspond to the same file, rank, or diagonal from its current position. Promotes to Centaur. It can pass pieces on the path as it moves.

### Wi(衛)/Centaur(E)
![Centaur](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/centaur.png)

Moves like a Knight or Guard.

### Gak(角)/Bishop(B)
![Bishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/bishop.png)

Moves any number of squares diagonally. Promotes to Archer.

### Ma(馬)/Archer(H)
![Archer](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/archer.png)

Moves like a Bishop or Guard.

### Bang(方)/Rook(R)
![Rook](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/rook.png)

Moves any number of squares orthogonally. Promotes to Tiger.

### Yong(龍)/Tiger(T) 
![Tiger](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/tiger.png)

Moves like a Rook or Guard.

### Ye(猊)/Cardinal(C)
![Cardinal](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/cardinal.png)

Moves like a Bishop or Knight. Promotes to Rhino.

### Seong(聖)/Rhino(I)
![Rhino](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/rhino.png)

Moves like a Bishop, Knight, or Guard.

### Su(首)/Marshal(M)
![Marshal](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/marshal.png)

Moves like a Rook or Knight. Promotes to Ship.

### Myeong(名)/Ship(S)
![Ship](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/ship.png)

Moves like a Rook, Knight, or Guard.

### Bun(奔)/Queen(Q)
![Queen](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/queen.png)

Moves like a Bishop or Rook. Does not promote.

### Cheon(天)/Angel(A)
![Angel](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/angel.png)

Moves like a Bishop, Rook, or Knight. Does not promote.

### Yang(陽)=Eum(陰)
![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/MansindamGuide/king.png)

Moves one square orthogonally or diagonally. Does not promote. When called without distinction between Yang and Eum, it is simply called Ok(玉)/King(K). (therefore, in notation, Yang and Eum are written as 玉/K.)

## Rules

**Basics**
* The player with Yang is called White, and the player with Eum is called Black.
* White moves first and Black moves next. They move alternately until one player is defeated.
* You may not move another piece on a square with a friendly piece. Conversely, if you move another piece on a square with an enemy piece, you capture that enemy piece and move on that square.
* There is no passing a turn.
* There is no castling.
* There is no 50-move rule.

**The King**
* The state in which your King is attacked by opponent's piece is called Check. if your King has no way to get out of the opponent's check on that turn, it is Checkmate and you are defeated.
* At any time, the King cannot move to a square attacked by the opponent's pieces.

**Promotion**
* The 7th, 8th, and 9th ranks are called the Enemy camp.
* A piece is promoted when it moves to, from, or within the enemy camp.
* Promotion is mandatory. Therefore, a piece that can be promoted must be promoted.
* On a physical board, this is typically accomplished by flipping the piece upside down, as in Shogi.
* When a promoted piece is captured by an opponent, that piece loses the promotion (i.e., it returns to its pre-promotion state). This is the only way a piece is demoted.

**Drops**
* Any piece you capture is called a Handpiece (held "in hand" in Shogi terminology).
* Handpieces are placed on a Piece stand (the square plate on which you place the captured piece).
* On your turn, you may place a handpiece on any empty square instead of moving a piece on the board. (This is called a Drop.)
* You can only drop one piece on a turn.
* If you drop a piece in the enemy camp, it is not automatically promoted. Pieces are always dropped in their pre-promotion state. A piece dropped in enemy camp can be promoted only when it is moved after being dropped.
* You can deliver a check or checkmate to your opponent by dropping a piece.

**Pawn Drops**
* Unlike in Shogi, you can deliver checkmate by dropping a Pawn.
* Two or more of your own unpromoted Pawns cannot be placed on the same file. It is called Prohibition of Two Pawns.
* Pawns cannot be dropped to the last (9th) rank.

**Stalemate**
The player who can no longer move or drop pieces loses.

**Campmate**
The player whose King reaches last rank first wins. (Of course, your King cannot move to a square that your opponent is attacking.)

**Prohibition of Threefold Repetition**
Neither White nor Black can repeat the same situation three times. Even if it is not repeated in succession, if the same situation is repeated twice in one game, no one can repeat the situation again.

**Resignation**
When you resign, you declare resignation by placing your King on your piece stand. You can resign only on your turn.

**Defeat**
Defeat is determined by the following cases.
* When checkmate is delivered to you
* When the opponent's King reaches the last rank
* When you declared resignation
* When you break one or more of all the rules above
* When you break the rules of the tournament (e.g. time forfeit)
