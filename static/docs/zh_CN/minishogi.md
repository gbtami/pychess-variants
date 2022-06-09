# ![Minishogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/minishogi.svg) 迷你将棋

![Minishogi](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Minishogi.png)

迷你将棋即是缩小版的日本将棋，使用5x5的棋盘，于1970由琉球的楠本重信发明。

## 规则

由于此变体基于日本将棋，如果不熟悉将棋规则请先查看[日本将棋](https://www.pychess.org/variants/shogi)。

初使配置如上，没有桂马与香车，且只有一个步兵。

唯一与标准将棋不同规则是，只有到达最后一列才能升变。

***

## 简附日本将棋的规则(删去桂马、香车)：

你可以「俘虏」你吃掉的子并成为你的军队，随时可以将他们**打入**场上任何位置上战斗。
(有一些子有特殊限制，将在下文中介绍)。

同时，棋子可以在成功进入敌阵后，**升变**成更强的战力。

## 棋盘与棋子

### 玉将、王将

![BlackKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/BlackKings.png)

![WhiteKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/WhiteKings.png)

![KingDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/King.png)

先手方为玉将。后手为王将。

往八个方向行走，但只能走一格，犹如西洋棋的「王」。将死对方王将者获胜。

### 飞车

![Rooks](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rooks.png)

![RookDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rook.png)

飞车的移动就如象棋的车，或西洋棋的城堡，可以任意前行或横行。它是将棋最强的未升变棋子。

其升变后为龙王。

### 龙王

![Dragons](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragons.png)

![DragonDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragon.png)

龙王是升变后的飞车，走法如本来的飞车加上西洋棋「王」的走法。它是场上最强的棋子。

### 角行

![Bishops](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishops.png)

![BishopDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishop.png)

象行的移动方式如西洋棋的主教，朝斜向移动任意步数。由于它所能控制的格子是场上总格子数的半，因此较飞车弱，为将棋第二强的未升变棋子。

其升变后为龙马。

### 龙马

![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horses.png)

![HorseDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horse.png)

龙马是升变后的角行，除了原本角行的走法，还加上西洋棋「王」的移动，因此可以到达场上任意一个格子，为场上第二强的棋子。

### 金将

![Golds](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Golds.png)

![GoldDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Gold.png)

向前、左前、右前、左、右或后行走一格，犹如中文「甲」字。
金将无法升变。


### 银将

![Silvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silvers.png)

![SilverDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silver.png)

斜角方向或正前方行走一格。

升变后叫「成银」，走法同金将。

### 步兵

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawns.png)

![PawnDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawn.png)

步兵的走法为直行一格。

升变后叫「と金(成步)」，走法同金将。

## 升变\|成驹

![PSilvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PSilvers.png)

![PKnights](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PKnights.png)

![PLances](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PLances.png)

![Tokins](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Tokins.png)


将棋的棋子设有升变制度。除了王将（玉将）、金将及已经升变的棋子外，棋盘上所有棋子均可升变，若棋子刚打入敌阵，则要多走一步才可升级。

当一枚可升级的棋子移进、移出、或者在敌阵（在迷你将棋中是最后一行）中移动时，棋手可以选择把该棋子翻转升级或保持原状，但是如果该棋子不升级的话会没有办法再走（例如走到敌阵的底线的步兵）则该棋子会被迫升级。

大子(飞车、角行)升变后各自成为「龙王」、「龙马」，其余轻子升变后皆为金将。

## 打入\|持ち驹

将棋最特别的是棋手可以花一手将己方吃掉的棋子放回棋盘成为己方棋子，称为打入。当一枚已升级的棋子被吃时，它的升级会被取消，打入时用原先的棋种表示。

打入有以下限制：

* 刚打入的棋子即使落在敌阵亦不能马上升级，**一定要在移动一步之后才可升变**。也可以选择移动后不升变，若之后要再升变，需要再移动一次才行。
* 不能把棋子打入在一些不能再走的位置。例如步兵不能落在敌阵的底线。



对步兵的打入有一些额外规则:
1) **二步一筋**: 若某行已有无方未升变步兵，则不能在该行再打入步兵。 (若该行兵已升变则不在此限)。 「二步一筋」在日本的将棋职业赛中为最常见犯规，自一九七七年迄今，在日本的将棋职业赛中已有44次「二步一筋」的记录。
2) **打步诘**: 指用打入步兵的方式使对方王将无法脱逃，若触犯则直接判输局。打步诘必须要「打」、「步」、「诘」三个条件同时成立才算数，所以以下的三种情形皆没犯规：

	* 走步诘：移动步兵，将死对方王将
	* 打其他棋子诘：打入非步兵的棋子，将死对方王将
	* 打步将：打入步兵，将军对方王将但没将死

## 其他规则



**长将** - 将棋容许连将但是不能重复同样的手法长照（长将），若双方重复循环同样的方式照将、应照达四次时，则照将方违规，判负。

**千日手** - 双方重复循环同样的著法，使得局面没有进一步变化达四次时，则视为和局。

***


## 策略

由于棋盘较小，飞车与角行相对就不像将棋中那么强。但在它们升变之后，依旧有很大的主宰力。