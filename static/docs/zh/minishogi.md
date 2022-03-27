
# ![Minishogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/minishogi.svg) 迷你將棋

![Minishogi](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Minishogi.png)

迷你將棋即是縮小版的日本將棋，使用5x5的棋盤，於1970由琉球的楠本重信發明。

## 規則

由於此變體基於日本將棋，如果不熟悉將棋基本規則請先查看日本將棋。

啟動設置如上。與標準將棋不同，沒有騎士或長槍。只有一個棋子，一個主教和一個車，每個將軍一個。晉升僅在最後一級進行。

將棋的規則總結如下：

*Drops* - 將棋子丟到任何地方的主要例外是用棋子。
1) 棋子不能與另一個未升級的棋子放在同一個文件中（升級沒問題）。
2）典當不能將死，但可以檢查。
3) 最後的例外適用於所有小作品。你不能丟掉一塊讓它不能移動，這通常意味著最後一個等級……或者在騎士的情況下是最後兩個等級。

*永久檢查* - 連續四次重複檢查導致相同位置是導致永久檢查的玩家的損失。在國際象棋中，這導致平局。

*重複* - 與上述類似，重複相同的位置（包括手中的棋子）會導致平局。

*計時器* - 將棋使用 byo-yomi 計時器。一旦主時鐘到期，玩家進入 byo-yomi。如果將其設置為 30 秒，那麼該玩家將只有 30 秒的時間來完成他/她的每一步移動，否則將按時輸掉比賽。

＃＃ 件

本指南將基於國際化集。傳統套裝使用漢字 *kanji*，而件套採用完整的 2-kanji 形式和 1-kanji 縮寫形式。就像現在一樣，如果您想利用所有英語資源，則需要具備漢字知識。

一般來說，將棋棋子比棋子更受限制。小棋子（即不是車或主教）經常向前移動，而不是向後移動。

關於促銷作品，大多數套裝，包括本網站上使用的套裝，都以紅色來區分它們。有兩個基本規則可以讓學習所有部分**少**令人生畏。所有*次要*棋子在升級時都像金將軍一樣移動。因此，金將軍不能晉升。其次，兩個*主要*棋子（車和主教）都在其原始動作之上獲得了國王的動作。國王不提倡。


### King

![BlackKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/BlackKings.png) 

![WhiteKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/WhiteKings.png)

![KingDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/King.png)

The king moves exactly like a chess king: one step in any direction. In kanji piece sets, the king with a dot, 玉將 gyokushō, is the black player, while the king without, 王將 ōshō, is the white player. 

This is the only piece in the internationalized set to maintain its kanji form, 王. In these sets, the color black or white is also depicted in this piece. The wooden set uses a bar below the 王. 

### Rook

![Rooks](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rooks.png)

![RookDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rook.png)

The rook moves exactly like a chess rook: any number of squares orthogonally. The international piece depicts a chariot, which refers to the Japanese name “flying chariot.” In English, the name rook is based off the Persian word for chariot. This is the most valuable unpromoted piece in the game, excluding the king.

### Bishop

![Bishops](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishops.png)

![BishopDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishop.png)

The bishop moves exactly like a chess bishop: any number of squares diagonally. The international piece depicts a traditional hat worn by a Japanese official. The bishop is the second most valuable unpromoted piece in the game, excluding the king.

### Dragon King (Dragon, Promoted Rook)

![Dragons](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragons.png)

![DragonDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragon.png)

The dragon king is a promoted rook, which gains the king’s moves on top of a rook’s. This is the most valuable piece in the game, excluding the king.

### Dragon Horse (Horse, Promoted Bishop)

![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horses.png)

![HorseDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horse.png)

The dragon horse is a promoted bishop, which gains the king’s moves on top of a bishop’s. This is the second most valuable piece in the game, excluding the king.

Note: While some beginner chess players sometimes call the knight a horse, you can't make that mistake in shogi because they are two completely different pieces!

### Gold General (Gold)

![Golds](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Golds.png)

![GoldDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Gold.png)

While the movement pattern of the gold general may seem confusing at first, the easiest way to remember it is that it moves **one step orthogonally in any direction**… or any of the three squares in front. In the internationalized set, the protrusions of the helmet (including the golden circle symbol) also point in all its directions.

**All promoted minor pieces move exactly like a gold.**

### Silver General (Silver)

![Silvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silvers.png)

![SilverDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silver.png)

While the movement pattern of the silver general may seem confusing at first, the easiest way to remember it is that it moves **one step diagonally in any direction**… or any of the three square in front. In the internationalized set, the protrusions of the helmet also point in all its directions.

### Pawn

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawns.png)

![PawnDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawn.png)

The pawn moves and captures by moving forward one square. This is different than the chess pawn. The pointy hat in the internationalized piece is a reminder.

### Promoted minor pieces

![PSilvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PSilvers.png)

![Tokins](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Tokins.png)

Unlike the dragon king and dragon horse, these do not have special names. The exception is the pawn, which is sometimes called by its Japanese name, *tokin*. As above, they move just like the gold general. Note that the kanji versions are all different stylistic variants of the character for gold.


## Strategy

Due to the smaller board size, the rook and bishop are not as dominant as standard shogi. However, their promotions are still very much threatening.
