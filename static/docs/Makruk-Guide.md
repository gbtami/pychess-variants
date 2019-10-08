# Makruk

![Makruk](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Makruk.png?raw=true)

## What is Makruk?

*Makruk*, or Thai Chess is a classic board game native to Thailand and is closely descended from Chatturanga, the same ancestor as Chess. The game is played in Thailand and Cambodia, where it is known as *Ouk Chatrang* (with slightly different rules). Markuk offers a taste of ancient Chess in the original form before the introduction of modern rules quickened the pace. The game is plenty of fun in its  own right, with its own balance/dynamics. The slightly slower pace can provide a good way to cultivate patience, and to hone strategic thinking.

Kramnik has tried his hand at Makruk, and had this insight to offer, "Makruk Thai is more strategic than International Chess. You have to plan your operations with total care since Makruk Thai can be compared to an anticipated endgame of International Chess."
 
From a Chess player's standpoint, that is fairly accurate. In fact, one obvious approach would be to trade off the unfamiliar Bishop (Khon) and Queen (Met), and enter a (hopefully) favorable endgame. But this approach will be dull and drawish. It is much more fun to embrace the different dynamics instead, and try to play with the new piece types.

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

Unlike the queen in chess, the queen is a relatively weak piece that only moves one space diagonally. Additional queens are gained through pawn promotion.

The queen is worth about 1.5 to 2 pawns in general. It is also the only renewable piece type. The queen is a good piece to lead the attacks, useful for harassing more valuable enemy pieces. On occasion, they can also be sacrificed in exchange for well-positioned enemy pawns, to make way for the invasion.
 
Since it is rare for one side to be up by two pieces, the easy-to-promote-to queen is commonly present in most endgames, assisting the stronger side in delivering checkmate.
 
For the disadvantaged side, a queen is a good decoy which must be trapped and captured before the bare king can be forced into checkmate. It can either stay near the king for additional protection, or failing that, lead enemy pieces away from it. Scattering the enemy pieces in this fashion can cost them valuable time to reorganize, thus giving the defending side some extra chance to draw the game under counting rules.

### Bishop (*Khon*)

![Bishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Bishop.png?raw=true)

The bishop moves one step diagonally or one step forward, just like the silver general in shogi.

The bishop is a powerful piece for controlling squares immediately in front of it, and for shouldering off enemy forces. It is also a good defender around its King.
 
The bishop is worth more than the queen, but generally not as much as a knight. The justification may be that isolated knights have little trouble escaping from an enemy king, while isolated bishops can fall.
 
Bishops can sometimes prove slow/awkward to maneuver or retreat. It is therefore advisable to have some friendly pieces nearby to support and rescue them. In the endgame, it's usually safer to get a lone king behind the enemy bishop, compared to staying in its front.

### Knight (*Ma*)

 ![Knight](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Knight.png?raw=true)

The knight moves exactly the same as in chess.

The knights are not "minor pieces" in Makruk. They are major forces. Centralize and utilize them.

### Rook (*Ruea*)

 ![Rook](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Rook.png?raw=true)

The rook moves exactly the same as in chess.

In the absence of mighty chess queens, the rooks dominate the board. Lateral rook checks can be especially annoying. Aim for the seventh rank or even the sixth rank.

### Pawn (*Bia*)

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Pawn.png?raw=true)

The pawn moves and attacks the same as in chess. However, there is no double-step first move. Pawns promote and move like queens when they reach the sixth rank.

## Makruk vs Sittuyin
 
Sittuyin is a game very similar to Makruk, but played in Myanmar. In a sense, Sittuyin can be thought of as a kind of accelerated Makruk, potentially skipping ahead about a dozen opening moves. Half of the Sittuyin pawns start on the fourth rank, as opposed to all Makruk pawns starting from the third rank.
 
Makruk players must negotiate their way towards getting a good opening setup from scratch, a vital skill for Makruk. Sittuyin players get to just set up their dream positions. Experience in either variant would be useful/beneficial in the other.
 
Makruk allows promoting pawns to multiple queens, which can quickly become dangerous. This makes Makruk pawns more valuable than Sittuyin pawns.

## Strategy
 
The pace is rather slow, with most pieces stepping only one square at a time. It's a good idea to organize and group together the pieces. Move them in formation as a group to provide mutual support. Do not try to open up the game on too many fronts. Coordination is key.

## Tactics
 
**Rooks are the only pieces that can pin or skewer pieces. The rest of the tactics mostly consist of forks.**

Most Sittuyin and Makruk games will actually reach the bitter (near) end.
When one side has only a bare King remaining, there are certain "counting rules" (see above) which come into effect and put pressure on the stronger side. Such requirements offer the weaker side an incentive to play out the whole game. Therefore it is crucial to master all the basic checkmates against a lone King. There just isn't much point in playing these games if one can't finish off the bare King at the end.
 
Because there is no promotion to heavy pieces, it becomes harder to force a checkmate after the existing pieces have left the board. Plan accordingly and leave yourself with enough fire power.
 
Please allow yourself enough time on the clock, as many of those mates require precision.
 
