# ![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Chak.svg) Chak

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Chak.png)

## Background

The game of chess first arose from India (or so the common theory states), from where it evolved into western Chess in Persia where it spread to Europe and developed its modern form. East Asia has multiple rich forms of chess that offer something new but also infuse their culture into it. Many cultures throughout the world have a chess of their own. However, what about the native peoples of the Americas? Mesoamerica once had great empires. What if they had a chess of their own? 

Chak is a game designed by Couch Tomato in 2021 specifically to answer this hypothetical question. The design philosophy was to start from scratch and use only the common elements from all forms of chess: a king, a rook-type piece, a knight-like piece, and some sort of pawns; the rest would develop organically infusing a specific Mesoamerican culture -- in this case, the Maya. For example, for the Maya and other Mesoamerican cultures, the native religion with ritual sacrifice was a fundamental part of society; the concept of an offering to the gods as well as the large temples are a key part of the game. 

The name Chak itself is derived from the Mayan God Chaac, the rain deity who possesses war-like fury. This matches the setting of Chak, which is a battlefield along a river. Finally, two words of warfare in Mayan epics include “Chuc-ah” (capture) and “Ch’ak” (decapitation).  In Chak, these are utilized as the win conditions of altar mate, and checkmate, respectively.

## Introduction and General Rules

There are two sides, designated white and green, respectively. White moves first.


### Board

Chak is played on a 9x9 board as seen below:

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakBoard.png)

There are three special regions:

-**River**, a special rank that marks the boundary for promotion. When certain pieces (the king and the pawn) move into the river, they promote. However, *they cannot move back behind the river*. Promoted pieces are committed to moving in the river and enemy side of the board for the rest of the game!

-**Temple**, a 3x3 region that has no special function. However, this symbolically represents the start of the king and contains the altar, which is described next. Strategically, the temple is important because many special tactics take place in this region.

-**Altar**, the central square of the temple. Moving your king into the enemy’s altar is one of the main methods of victory.

### Goals of the Game

There are four ways to win:

**Checkmate** - Put the king in check with no legal moves.

**Stalemate** - A player with no legal moves loses (unlike in Chess, where it is a draw). This is considered a subset of checkmate in Chak.

**Altar mate** - Move your promoted king to the opponent’s altar without being in check to win.

**Resignation** - Your opponent resigns.

Other game-end conditions result in a draw:

**Repetition** - The same position is repeated three times.

**50 moves** - A draw can be claimed if no capture has been made in the last 50 moves.

**Draw offering** - A player offers a draw and the other player accepts.


## Pieces

### King (K)
![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakKing.png)

The King (*Ajaw*, which rhymes with Dachau) moves like a king in most classic forms of chess: one square in any direction. However, what is unique about the king in Chak is that it can promote upon reaching the river.

### Divine King (D)
![Divine King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/DivineKing.png)

The Divine King moves up to *two* squares in any direction. It can also pass through squares that are threatened by the opponent’s pieces (in other words, it is not like the western Chess king that cannot castle through check). Remember that as a promoted piece, it cannot go back beyond the river! The Diving King has the ability to end the game by reaching the altar without moving into check. Because of its range, the Divine King has the ability to deliver checkmate on an unpromoted king.

Note that the symbol used only differs slightly from the king’s. They are meant to be the same, but the slight difference is to help players see the promotion and also for the two types of king to be distinct on the board editor.

### Jaguar (J)
![Jaguar](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Jaguar.png)

The Jaguar moves like a hybrid knight and king: in detail, that is either 1) a leaping movement going two spaces in one direction and then one perpendicular to make an L shape, or 2) moving one step forward in any direction. This is generically also referred to as a “centaur” piece, and is the same as the Kheshig from Orda Chess. 

The Jaguar is the most powerful piece in Chak, and its ability to fork multiple pieces make it incredibly dangerous.

### Quetzal (Q)
![Quetzal range](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalRange.png)
The Quetzal is a tricky piece; it is similar to the Chess queen in that it can move any number of squares in any direction (orthogonally or diagonally)… *However*, it needs to jump over an intervening piece first to do so. For those familiar with Janggi, this is similar to the cannon in that game, but with the addition of diagonal movement.

The Quetzal is the second most powerful piece in Chak, but loses value significantly in the endgame.
![Quetzal example](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalLegal.png)

*Example*: In the following image, the quetzal can move the following spaces (red circle indicates capture).

### Shaman (S)
![Shaman](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Shaman.png)

The Shaman moves one space diagonally or one space orthogonally forward or backwards.

The Shaman is one of the weakest pieces and is typically used more defensively due to its slow movement.

Note that the piece symbol also helps to remind you of its movement.

### Vulture (V)
![Vulture](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Vulture.png)

The Vulture is identical to the Chess Knight:  a leaping movement going two spaces in one direction and then one perpendicular to make an L shape.

### Serpent (R)
![Serpent](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Serpent.png)

The Serpent is identical to the Chess Rook:  orthogonal movement any number of spaces. This is the third strongest piece, after the Jaguar and Quetzal.
### Pawn (P)
![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakPawn.png)

The Pawn can move either one square forward or one square sideways without capturing. To capture, it attacks one of the two forward diagonal squares. This is the same as a western Chess pawn, but with the added ability to move sideways. Once the pawn reaches the river, it promotes into a promoted pawn, or Warrior.

### Warrior (W)
![Warrior](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakWarrior.png)

The Warrior (or Promoted Pawn) moves exactly like a shaman: one space diagonally or one space orthogonally forward or backwards. Unlike the shaman, it cannot move backwards across the river.

Note that the symbol used only differs slightly from the pawn’s. They are meant to be the same, but the slight difference is to help players see the promotion and also for the two types of pawns to be distinct on the board editor.

### Offering (O)
![Offering](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Offering.png)

The Offering does not move or capture; it blocks the altar until captured. The piece exists not only for thematic purposes (serving as the offering at each player’s own altar), but also serves as a mount for the quetzal. Finally, because of its position, it also helps prevent your altar from a lone divine king if your own king has not left the temple, potentially forcing a draw if all other pieces are off the board. Without the offering, the divine king would be able to displace the defending king and take the altar.




## Piece valuation

Accurate piece values are unknown.  However, the following piece ranking is generally accepted: Jaguar > Quetzal > Serpent > Vulture > Shaman > Warrior > Pawn.

## Strategy

One primary tip for beginners is always pay attention to the lines of sight for the quetzal. Specifically, at the beginning of the game, any piece that moves in front of the quetzal opens it up to an attack on the opposing jaguar, which is a slightly favorable move.

Regarding the jaguar, build defenses and prevent the jaguar from crossing the river. If the jaguar crosses before your pieces are coordinated, it can singlehandedly capture multiple pieces with ease.

Tempo is very, very important in Chak, as it ultimately boils down to a race to get your king to the other side. Positional play is also very important. 
