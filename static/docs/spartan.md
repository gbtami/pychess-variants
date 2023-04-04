# ![Spartan](https://github.com/gbtami/pychess-variants/blob/master/static/icons/spartan.svg) Spartan Chess

![Spartan](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Spartan.png)

Spartan Chess is a chess variant created by Steven Streetman (rules recorded in 2010) and is one of the most popular variants to use asymmetric armies. This was also balanced before the time of modern engines such as Fairy Stockfish. 

Spartan Chess reflects the asymmetric war between the ancient Spartans and Persians. The Black side represents the Spartans and the White the Persians. The Persians have pawns, pieces, an initial placement and move in accord with the rules of orthodox chess. The Spartans have two Kings and with the exception of their Kings, every Spartan playing piece moves differently from any piece found in orthodox chess.
 
## General Rules
1.	Setup is as above.
2.	Persian pieces (AKA White) are unchanged from orthodox chess. Spartan pieces are almost all new and described below.
3.	The Persians (AKA White) *always moves first*.
4.	The Spartans (AKA Black) cannot castle.
5.	Spartans have two kings. Therefore, the win condition for the Persians (White) is different: Capture one of the Spartan kings and checkmate the other... OR place both under simultaneous attack ("duple-check") such that neither king can be removed from attack on the next move.
6.	Persian pawns and Spartan hoplites can promote to their own respective pieces upon reaching the 8th rank. For the Spartans, this also includes the king but only if there is only one remaining king in play.
7.	There is no en passant.

## Spartan Pieces
There are four new units unique to the Spartans: 8 Hoplites, 1 Warlord, 1 General, 2 Lieutenants, and 2 Captains.

For the images below, the following convention is used:
* Circles are where the piece can move unimpeded. This includes jumping.
* Arrows are ranging moves where the piece can move as far as it can go until it comes across another piece.
* Green = Can both move and capture
* Blue = Can move but not capture
* Red = Can capture only

### King (K)

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanKing.png)
 
The King moves exactly like the orthodox chess King, one square in any direction. The main difference is that the Spartans have two kings. One can be captured normally, but when the second is mated, the Spartans lose. Also, when both kings are attacked simultaneous, this is called duple-check (this is not the same as the classic term double check, where two separate pieces both check the same king). If neither can can escape duple-check, then the Spartans lose.

### Hoplite (H)

![Hoplite](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanHoplite.png)
 
The Hoplite is the Spartan pawn, and for those familiar with fairy pieces, it is essentially a Berolina pawn. A Berolina pawn is the functional opposite of an orthodox pawn. While an orthodox pawn moves (but cannot capture) one step forward and captures one step diagonally forwards. The Hoplite moves (but cannot capture) one step diagonally forwards and captures forwards.

Additionally, the Hoplite can move one OR two squares diagonally on its first move, much like how the Persian pawn can move two squares orthogonally forwards on its first move. **The two square movement is also a jumping movement, which means it can *hop* over intervening pieces.**

As stated above, upon reaching the 8th rank, the Hoplite can promote to any Spartan piece. This includes a king if there is only one king remaining.

### General (G)

![General](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanGeneral.png)
 
The General (*Strategos*) moves as a rook combined with a king. That is, it can move any number of squares orthogonally or one square diagonally. This is like the dragon king from Shogi.

### Warlord (W)

![Warlord](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanWarlord.png)
 
The Warlord (*Polemarchos*) moves as a bishop combined with a knight (i.e. archbishop). That is, it can move any number of squares orthogonally, or leap in a 2x1 rectangle.

### Captain (C)

![Captain](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanCaptain.png)
 
The Captain (*Tyntagmatarchos*) moves one or two squares in any direction orthogonally. It can jump over blocking friendly/enemy pieces to reach the second square.

### Lieutenant (L)

![Lieutenant](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/SpartanLieutenant.png)
 
The Lieutenant (*Tagmatarchos*) moves one or two squares in any direction diagonally or can move (but not capture) one square sideways. It can jump over blocking friendly/enemy pieces to reach the second square. 
 
## Piece valuation

The following Spartan piece values are proposed by the game creator:

Warlord = 8

General = 7

Extra King = 5

Lieutenant = 3

Captain = 3

Hoplite = 1

## Strategy
With different armies different strategies are effective for Persian and Spartan.

**Spartan Strategy**
* Closed Game - With so many pieces that can jump a closed game favors the Spartan. It is often best to avoid exchanges when possible.
* Hoplite Mobility - Use the superior mobility of the hoplite over pawns to dominate a section of the board.
* Phalanges - When two are more hoplites are in a column one behind the other this is a phalanx. One or more phalanges can be powerful and the bulwark of a Spartan position.
* Patience - With more Spartan pieces on foot, the Spartan has more short range pieces. Be patient, develop and advance all your pieces.
* Kings Attack - When you have 2 Kings in play, advance and attack with them too. Kings can be a powerful addition to an offensive.
* Check Immunity - Keep both Spartan Kings in play as long as you can to preserve the Spartan advantage of check immunity.
* Quick Victory - A quick, early and long range victory is sometimes possible when your General and Warlord combine in an attack.

**Persian Strategy**
* Open Game - Having more long range pieces an open game favors the Persian. Seek favorable exchanges to open the board and exploit your pieces' superior mobility.
* Attrition - With the Spartan having two Kings a quick victory is seldom if ever possible. Wear the Spartans down.
* Maneuver - Always look for open lines where your superior mobility can be exploited.
* Neutralize hoplites - Hoplite mobility can often be neutralized by placing a piece on both diagonals in front of them.
* Regicide - Look to exchange a minor piece for a Spartan King as early as possible ending Spartan check immunity.
* Counter-Punch - Wherever the Spartans advance look to counter attack and force favorable exchanges. Then look for an open flank and rush your Rooks and Queen there.
