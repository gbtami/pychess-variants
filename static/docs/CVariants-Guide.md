# Intro

A lot of chess variants are available to play here. The rules presented here will assume you know how to play chess first, and so only the differences will be discussed. If you don’t know how to play chess, you must start with that first!

# Standard Board + Piece Variants

## Chess960 (Fischer’s Random Chess)

### Intro

Chess960 was created by Bobby Fischer to make the game more variable and remove a lot of the rote memorization for openings that standard chess forces you into. This is one of the most popular variants, and it will separate those who have truly mastered strategy and tactics from those who rely on memorizing opening lines.

This can be played by checking the 960 box for a standard chess game.

### Rules

The starting bottom ranks are randomized, but two rules must be followed:

* The bishops must be placed on opposite-color squares.
* The king must be placed on a square between the rooks.

Castling is the other major rule to take note of. Basically, regardless of where the rooks are, if you castle, the end position will be the same as if the rooks were in standard position. For example, a queenside castle will result with the king on the c file and the rook on the d file (notation: 0-0-0).

All other rules are the same.

### Strategy

Normal chess strategy and tactics apply, except for openings! Since the starting position is random, standard opening lines don’t apply.

## Crazyhouse

### Intro

Crazyhouse is a popular variant where captured chess pieces can be dropped back on the board as your own piece (as in Shogi). This leads to a much different game than standard chess. A competitive scene also exists for crazyhouse.

### Rules

As above, drops can be performed with captured pieces. This would be in lieu of moving a piece on the board. These are noted with @. So for example,R@e4 means rook drop at e4. The rules for dropping pieces are as follows:

* Drops resulting in immediate checkmate are permitted. Unlike in shogi, this includes pawn drops.
* Pawns may not be dropped on the players' 1st or 8th ranks.
* Pawns that have been promoted and later captured are dropped as pawns.
* Dropped white and black pawns on the 2nd and 7th ranks, respectively, are permitted to make a two-square move as their first move after the drop.
* A dropped rook can't castle.

### Strategy

Strategy [as on Lichess](https://lichess.org/variant/crazyhouse)

* Pawns and knights increase in relative importance in Crazyhouse, while rooks, queens, and bishops decrease in relative importance. If a king is put in check by any of the latter three pieces, from two or more squares away, dropping a pawn next to the king becomes defensively useful. A knight, on the other hand, cannot be blocked by anything and its offensive value is more manifest. That piece can be used effectively to maintain a strategic influence over a region.
* After an early exchange of queens, it is usually unwise to reintroduce the queen too soon, particularly if she can be harassed by dropped minor pieces. Careful preparation is needed in order to reintroduce the queen to maximum effect
* Pawns could be dropped deep in the enemy position where, for example, they can fork pieces or give an uncomfortable check.
* Initiative is paramount.

## Placement Chess

Different than the “Placement Chess” described on Chess Variants, this variant is simply a modification where players take turns placing their back rank pieces. Castling only works when the king and the corresponding rook are in their normal position.

# Princess and Empress Variants

All the variants in this section use the fairy chess pieces of the Princess and Empress, with the major differences being board size and starting position. 

### Princess

![Princess](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Princesses.png?raw=true)

![Princess moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Archbishop.png?raw=true)

The princess is a compound piece combining the moves of the **bishop** and the **knight** and is known by different names dependending on the variant:

* **Archbishop (A)** in Capablanca chess
* **Cardinal (C)** in Grand chess
* **Hawk (H)** in Seirawan chess

The piece is often symbolized with a combination of a knight and bishop; most variants often do not specify how the piece should look otherwise (which is why we offer different piece sets to choose from). However, Yasser Seirawan specifically uses a hawk in Seirawan chess.

The princess is unique in that it is the only piece that can checkmate on its own, which you may be able to appreciate if you look at its movement/attack pattern.

The value of a princess is considered slightly better than a rook, but less than the empress and queen.

### Empress

![Empress](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Empresses.png?raw=true)

![Empress moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Chancellor.png?raw=true)

The empress is a compound piece combining the moves of the **rook** and the **knight** and is known by different names dependending on the variant:

* **Chancellor (C)** in Capablanca chess
* **Marshal (M)** in Grand chess
* **Elephant (E)** in Seirawan chess

The piece is often symbolized with a combination of a knight and rook; most variants often do not specify how the piece should look otherwise (which is why we offer different piece sets to choose from). However, Yasser Seirawan specifically uses an elephant in Seirawan chess.

The value of a princess is considered better than a princess, but equivalent or slightly less than a queen.

## Capablanca Chess

![Capablanca setup](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Capablanca.png?raw=true)

### Intro

Capablanca chess was created by World Chess Champion José Raúl Capablanca in the 1920s 

### Rules

The game is played on a 10 x 8 board, with additional files for the new Archbishop (Knight/Bishop) and Chancellor (Knight/Rook) pieces between the Bishop and Knight. The archbishop is on the queen side, and the chancellor is on the king side. For castling, the king then moves three squares instead of two. Pawns may promote to the archbishop and chancellor as well.

### Strategy

Pending

## Grand Chess

![Grand Chess setup](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Grand.png?raw=true)

### Intro

Grand Chess was created by Christian Freeling in 1984 and is one of the highest regarded chess variants.  

### Rules

The game is played on a 10 x 10 board, with additional files for the new Marshal (Knight/Rook)  and Cardinal (Knight/Bishop), which are both placed on the king side. Because of the larger board size, most of the starting pieces are moved up one rank, with the exception of the rooks which remain in the last ranks.

In addition to the pieces and setup, there are three other significant differences:

* Pawns can promote when reaching the eighth or ninth rank. Promotion must happen upon reaching the 10th rank. If not possible (see next point), then the pawn can’t move.
* Pawns can only promote to pieces of the same color that have been lost.
* There is no castling.

(Please note that despite the names of Marshal and Cardinal, the notation used here uses A and C for both of those, respectively (as in Capablanca chess), so that the PGN is compatible with other chess variant software.)

### Strategy

Pending

## Seirawan Chess (S-Chess, SHARPER Chess)

### Intro

Seirawan Chess was created by Yasser Seirawan and Bruce Harper in 2007.  

### Rules

Unlike the above variants, this is played on a standard 8 x 8 board. The **elephant** is the rook/knight hybrid, while the **hawk** is the bishop/knight hybrid. Both of these pieces instead start off the board, although they are not to be dropped as in Crazyhouse. Instead, when a piece in a player’s first rank moves, these pieces may optionally come into the square evacuated by that piece. For castling, the extra pieces can enter either of the original king or rook squares.

Pawns can also promote to elephants and hawks.

### Strategy

Pending

## X-house

All of the above three variants above also have crazyhouse variants: **Capahouse**, **Grandhouse**, and **S-house**. As with Crazyhouse, players now have the ability to drop a piece on their turn. Both the base variant and crazyhouse rules apply. The major exception is in Grand Chess, where a pawn cannot be dropped on the final three ranks.
