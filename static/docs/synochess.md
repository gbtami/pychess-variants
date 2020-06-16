# ![Synochess](https://github.com/gbtami/pychess-variants/blob/master/static/icons/synochess.svg) Synochess

![Synochess](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Synochess.png)

Synochess is a chess variant designed in 2020 by Couch Tomato. The idea of the game was to create a variant where the western chess army can fight against the xiangqi or Chinese chess army in a fair manner. Given that the circumstances in xiangqi are much different (larger board, overall weaker pieces), this was difficult to achieve without significant boosts to the Chinese-style army. However, this was able to be achieved, without overall losing the feel of xiangqi when playing as the Chinese army. In this game, the white army represents the western chess side and is called the Kingdom, while the black army represents an amalgamation of xiangqi and janggi (Korean chess) and is called the Dynasty. All pieces on the Dynasty side resemble their counterpart in either xiangqi or janggi and should be familiar to those who have played those games.
The name Synochess is based off an earlier name, Sinochess, but it was changed as the Dynasty became less “Sino” (as in Chinese) and more a mixture of Chinese and Korean. Instead, the prefix syn- means together, and the game represents two different historic branches of chess coming together into one.
 
## General Rules
1.	Setup is as above. 
2.	The only pieces that the sides have in common are the kings, knights, and rooks (called chariots on the Dynasty side)
3.	The Kingdom (white) always moves first.
4.	The Dynasty (black) cannot castle.
5.	Kingdom pawns can only promote to their own pieces (queen, rook, knight, bishop).

\******

There are five additional rules that new players must be especially aware of! (Aside from learning the new pieces)

\******

1.	**King Faceoff** – As in Xiangqi, **Kings may not face each other (on a file OR rank) without intervening pieces**, as if they were two rooks facing each other. Keep this in mind, as pieces can be pinned in between, or also be supported by the allied king.
2.	**Reinforcement Soldiers** – Black starts with two soldiers in hand. Instead of moving a piece on the board, the Dynasty player can drop a soldier onto an open square in rank 5 (Dynasty’s 4th rank), the same rank where the original soldiers start.
3.	**Campmate** – A king that reaches the final rank (without moving into check) wins the game.
4.	**Stalemate** – As in Xiangqi, stalemates are a loss (in Chess, they are a draw).
5.	**Perpetual checks and chases** – As in Xiangqi, perpetual checks and chases (repeating the same moves 3 times attacking the same piece) are a loss (in Chess, they are a draw).

## Dynasty Pieces
There are four new units unique to the Horde: 6 Soldiers (2 start in hand), 2 Cannons, 2 Elephants, and 1 Advisor. 
The Chariots are equal to the Rooks and use the same abbreviation (R) – the difference is purely cosmetic. Similarly, the Kings are the same, but just appear different. Despite the Horse being different in Xiangqi and Janggi, the Dynasty’s version is also called a Knight and can leap the same way as the Kingdom’s. 
The Dynasty does not have a piece as strong as the Queen; instead it has more minor pieces than the Kingdom.
Details and diagrams of each piece are below.  
### Soldier (S)

![Soldier](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Soldier.png)
The Soldier can move either one space forward or one space sideways. It is the exact same a Xiangqi soldier that has crossed the river and the exact same as a Janggi soldier from the start. The soldier, unlike the pawn, cannot promote.
Because the soldier cannot move backwards, it can only move sideways in the final rank. Avoid putting them in this situation unless it will lead to checkmate or campmate. Soldiers are strongest when paired side to side so that they can protect each other.

### Elephant (E)

![Elephant](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ElephantDynasty.png)
 
The Elephant is a leaping piece that moves diagonally one or two spaces. Because it is a leaper, it can jump over an intervening piece to move or capture on the second space. The piece is essentially a powered-up version of the Xiangqi elephant; it is the exact same as the elephant in another variant, Shako.

### Cannon (C)

![Cannon](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/CannonDynasty.png)
 
The Cannon is a hopping piece. It is essentially a rook that requires an intervening piece (often called a “screen”) to hop over before it can move or capture along that line. *****A cannon cannot hop over another cannon.***** This version of the cannon is the exact same as the one in Janggi. Because it requires another piece to move or capture, the cannon loses value in the endgame.
 
### Advisor

![Advisor](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Advisor.png)

The Advisor moves and captures exactly like a king. Unlike the king, it can be captured. While there is no equivalent piece in Xiangqi or Janggi, there is no palace in Synochess. As such, the Advisor needed to be stronger in order to protect its king, and one might think of its movements as combining the strength of two Xiangqi advisors to cover all 8 squares.

 
## Piece valuation

Accurate piece values are unknown. However, these are the values used by Fairy Stockfish, noting that they are generic values, not necessarily specific to Synochess.

Kingdom piece	| Value (Early / Late) | Dynasty piece | Value (Early / Late)
-- | -- | -- | --
Pawn | 120 / 213	| Soldier | 200 / 270
Queen | 2538 / 2682	| Advisor | 700 / 900
Bishop | 825 / 915	| Elephant | 700 / 650
Knight | 781 / 854	| Cannon | 700 / 650
Rook | 1276 / 1380	| Knight | 781 / 854
 | | | Chariot | 1276 / 1380

For those who want a more simplified approach, this table may be an approximation.

Kingdom piece	| Value | Dynasty piece	| Value
-- | -- | -- | --
Pawn | 1 | Soldier | 2
Queen	| 9 | Elephant | 2.75
Bishop | 3 | Advisor | 2.75
Knight | 3 | Cannon | 3
Rook | 5 | Knight | 3
 | |  | Chariot | 5

## Strategy
The game is still young, so strategy is still being developed! Much of the data is currently based on Engine play.
Like Xiangqi, the first few moves of the opening are very limited before the game branches out. In a vast majority (~90%) of games, Stockfish opens up with 1. e3. If white does not start with e3, then b3 is the next most common. Other moves include g3, f3, and c3, but are extremely rare. All other openings for the first move are suboptimal. b3 is the most common second move for white. c3 is also played occasionally. For the third white move, there is much more variation, although Bb2 is by far the most common.
As for the Dynasty, the most common starting move is Nc3 (70%), or to a lesser extent, Nf3 (30%). No other moves are even attempted by Stockfish. The second move either involves advancing the other knight or moving a cannon to a center position (Ce6+ > Cd6) or advancing the other knight. From that point on, the moves branch significantly.

Therefore, the “standard Nc3 opening” is as follows:
1.	e3 Nc6
2.	b3 …Nf6/Ce6+/Cd6

The most common line developing the standard Nc3 opening is the following:

1.	e3 Nc6
2.	b3 Nf6
3.	Bb2 Ee7

For players who may prefer Nf6, the most common line for that is:

1.	e3 Nf6
2.	b3 Ce6+
3.	Be2 Nc6

As in Xiangqi, discovered attacks are very frequent. Make sure to keep an eye out for them!
Also like Xiangqi and perhaps even more so, using kings offensively is important. It is very easy to pin a piece in between the kings. For example, a single pawn in between cannot attack because it is pinned along that file.
The Dynasty played needs to play aggressively. It starts with an advanced position, but overall weaker pieces. It needs to seek trades that are in its favor. Soldiers are worth more than pawns, so the Dynasty should make the Kingdom work hard to remove a soldier.  
