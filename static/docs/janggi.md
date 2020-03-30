# ![Janggi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Janggi.svg) Janggi

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Boards.png)

*Janggi* (장기, pronounced like “*jahng-ghee*”), or Korean Chess, is a classic board game native to Korea. The game is derived from Xiangqi and is very similar to it.

## Rules: Board and Setup

There are two sides, one is colored red (called Han), and the other blue (called Cho). The blue side can also be colored green. These two sides represents the two sides in the Chu-Han Contention from Chinese history. Red pieces are written using Chinese characters (hanja), while blue pieces are written in cursive-style hanja.

Setup for all pieces except for the horse and elephant are as in the picture above. Like xiangqi, janggi is placed on a 9 x 10 board, where pieces are placed on intersections rather than squares. The 3x3 square with the X on each side is called the *Palace*. Unlike in most other chess variants, in janggi, players can choose the starting positions of the horses and elephants. There are four types to choose from:

1. Both horses are closer to the edge (won ang ma)
2. Both horses are closer to the general (yang gwee ma)
3. Left inner horse, right outer horse (gwee ma)
4. Left outer horse, right inner horse (mat sang jang gi)

Red (Han) chooses his positioning first, then Blue (Cho) chooses. However, Blue is the first to move the pieces.

## Rules: Gameplay

Like chess, the goal is to checkmate the other king. Also like chess, repetition and perpertual check (same position three times) are draws.

Unlike most other chess variants, you may pass in Janggi. Therefore, stalemate is impossible.

Unlike Xiangqi, the kings may face each other on the same file in Janggi. This creates a situation called **bikjang**. If the next player to move does not move the king away, then the game ends in a draw. For tournaments that don't allow draws, the value of the pieces on the board are counted up, and the player with the higher value wins.

Piece | Value 
------------ | ------------- 
Chariot | 13
Cannon | 7
Horse | 5
Elephant | 3
Advisor | 3
Pawn | 2

Because blue (Cho) starts the game, they start with an advantage and thus red (Han) also receives 1.5 points (*deom*) to avoid ties.

Currently, Pychess uses tournament style and does not allow draw. Therefore, games are settled by points when bikjang, repetition, or perpetual check occurs.

## Differences from Xiangqi

Aside from the rules above...

* There is no river in Janggi. Consequently, pawns and elephants move differently. Pawns can move sideways from the start. The Elephant moves completely differently (see below).
* Visually, pieces are on octagons rather than circles. Piece sizes also vary based on value. Kings (generals) are named after the two sides rather than being called "general." Boards use x's instead of crosses for starting pieces.
* The Kings start in the middle of the palace instead of the back of the palace.
* Cannons are different in that they both move and capture the same way (by jumping over a piece first). They also have additional restrictions.
* The Palace affects all piece movement except the Horse and Elephant. Kings and advisors only moves along the lines. Chariots, cannons, and pawns can move along the diagonals.

## The Pieces

This guide will be based on the internationalized set. Traditional sets use Chinese characters (hanja), and many sites, including Wikipedia, already explain the rules as such.

Several piecs have special movement in the Palace, which will be discussed below. In the diagrams, a lighter shade of green is used.

### King

![Kings](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Kings.png) 

The King (also known by its Chinese name, the **general**) is restricted to the palace and can only move within lines of the palace. This means that when the King is in the center, it has 8 possible moves. However, on any other spot in the Palace, it only has 3 moves.

*Special rule:* When a King faces the other King, this causes *bikjang*. The next player must then move his king out of the way or else they draw. See rules above regarding draws.

![King and advisor](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Palace.png)

### Advisor

![Advisors](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Advisors.png) 

The Advisor (also known by its Western name, the **guard**) moves exactly like the King, which is one space along lines within the palace. Like the King, the advisor is confined to the palace.

### Horse

 ![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Horses.png)
 
 ![Horse movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/HorseDiagram.png)

The horse (also called by its Western name, the **knight**) moves almost exactly like a chess knight. However, instead of the usual “two steps orthogonally, then one to the side” teaching, it’s better to think of it as *one step orthogonally, then diagonally forward in either direction*, like a Y shape. The reason for this is that the **can be blocked** if a piece is adjacent to it. That will block off the two endpoints of that Y. Therefore, there can be situations where two horses are targeting each other, but only one can attack while the other is blocked. Strong moves take advantage of blocking the horse and limiting its movement.

### Elephant

 ![Elephants](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Elephants.png)
 
 ![Elephant movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/ElephantDiagram.png)

The Elephant is much different than its xiangqi counterpart. Movement is similar to the horse in that it moves in a Y-shaped pattern. While the horse moves one step orthogonally and then one step further diagonally, the elephant moves one step orthoganally and then *two* steps diagonally. The elephant, like the horse, can be blocked on any intervening point along this path.

### Chariot

 ![Chariots](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Chariots.png)
 
 ![Chariot movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/ChariotDiagram.png)

The Chariot (also called by its Western name, the **rook**) moves exactly like a chess rook: any number of squares orthogonally. This is the most valuable piece in the game, excluding the king.

*Palace move*: When in the palace, the chariot can also move along the diagonal lines.

### Cannon

![Cannons](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Cannons.png)

![Cannon movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/CannonDiagram.png)

The Cannon is slightly different than its xiangqi counterpart. It moves orthogonally like the chariot, but it needs an intervening piece (called a "screen") to hop over first. It can then capture the next piece along the same line. Unlike xiangqi, the Cannon cannot move without a screen.

*EXCEPTION*: The cannon cannot use another cannon as a screen. Additionally, it can't capture the opponent's cannons.

*Palace move*: When in the palace, the cannon can also move along the diagonal line. Practically speaking, the cannon must be on one corner, where it can move or attack the opposite corner if a non-cannon piece is in the center (as in the diagram).

### Pawn

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Pawns.png)

![Pawn movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/PawnDiagram.png)

The Pawn (also called by its Chinese name, the **soldier**) moves and captures by moving forward or sideways one square. This is different than the xiangqi pawn, which needed to cross the river first to move sideways.

*Palace move*: When in the palace, the pawn can also move forwards along the diagonal lines.

## Notation

Algebraic notation is not implemented at this time.

### Abbreviations

K = **K**ing

A = **A**dvisor

E = **E**lephant

H = **H**orse

C = **C**annon

R = Cha**R**iot

P = **P**awn


## Strategy

Available strategies in English are rather limited. So if anyone has anything to add, please let us know!

### Piece Values

Piece | Value 
------------ | ------------- 
Chariot | 13
Cannon | 7
Horse | 5
Elephant | 3
Advisor | 3
Pawn | 2

As discussed above, these values are also used when deciding a draw.
