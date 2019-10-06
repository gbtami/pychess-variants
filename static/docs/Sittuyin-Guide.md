# Sittuyin

![Sittuyin](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Sittuyin.png?raw=true)

## What is Sittuyin?

*Sittuyin*, or Burmese Chess is a classic board game native to Myanmar and is very similar to Makruk. The game is played in Myanmar, and although western chess is more popular there, there are efforts to revitalize the game. The pieces have the same movements as Makruk (Thai Chess), but the rules are slightly different.

## Rules

The general rules are extremely similar to Chess, so this guide will focus on the few differences. The boards are slightly different, with Sittuyin having two big diagonal lines dividing through the board. The sides are also red and black, with the red player moving first. The piece position in Sittuyin is much different compared to chess or Makruk. Key differences are as follows.

* For starters, the feudal lords (pawns) start on staggered ranks (as you can see in the board above). 
* To start the game, the players (starting with the red player) alternate back and forth placing the remainder of their pieces on their halves of the boards.
* Pawn (feudal lord) promotion works much differently. See the movement section below. 
* Creating stalemate is illegal. 

## The Pieces

### King

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/King.png?raw=true) 

The king moves exactly the same as in chess.

### General

![General](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/General.png?raw=true)

Unlike the queen in chess, the general is a weak piece that only moves one space diagonally.

### Elephant

![Elephant](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Elephant.png?raw=true)

The elephant moves one step diagonally or one step forward, just like the silver general in shogi.

### Horse

 ![Horse](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Horse.png?raw=true)

The horse moves exactly the same as a knight in chess.

### Chariot

 ![Chariot](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Chariot.png?raw=true)

The chariot moves exactly the same as a rook in chess.

### Feudal lord

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Pawn.png?raw=true)

The feudal lord moves and attacks the same as a pawn in chess. However, there is no double-step first move. 

**Promotion**: After a feudal lord reaches the diagonal line on the opponent's side of the board, the player can choose to promote that piece into a general instead of moving. This can only occur *if* their general has already been captured. Promotion does not happen on the move where the feudal lord reaches the promotion square, but rather any move after that. In the act of promotion, the feuudal lord can promote in place, or it can promote in any one of the adjacent diagonal squres. However, promotion cannot be made in a square in which the new general will be in an attacking position (threatening an enemy piece). If there is one feudal lord left on the board, then it has the ability to promote on its turn.

Finally, you may opt not to promote a feudal lord that reaches the final rank, which would result in stalemate if this is the last piece left.
