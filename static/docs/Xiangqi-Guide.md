# Xiangqi

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Boards.png)

## What is Xiangqi?

*Xiangqi* (象棋, pronounced like “*shyang-chee*”), or Chinese Chess is a classic board game native to China and is thought to be descended from Chatturanga, the same ancestor as Chess, although some have argued the opposite. The game is very popular in China and Vietnam, and it has been said that it is the most played board game in the world. The game itself is similar to chess, although it. 

## Why learn Xiangqi?

If you enjoy Chess, Xiangqiis definitely worth trying. While slightly slower paced and longer than Chess, the game starts more open and is more geared towards fast-paced play leading to a quick endgame. Compared to Chess, Xiangqi is also far more tactical (as opposed to strategic). As with other chess variants, improving your skill in Xiangqi can also improve your skills in Chess (tactics, in particular) as well as open up new ways of thinking! [See here for more about that.](https://en.chessbase.com/post/why-you-need-to-learn-xiangqi-for-playing-better-chess)

## What are the rules of Xiangqi?

The general rules are extremely similar to Chess, so this guide will focus on the few differences. The most striking difference is that pieces are on intersections instead of squares, which is mainly an aesthetic difference. Players take turns moving pieces on a board to checkmate the enemy king. The red player traditionally moves first, followed by black, although the order is not crucial as the board is symmetric. The only other main difference from chess is that stalemates are considered losses for the player who got stalemated (i.e. can’t move any pieces).

## The Board

The xiangqi board is a little different than other chess games. In addition to being played on the intersections, there are important sections of the board. First is the river, which splits the board in half. The river affects the movement of the elephant and pawn pieces. Second is the palaces, which are the 3 x 3 squares at each end of the board that has diagonal lines inside. The king and his advisors are confined to the palace.

## The Pieces

This guide will be based on the internationalized set. Traditional sets use Chinese characters, and many sites, including Wikipedia, already explain the rules as such. As it is now, knowledge of the Chinese characters will be required if you want to utilize all English resources or play in a real life setting. Compared to shogi which is the other major game using Chinese characters, xiangqi has fewer characters to learn, and several characters are pictographic, which also makes them easier to learn.

Xiangqi pieces traditionally have had different names: their Chinese translation and a Western equivalent. In this guide, we will use the names and abbreviations chosen by the Asian Xiangqi Federation (AXF), which uses a mixture of the two. Unfortunately, both names are very common, so you should be familiar with both.

### King

![Kings](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Kings.png) 

The king (also known by its Chinese name, the **general**) can only move one step orthogonally. Additionally, it is confined to the palace.

*Special rule:* Kings are not allowed to face each other with no piece in between (“General face-off rule”). Consider them as being able to attack each other as rooks (also called “flying generals”). This is useful for setting up checkmates in the endgame.

### Advisor

![Advisors](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Advisors.png) 

The advisor (also known by its Western name, the **guard**... less commonly a **minister**)  can only move one step along the diagonals of the palace. There are only five positions an advisor can take.

![King and advisor movement](https://upload.wikimedia.org/wikipedia/commons/c/cf/XiangqiJiangShi.png)

### Elephant

 ![Elephants](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Elephants.png)

The elephant (very rarely called by its Western name, the **bishop**) can move diagonally exactly two steps. There are two more restrictions: 1) The elephant can be blocked if there is a piece in between. 2) It cannot cross the river.

On a side note, the Chinese character for the red elephant means “minister,” but is still called an elephant in English.

### Horse

 ![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Horses.png)

The horse (also called by its Western name, the **knight**) moves almost exactly like a chess knight. However, instead of the usual “two steps orthogonally, then one to the side” teaching, it’s better to think of it as *one step orthogonally, then diagonally forward in either direction*, like a Y shape. The reason for this is that the **can be blocked** if a piece is adjacent to it. That will block off the two endpoints of that Y. Therefore, there can be situations where two horses are targeting each other, but only one can attack while the other is blocked (see the Wikipedia pictures below). Strong moves take advantage of blocking the horse and limiting its movement.

 ![Horses against each other](https://upload.wikimedia.org/wikipedia/commons/a/a4/HorsePieceAgainstHorsePiece.png)

![Horse movement](https://upload.wikimedia.org/wikipedia/commons/a/aa/MovementOfHorsePiece.png)

### Chariot

 ![Chariots](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Chariots.png)

The chariot (also called by its Western name, the **rook**, and rarely by its literal modern translation, car) moves exactly like a chess rook: any number of squares orthogonally. This is the most valuable piece in the game, excluding the king.

### Cannon

![Cannons](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Cannons.png)

The cannon is a unique piece in xiangqi. It can move exactly like the chariot. However, to capture, it needs a piece (friend or foe) in between, called a screen.

![Cannon Attack](https://upload.wikimedia.org/wikipedia/commons/a/a8/XiangqiCannonJumpToCapture.png)

### Pawn

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Pawns.png)

The pawn (also called by its Chinese name, the **soldier**) moves and captures by moving forward one square. This is different than the chess pawn. The pointy hat in the internationalized piece is a reminder.

*Special rule:* After crossing the river, the pawn can move and capture sideways one space as well. The piece itself does not change to reflect this.

## Additional Rules - Perpetual checks and chases

* A player making perpetual checks with one piece or several pieces can be ruled to have lost unless he or she stops such checking.
* The side that perpetually chases any one unprotected piece with one or more pieces, excluding generals and soldiers, will be ruled to have lost unless he or she stops such chasing.
* If one side perpetually checks and the other side perpetually chases, the checking side has to stop or be ruled to have lost.
* When neither side violates the rules and both persist in not making an alternate move, the game can be ruled as a draw.
* When both sides violate the same rule at the same time and both persist in not making an alternate move, the game can be ruled as a draw.

## Notation

Algebraic notation is not implemented at this time.

### Symbols

K = **K**ing

A = **A**dvisor

E = **E**lephant

H = **H**orse

C = **C**annon

R = Cha**R**iot

P = **P**awn


## Where are resources where I can learn Xiangqi?

[Xiangqi in English] (http://www.xqinenglish.com/) is a good place for beginners. The website owner, Jim Png Hau Cheng, has also written several books, the  “Xiangqi Primer” series, which may be a worthwhile investment for serious learners.

[Club Xiangqi](https://www.clubxiangqi.com/) is a site where you can play against tough players, most of which are Vietnamese.

## Strategy

### Piece Values

Consensus piece values are as below

Piece | Value 
------------ | ------------- 
K | Infinite
R | 9
H | 4
C | 4.5
P | 1 before river or at last rank, 2 after river
A | 2
E | 2.5

### General Principles

* Similar to the knight and bishop in chess, the horse and cannon have opposing values based on the state of the board. 
  * The horse is more defensive and less powerful in the early game because of too many pieces restricting its movement. It becomes much more powerful in the endgame when there are few pieces in its way (this is the opposite of the chess knight).  
  * The cannon is more offensive and more potent in the early game because of the pieces it can use as screens. In the endgame, when the board is empty, its power decreases significantly. 
* As above, use pieces to block the horse and elephants!
* Do not think of an elephant as a bishop; they do not at all have similar roles despite their similar movement and starting position. It is strictly a defensive piece. Its offensive utility may be as a screen for a cannon.
* *Discovery attacks* are far more prevalent in xiangqi than in chess or shogi because of the blockable pieces. Be ready to use them or defend against them.
* *Double checks* are also more common, especially with the chariot and cannon in tandem.

### Opening Principles

The central cannon is by far one the most common opening, where either of the cannons is moved to the central position right behind the central pawn, which threatens the opponent’s central pawn. A common response to this is advancing either horse to protect the pawn. After that, the pawn on the same file of that horse can be advanced. This prevents the opposing pawn from advancing and consequently, keeping the horse blocked from its forward two squares.

In this sense, it’s best to think of the role of the pawn (at least in the early game) as a gatekeeper for horses.

Less common is advancing one of the elephants to the center instead, forming a much more defense position.

Like chess, development of the major pieces is very important, especially the chariot. A chariot advanced into the enemy side or even along the river is already a significant threat.
