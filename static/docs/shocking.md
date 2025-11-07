# Shocking Chess
## Preface
I like asymmetric variants, so I decided to make one for this contest. A major goal of mine in creating the new army, the Robots, was to use a collection of Pieces whose movements made sense with each other. As such, except for the Rover, every Piece belonging to the Robots is derived from a chess piece or common fairy chess piece in a similar way.
## Rules
I will go over only the differences to chess here, so you should learn how to play chess before reading these rules for them to make sense.
1. The black army from normal chess is completely replaced by a new set of Pieces called the "Robots"; their movements are explained in the next section. The white army from normal chess remains the same, but it is called the "Kingdom" to fit with the other asymmetric variants.
2. If a Robot Piece on the left side of the Board is adjacent to a Robot Piece on the right side of the Board, the Robots always immediately lose. This counts horizontal, vertical, and diagonal adjacency, though vertical adjacency doesn't actually matter here. This rule still applies if the Robots manage to Checkmate the Kingdom while moving so as to create the situation described; the Kingdom would Win in that case despite being Checkmated. This rule should not be taken to mean that it is illegal for the Robots to create that situation; they may do it, but they will lose if they do so.
3. The Robots are in Check if either of their Cores is under Attack. Whenever they are in Check, they must end their turn such that neither of their Cores is under Attack; if this is impossible, they are checkmated.
4. Turrets and Automata must Promote to Rover, Droid, or Missile upon reaching Rank 1.
## Pieces
Most Robot Pieces are Robotic versions of chess pieces or common fairy chess pieces. A Robotic piece has all the moving and capturing abilities of the original piece and some more. Specifically, if an ordinary piece's movement would bring it on top of another piece, the Robotic version of that piece would be able to hop over that other piece to go 1 Square further. For example, imagine we have an ordinary piece that would be able to move from a1 to c1 were c1 unoccupied, but c1 is occupied. The Robotic version of that piece would then be able to hop to d1; it could still Capture on c1 if applicable, so in that case, it could go to either c1 or d1. Robotic versions of pieces don't get the ability to capture in directions that they couldn't capture before, so a Robotic version of a pawn wouldn't be able to capture vertically. The same goes for Moving without Capturing, so a Robotic version of a Pawn wouldn't be able to Move diagonally without Capturing.
### Missile
This is a Robotic version of a rook.
### Drone
This is a Robotic version of a bishop.
### Turret
This is a Robotic version of a pawn. It can Capture _en passant_. It can't double-step.
### Core
This is a Robotic version of a king. It can't castle, though.
### Automaton
This is a Robotic version of a Berolina pawn. It can't Capture _en passant_, though. It also can't double-step.
### Rover
The Rover is not actually a Robotic version of any Piece. It's completely new. It can Move and Capture 1 Square diagonally, or it can Move and Capture like a [xiangqi](https://www.pychess.org/variants/xiangqi) horse.
## Starting Position
Drones are on a8 and h8. Cores are on b8 and g8. Missiles are on a7 and h7. Rovers are on b7 and g7. Automata are on c7, f7, c8, and f8. Turrets are on a6, b6, c6, f6, g6, and h6. The Kingdom's Pieces are in their usual locations from chess.
