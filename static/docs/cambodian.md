# ![Cambodian](https://github.com/gbtami/pychess-variants/blob/master/static/icons/cambodian.svg) Ouk Chaktrang

![Cambodian Board](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Makruk.png?raw=true)

Cambodian chess, also known as "Ok" (Khmer: អុក) or "Ouk Chaktrang" is a variant of Makruk (Thai chess) played in Cambodia.

If you are not familiar with the rules of Makruk, please see that first.

## Rules

Ouk Chaktrang has two main differences from Makruk: The special opening moves, and the minor differences in endgame counting rules.

### The special opening moves

![King's Jump](https://github.com/gbtami/pychess-variants/blob/master/static/images/OukGuide/kingleap.png)

1. During its first move, the king can jump like a knight onto the second rank. This move cannot capture and cannot be used to escape check.

![Rook's Aiming](https://github.com/gbtami/pychess-variants/blob/master/static/images/OukGuide/rookaim.png)

Furthermore, the king permanently loses this ability if it is "aimed" by an enemy rook. It means if an enemy rook moves into the same rank or file as the king, the jump ability is gone. The king can no longer jump even if the rook moves away afterward.

![Met's Jump](https://github.com/gbtami/pychess-variants/blob/master/static/images/OukGuide/metleap.png)

2. During its first move, the met can jump two squares forward. This move cannot capture.

### The endgame counting

Since Ouk Chaktrang has evolved somewhat independently from Makruk, some of their rules have been adjusted and become slightly different.

#### How the counting ends the game

In Ouk Chaktrang, the game immediately ends in a draw when the counting limit is **reached**. For example, if the limit is 64, then as soon as the count hits 64, the game is a draw. *(In Makruk, the count needs to go up to 65 for the game to be decided a draw.)*

#### Board's Honor Counting

In Ouk Chaktrang, the board's honor counting can be initiated whenever you **have a total of three pieces or less**. This includes your king and the pawns. *(Note that it can start even if there are unpromoted pawns left on the board.)*

#### Piece's Honor Counting

In Ouk Chaktrang, when the condition for piece's honor counting is met, the counting player may **choose not to go into it** and **continue board's honor counting** instead. On PyChess, the system will automatically choose the way that will reach the limit in less number of moves. *(In Makruk, you cannot choose, you're forced to go into piece's honor counting even if it would be longer)*

## Reference

[The Ouk Chaktrang Championship, Pre-South East Asia Game 32nd 2023 in Cambodia](https://docs.google.com/document/d/1adppJ66vonM27UYwC-KyldXl7oZ_5Pb0/edit?usp=sharing&ouid=116281580550740302191&rtpof=true&sd=true)
