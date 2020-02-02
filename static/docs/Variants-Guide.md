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

![Princess](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Princesses.png)

![Princess moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Archbishop.png)

The princess is a compound piece combining the moves of the **bishop** and the **knight** and is known by different names dependending on the variant:

* **Archbishop (A)** in Capablanca chess
* **Cardinal (C)** in Grand chess
* **Hawk (H)** in Seirawan chess

The piece is often symbolized with a combination of a knight and bishop; most variants often do not specify how the piece should look otherwise (which is why we offer different piece sets to choose from). However, Yasser Seirawan specifically uses a hawk in Seirawan chess.

The princess is unique in that it is the only piece that can checkmate on its own, which you may be able to appreciate if you look at its movement/attack pattern.

The value of a princess is considered slightly better than a rook, but less than the empress and queen.

### Empress

![Empress](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Empresses.png)

![Empress moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Chancellor.png)

The empress is a compound piece combining the moves of the **rook** and the **knight** and is known by different names dependending on the variant:

* **Chancellor (C)** in Capablanca chess
* **Marshal (M)** in Grand chess
* **Elephant (E)** in Seirawan chess

The piece is often symbolized with a combination of a knight and rook; most variants often do not specify how the piece should look otherwise (which is why we offer different piece sets to choose from). However, Yasser Seirawan specifically uses an elephant in Seirawan chess.

The value of a princess is considered better than a princess, but equivalent or slightly less than a queen.

## Capablanca Chess

![Capablanca setup](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Capablanca.png)

### Intro

Capablanca chess was created by World Chess Champion José Raúl Capablanca in the 1920s 

### Rules

The game is played on a 10 x 8 board, with additional files for the new Archbishop (Knight/Bishop) and Chancellor (Knight/Rook) pieces between the Bishop and Knight. The archbishop is on the queen side, and the chancellor is on the king side. For castling, the king then moves three squares instead of two. Pawns may promote to the archbishop and chancellor as well.

There are several variants that have different starting positions. On this site, Gothic chess is one such variant available, where the queen and chancellor starting positions are swapped.

### Strategy

One should not simply make just developing moves. You can afford to lag in development so long as you are working on controling key squares. Quality over quantity.

More strategy pending.

## Grand Chess

![Grand Chess setup](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Grand.png)

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

One should not simply make just developing moves. You can afford to lag in development so long as you are working on controling key squares. Quality over quantity.

More strategy pending.

## Seirawan Chess (S-Chess, SHARPER Chess)

### Intro

Seirawan Chess was created by Yasser Seirawan and Bruce Harper in 2007.  

### Rules

Unlike the above variants, this is played on a standard 8 x 8 board. The **elephant** is the rook/knight hybrid, while the **hawk** is the bishop/knight hybrid. Both of these pieces instead start off the board, although they are not to be dropped as in Crazyhouse. Instead, when a piece in a player’s first rank moves for the first time, these pieces may optionally come into the square evacuated by that piece. If all first rank pieces have moved or been captured, then any remaining elephant or hawk cannot be entered into play. For castling, the extra pieces can enter either of the original king or rook squares.

Pawns can also promote to elephants and hawks.

### Strategy

Per Yasser Seirawan, protecting the king is even more important in this game because a ranged attack by a back rank piece such as the queen, bishop, or rook, can immediately be supported by an incoming hawk or elephant, in some cases leading to checkmate! 

More strategy pending.

## X-house

All of the above three variants above also have crazyhouse variants: **Capahouse**, **Grandhouse**, and **S-house**. As with Crazyhouse, players now have the ability to drop a piece on their turn. Both the base variant and crazyhouse rules apply. The major exception is in Grand Chess, where a pawn cannot be dropped on the final three ranks. Due to how new these variants are, the knowledge bank for strategy is very limited at this time.

# SHOGUN CHESS

![Shogun](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ShogunPromotions.png)

## Intro

Shogun Chess is a chess variant designed in 2019-2020 by Couch Tomato. While the game itself is a blend of western chess and shogi rules, the original idea for the game was a way to introduce the hybrid pieces (commonly known as the archbishop and chancellor) in a way different than other variants have done. For example, keeping an 8x8 instead of enlarging the board so as to not diminish the value of the minor pieces, or introduce them in a board that is not as cluttered as in Seirawan chess. The idea evolved to introduce these pieces through the means of promotion from the minor pieces and the rook at an earlier rank than the 8th rank. Later, drops were also introduced into the rules as a means to increase the offensive options to offset the defensive nature introduced by the need to protect against the threat of promotion. Unique pawn and knight promotions as well as even a queen demotion were added to complete the theme and symmetry.

The name was originally thought as "general's chess," based on what was then the name of the pawn promotion, now currently the name of the knight promotion. However, with the drops and promotion zones based off shogi, the Japanese word for "general," shogun sounded more appropriate. The sho in shogun being the same as the one in shogi pays tribute to that as well.

## General Rules

1. Setup is exactly the same as chess.

2. New pieces are as defined in the image above, and their moves are described in detail below. Of note, promoted sides are colored differently. Also, the queen *starts* as a promoted piece despite having a new unpromoted form (the Duchess). See details about drops below. For the sake of terminology, a rook will now be considered a "minor piece," while the queen, mortar, archbishop, and general (but NOT the captain) are considered "major pieces." 

3. The three farthest ranks are the promotion zone. Every starting (or dropped) piece except the king and queen may promote by moving into the promotion zone **or moving from within the promotion zone**. 

4. However, only one of *each* **major** piece (queen, mortar, archbishop, or general) can be out on each side at a time. For example, if a player has an archbishop in play, then a bishop cannot promote into an archbishop until the current one is captured.

5. As in crazyhouse and shogi, captured pieces may be dropped back into the board as your own piece. Pieces can be dropped anywhere within the first 5 ranks (in other words, anywhere but the promotion zone). Note that unlike crazyhouse, **pawns can be dropped on the first rank**.

6. When promoted pieces are captured, they revert to their unpromoted side. This is the only way that a queen becomes a duchess.

Additional minor rules for clarification:
* Dropped rooks cannot castle, as in crazyhouse.
* Pawns dropped on the first rank can still double step when reaching the second rank.
* Pawns cannot promote if capturing by en passant. 

(Note that images were designed for computer play. Over the board pieces are not available but would require shogi-like designs of two-sided directional pieces to be viable.)

## Pieces

### Archbishop

![Archbishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ArchbishopShogun.png)

The archbishop is a hybrid piece seen in multiple other chess variants. In this game, it promotes from bishop and gains the move of a knight. Because of its unique moves, it is the only piece that can checkmate on its own.

### Mortar

![Mortar](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Mortar.png)

The mortar is a hybrid piece seen in multiple other chess variants, often with other names such as the chancellor or marshall. In this game, it promotes from the rook and gains the move of a knight. 

### General

![General](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/General.png)

The general is a hybrid piece, often known as a centaur. In this game, it promotes from the knight and gains the moves of a king.

### Captain

![Captain](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Captain.png)

The captain is the only promotion of the pawn and moves exactly like a king. As a non-royal piece, capturing a captain does not win the game. Also, unlike the rest of promoted pieces, there can be multiple captains, as it is not a major piece.

### Duchess

![Duchess](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Duchess.png)

The duchess is the only demoted form of the queen, and only comes into play after capturing a queen, where it then becomes a duchess in hand. The duchess moves only one space diagonally (same movement as what's often called the "ferz"). As a reminder, a duchess cannot promote to a queen when that player already has a queen on the board (polygamy is illegal in Shogun chess).

## Strategy

The game is still young, so strategy is still being developed! Of course, with the 6th rank promotions, it is important to protect your own 3rd rank. This is something that a beginner can easily overlook.
