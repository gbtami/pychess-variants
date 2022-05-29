# ![Shogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/shogi.svg) 将棋

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Boards.png)

*将棋*，しょうぎ (Shogi)，日本将棋，亦称本将棋（本，基本之意），是一种盛行于日本的棋类游戏。将棋的始祖目前没有确实实证，目前被普遍认为可能是中国的宝应象棋或是从东南亚传入的印度恰图兰卡。在日本，将棋跟围棋并列为两大最受欢迎的棋，而且都设有段位与职业赛头衔。

## 为何要学将棋?

将棋玩起来非常类似真实的战场，不像中国象棋开局即展开攻杀，它非常强调布阵的概念，其多变足以让你在每场开局筑出不同的阵型。你也会看到进攻时将军带领着步兵逐渐推进、凌厉的飞车和角行在卒林间纵横陷阵，王将在众棋子的保获下隐蔽到安全的堡垒。

同时将棋的最大特色ーー**打入**，你可以俘虏对手的棋子，并作为己方军力随时投入战场!这使得进攻变得非常刺激，并因此让将棋具有仅次于围棋的复杂度。另外**升变**也是十分有趣，小的棋子只要成功冲入敌营，就可以晋升为将军继续作战!

将棋总体行棋快速，杀机尽出，酐畅淋漓，想体会全新棋感的玩家不容错过。

[更多资讯(英文)](https://chessbase.in/news/peter-heine-nielsen-on-shogi)

## 规则

与棋他象棋类游游一样，玩家轮流下棋，先将死对方者获胜。

你可以「俘虏」你吃掉的子并成为你的军队，随时可以将他们**打入**场上任何位置上战斗。
(有一些子有特殊限制，将在下文中介绍)。

同时，棋子可以在成功进入敌阵后，**升变**成更强的战力。


## 棋盘与棋子

将棋的棋盘是9列9行的棋盘。靠近自己的3列是本阵，远离自己而靠近对手的3列是敌阵。将棋的棋子呈钟形，前端较尖。和中国象棋及西洋棋不同，将棋是以棋子前端的指的方向来区别所属。将棋共有八种棋子（包含升级棋则有十四种），依据棋子重要性和强度棋子形状有不同大小。每种棋子均有独特的简称及走法，分述如下：

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

**所有轻子升变后走法都等同金将**

### 银将

![Silvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silvers.png)

![SilverDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silver.png)

斜角方向或正前方行走一格。

升变后叫「成银」

### 桂马

![Knights](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Knights.png)

![KnightDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Knight.png)

只能走到前两格的左方或右方。
桂马是用跳的，所以中间的棋子并不阻碍桂马前进。

升变后叫「成桂」

![Lances](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Lances.png)

![LanceeDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Lance.png)

向前走任意步数，不能跨过别的棋子。

升变后叫「成杏」

### 步兵

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawns.png)

![PawnDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawn.png)

步兵的走法为直行一格。

升变后叫「と金(成步)」

## 升变\|成驹

![PSilvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PSilvers.png)

![PKnights](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PKnights.png)

![PLances](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PLances.png)

![Tokins](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Tokins.png)


将棋的棋子设有升变制度。除了王将（玉将）、金将及已经升变的棋子外，棋盘上所有棋子均可升变，若棋子刚打入敌阵，则要多走一步才可升级。

当一枚可升级的棋子移进、移出、或者在敌阵（位于距离棋手最远的三行）中移动时，棋手可以选择把该棋子翻转升级或保持原状，但是如果该棋子不升级的话会没有办法再走（例如走到敌阵的底线的步兵）则该棋子会被迫升级。

大子(飞车、角行)升变后各自成为「龙王」、「龙马」，其余轻子升变后皆为金将。

||升变前|升变后
---|---|---
大子|飞车、角行|龙王、龙马
轻子|其他棋子|金将


## 打入\|持ち驹

将棋最特别的是棋手可以花一手将己方吃掉的棋子放回棋盘成为己方棋子，称为打入。当一枚已升级的棋子被吃时，它的升级会被取消，打入时用原先的棋种表示。

打入有以下限制：

* 刚打入的棋子即使落在敌阵亦不能马上升级，**一定要在移动一步之后才可升变**。也可以选择移动后不升变，若之后要再升变，需要再移动一次才行。
* 不能把棋子打入在一些不能再走的位置。例如步兵、香车都不能落在敌阵的底线；桂马不能落在敌阵的底线及次底线。



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

## 记谱

我们使用西式记谱(类似西洋棋)的记谱法。

### 座标

以阿拉伯数字表示直行，英文字母表示横列。原点落在王将方(后手)。然而，由于大部份的棋盘表示时是将玉将(先手)放在底部，因此原点会在最右上方。例如，王将是落在 5a

有时不管行列都由阿拉伯数字表示，比方5e有时也记作55(第五列, 第五行)。

### 棋子

K = 王将

G = 金将

S = 银将

N = 桂马

L = 香车

R = 飞车

B = 角行

P = 步兵

+R or D = 龙王

+B or H = 龙马

+S, +N, +L, +P 其余升变的轻子

### 标记

* 打入会加上 \*符号, 所以打入在5e的兵会记 P*5e
* 升变会在其后加上+。例如一个在c1升变的兵会变 P1c+
* 如果你选择不升变，则在后面加上「=」
* 将军和将死并没有特别标记

## 学习将棋的资源

[Hidetchi 的 YouTube 频道](https://www.youtube.com/playlist?list=PL587865CAE59EB84A) 非常适合初学都与中等程度者。

***

## 策略

### 子力价值

与象棋不同，将棋中没有标准的子力价值。重要的是要记住，价值并没有那么重要，因为失去棋子不是永久性的，而位置更为重要。也就是说，有一个基本的子力价值体系，但职业棋手们也制定了更具体的价值量表:谷川式和佐藤式。如下所示:

棋子 | 基本价值 | 谷川 | 佐藤
------------ | ------------- | ------------- | -------------
P | 1 | 1 | 1
L | 3 | 5 | 6
N | 3 | 6 | 6
S | 5 | 8 | 10
G | 5 | 9 | 11
B | 7 | 13 | 17
R | 8 | 15 | 19
*H* |  | 15 | 20
*D* |  | 17 | 22
*+P* |  | 12 | 
*+L* |  | 10 | 
*+N* |  | 10 | 
*+S* |  | 9 | 

### 开局原则

一般来说，有两种类型的开局方式：**居飞车**和**振飞车**。在居飞车中飞车不会移动，因此主要攻击棋盘的右侧。在振飞车中，飞车移动到左侧（通常是第 2 到第 5 行），将进攻棋盘的另一翼。

开局（称为 *joseki*）主要分成这两种，两者差异极大。

### 围玉

围玉是将王将动到角落并以其他棋子包围以保护不受攻击。通常需要多步才能完成。好的玩家需要了解各种围玉的优缺点与变型。

围玉的位置受开局为居飞车或振飞车影响。在居飞车开局中，王将在左围玉。在振飞车中则在右。以下是三种最常见的围玉:

### 矢仓

![Yagura](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Yagura.png)

矢仓围是将棋中采用于相居飞车和相振飞车的围玉。通常简称为矢仓，与美浓、穴熊并列为最具代表性的围玉。居飞车双方围出矢仓后战斗的战型被称为相矢仓，也常被直接简称为矢仓。

此围玉上方很强，但相反的，因为守护到78金将的棋子只有玉将1枚而已，面对横向而来的攻击则效果并不是很好。然而金银3枚均有集中防守到68的位置，因此也不能说面对横向而来的攻击防守薄弱。反而是在第一行，因为没有金银防守而显得有点薄弱，例如有利用桂香飞角一口气攻破的雀刺战法。

在矢仓围玉的时候记住王将总是斜向移动以节省步数，且有许多种矢仓的变体，以应对对手不同的攻击。以下是标准的24步矢仓围:

1. ☗P-7f
2. ☖P-8d
3. ☗S-6h
4. ☖P-3d
5. ☗P-6f
6. ☖S-6b
7. ☗P-5f
8. ☖P-5d
9. ☗S-4h
10. ☖S-4b
11. ☗G4i-5h
12. ☖G-3b
13. ☗G-7h
14. ☖K-4a
15. ☗K-6i
16. ☖P-7d
17. ☗G5h-6g
18. ☖G-5b 
19. ☗S-7g
20. ☖S-3c
21. ☗B-7i
22. ☖B-3a
23. ☗P-3f
24. ☖P-4d

### 美浓

![Mino Castle](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Mino.png)

美浓是一个振飞车用来对付居飞车的围玉，王将来到飞车的初始未置，金将走上&右，再上银将，形成“金金银” 。此围玉在左侧很强，但在上方较弱。

以下是一个美浓应对四间飞车的范例:

* P76
* B77 (保护 86/8f 格子) 
* P66 (防止换角)
* R68 (四间飞车)
* S78 
* K48 -> K38 -> K28
* S38 (上银)
* G58 (上金)
* P16 (给王将逃跑空间)
* P46

自此之后可以开始换子，包括飞车，以发起进攻。

### 穴熊

![Anaguma](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Anaguma.png)

十分著名的围玉方式，曾在棋界流行数十年。它的防守非常强大，只不过要浩费许多步数完成。

**优点**

金银的连结密集因而非常坚固，再加上玉将在端离战场十分遥远，形成了「绝对不会被王手（别称Z）」的形，对手也因此不得不避免在攻略穴熊的时候牺牲大量棋子。基于这些优点，穴熊方得以采取大胆舍飞车和角行等大子的作战，被称为「只有穴熊才能做到的攻击」。

**缺点**

首先，围玉所需的手数非常多，对手常常在完成之前就挑起战事。再来，围玉完成之后因为棋子集中在盘上一侧，自阵有许多空隙容易被对手打入角行。虽然横向的守备力很高，对上方或端攻较弱，在终盘还因为玉将躲在棋盘的角落，在被攻击的时候无处可逃。最后，因为自阵空隙太多容易被对手入玉，这种时候就已完全没有胜算。这种虽然围玉没有被破坏却输棋的状况被称为「姿烧穴熊(烤全熊)」。

此外，居飞车穴熊则多有遭对手角道直射的疑虑。许多居飞车穴熊的攻略法都包含角道的利用。

### 双翼攻击

双方都使用居飞车并进车前兵进攻。需要注意的事，你必需要在对方的兵巩到第5列前就上银将保护角行。

## 让子

为了让相对较弱的棋手也有获胜的机会，较强的棋手有时会让子（日文称为驹落）。在让子的情况下，让子方（即上手）必须在开局时永久除去自己一部分的棋子（即不能以任何方式将之放上棋盘）。不过，在国际赛上，让子并不会因为兵力上的差异而为相对较弱的棋手造成明显的优势。现列如下：

名称 | 让子
--- | ---
左香落 | 除去左旁香车
角落 | 除去角行
飞落 | 除去飞车
飞香落 | 除去飞车与左旁香车
二枚落 | 除去飞车与角行
四枚落 | 除去飞车、角行与香车两乘
六枚落| 除去飞车、角行、香车两乘与桂马两匹
裸玉 | 除玉将外让去所有子

<iframe width="560" height="315" src="https://www.youtube.com/embed/YH63AlxpXkg" frameborder="0" allowfullscreen></iframe>