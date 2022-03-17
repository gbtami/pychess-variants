# ![Shogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/shogi.svg) 將棋

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Boards.png)

*Shogi* (将棋), 日本將棋，又稱日本象棋、亦稱本將棋（本，基本之意），是一種盛行於日本的棋類遊戲。將棋的始祖目前沒有確實實證，目前被普遍認為可能是中國的寶應象棋或是從東南亞傳入的印度恰圖蘭卡。在日本，將棋跟圍棋並列為兩大最受歡迎的棋，而且都設有段位與職業賽頭銜。

## 為何要學將棋?

將棋玩起來非常類似真實的戰場，不像中國象棋開局即展開攻殺，將棋非常強調開局佈陣的概念。

If you enjoy Chess, Shogi is definitely worth trying. While slightly slower paced and longer than Chess, the game is also more dynamic and complex, leading to a very different experience. Shogi is between Chess and Go in terms of complexity, but don’t let that deter you. As with other chess variants, improving your skill in Shogi can  also improve your skills in Chess as well as open up new ways of thinking! [See here for more about that.](https://chessbase.in/news/peter-heine-nielsen-on-shogi)

## 規則

與棋他象棋類遊遊一樣，玩家輪流下棋，先將死對方者獲勝。

A significant difference from Chess but similar to its Crazyhouse variant is that you can drop captured pieces onto the board as a move. There are a few restrictions to dropping notably with pawns, which are discussed later, but otherwise pieces can be generally dropped anywhere. Additionally, almost all pieces can be promoted. Pieces are promoted upon entering the promotion zone / enemy camp (last three ranks) or moving a piece already in the enemy camp. The piece will then flip over. Captured promoted pieces are returned to their unpromoted side when added to your hand.



## 棋盤與棋子

將棋的棋盤是一個由10條橫線及10條直線相交的方格陣，而棋子則置於方格之內，也就是9列9行的棋盤。 靠近自己的3列是本陣，遠離自己而靠近對手的3列是敵陣。將棋的棋子呈鐘形，前端較尖。和中國象棋及西洋棋不同，將棋是以棋子前端的指的方向來區別所屬。將棋共有八種棋子（包含升級棋則有十四種），依據棋子重要性和強度棋子形狀有不同大小。每種棋子均有獨特的簡稱及走法，分述如下：

All *minor* pieces move like a gold general when promoted. The gold general, therefore, cannot promote. Secondly, the two *major* pieces (rook and bishop), both gain the moves of a king on top of their original moves. The king does not promote.


### 玉將、王將

![BlackKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/BlackKings.png) 

![WhiteKings](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/WhiteKings.png)

![KingDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/King.png)

先手方為玉將。後手為王將。

往八個方向行走，但只能走一格，猶如西洋棋的「王」。將死對方王將者獲勝。

### 飛車

![Rooks](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rooks.png)

![RookDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Rook.png)

飛車的移動就如象棋的車，或西洋棋的城堡，可以任意前行或橫行。它是場上最強的未升變棋子，其升變後為龍王。

### 龍王

![Dragons](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragons.png)

![DragonDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Dragon.png)

龍王是升變後的飛車，走法如本來的飛車加上西洋棋「王」的走法。它是場上最強的棋子。

### 角行

![Bishops](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishops.png)

![BishopDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Bishop.png)

象行的移動方式如西洋棋的主教，朝斜向移動任意步數。由於它所能控制的格子是場上總格子數的半，因此較飛車弱，為將棋第二強的未升變棋子。



### 龍馬

![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horses.png)

![HorseDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Horse.png)

龍馬是升變後的角行，除了原本角行的走法，還加上西洋棋「王」的移動，因此可以到達場上任意一個格子，為將棋第二強的棋子。

### 金將

![Golds](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Golds.png)

![GoldDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Gold.png)

向前、左前、右前、左、右或後行走一格，猶如中文「甲」字。
金將無法升變。

**所有輕子升變後走法都等同金將**

### 銀將

![Silvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silvers.png)

![SilverDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Silver.png)

斜角方向或正前方行走一格。

升變後叫「成銀」

### 桂馬

![Knights](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Knights.png)

![KnightDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Knight.png)

只能走到前兩格的左方或右方。
桂馬是用跳的，所以中間的棋子並不阻礙桂馬前進。

升變後叫「成桂」

![Lances](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Lances.png)

![LanceeDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Lance.png)

向前走任意步數，不能跨過別的棋子。

升變後叫「成杏」

### 步兵

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawns.png)

![PawnDiagram](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pawn.png)

步兵的走法為直行一格。

升變後叫「と金(成步)」

### 升變

![PSilvers](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PSilvers.png)

![PKnights](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PKnights.png)

![PLances](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PLances.png)

![Tokins](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Tokins.png)


將棋的棋子設有升變制度。除了王將（玉將）、金將及已經升變的棋子外，棋盤上所有棋子均可升變，若棋子剛打入敵陣，則要多走一步才可升級。

當一枚可升級的棋子移進、移出、或者在敵陣（位於距離棋手最遠的三行）中移動時，棋手可以選擇把該棋子翻轉升級或保持原狀，但是如果該棋子不升級的話會沒有辦法再走（例如走到敵陣的底線的步兵）則該棋子會被迫升級。

大子(飛車、角行)升變後各自成為「龍王」、「龍馬」，其餘輕子升變後皆為金將。

-|升變前|升變後
-|-|-
大子|飛車、角行|龍王、龍馬
輕子|其他棋子|金將


## 打入
日本將棋最特別的是棋手可以花一手將己方吃掉的棋子放回棋盤成為己方棋子，這在日文稱為打入，大幅提高了將棋的複雜度。當一枚已升級的棋子被吃時，它的升級會被取消，打入時用原先的棋種表示。

打入有以下限制：

* 剛打入的棋子即使落在敵陣亦不能馬上升級，一定要以後多下一手才行。
* 不能把棋子打入在一些不能再走的位置。例如步兵、香車都不能落在敵陣的底線；桂馬不能落在敵陣的底線及次底線。



對步兵的打入有一些額外規則:
1) **二步一筋**:若某行已有無方未升變步兵，則不能在該行再打入步兵。 (若該行兵已升變則不在此限)。「二步一筋」在日本的將棋職業賽中為最常見犯規，自一九七七年迄今，在日本的將棋職業賽中已有44次「二步一筋」的記錄。 
2) **打步詰** 指用打入步兵的方式使對方王將無法脫逃，若觸犯則直接判輸局。打步詰必須要「打」、「步」、「詰」三個條件同時成立才算數，所以以下的三種情形皆沒犯規：
	* 走步詰：移動步兵，將死對方王將
	* 打其他棋子詰：打入非步兵的棋子，將死對方王將
	* 打步將：打入步兵，將軍對方王將但沒將死

## 其他規則



*長將* - 將棋容許連將但是不能重複同樣的手法長照（長將），若雙方重複循環同樣的方式照將、應照達四次時，則照將方違規，判負。 

*千日手* - 雙方重複循環同樣的著法，使得局面沒有進一步變化達四次時，則視為和局。

***

## 記譜

我們使用西式記譜(類似西洋棋)的記譜法。

### 座標

One noticeable difference is that the board coordinates are switched from chess. Files are numbered, and ranks are alphabetized. The origin is the bottom left for the white player. However, since most diagrams are oriented for the black player (first player), these will seem to originate from the top right. As an example, the white king is on square 5a.

In the Hoskings notation, only numbers are used. Instead of 5e, someone might say 55 (5th rank, 5th file). This is similar to the Japanese style, which also uses numbers. 

### 棋子

K = king

G = gold general

S = silver general

N = knight

L = lance

R = rook

B = bishop

P = pawn

+R or D = dragon king

+B or H = dragon horse

+S, +N, +L, +P for the other promoted pieces, respectively.

### Symbols

* Drops are either indicated with a \* (Hodges) or ‘ (Hosking). Here we use \*, so a pawn drop on 5e would be P*5e.
* Moves that end in promotion add a + at the end. A pawn promoting on 1c would be P1c+.
* If you choose to not promote, instead an = goes at the end.
* Checks and checkmates are not notated.

## 學習將棋的資源

[Hidetchi’s YouTube channel](https://www.youtube.com/playlist?list=PL587865CAE59EB84A) is an excellent place for beginner and intermediate players, alike. They are in English and very carefully break down the aspects of the game. Please note that like all other resources, you will need to be familiar with the kanji pieces in order to understand the videos (he also introduces the pieces in the beginner videos).

[81dojo.com](http://www.81dojo.com) is a site where you can play internationally against tougher players. However, it does not support correspondence play at this time.

## 策略

### 子力價值

There is no standard piece value in shogi unlike chess. However, it's important to keep in mind that values are not worth as much, as losing pieces isn't permanent and position is far more important. That said, there is a basic piece value system, but professional players have also made more specific values; Tanigawa and Satoh's are shown below.

Piece | Basic | Tanigawa | Satoh 
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

### 開局原則

In general, there are two types of opening styles: *static rook* and *ranging rook*. In *static* rook, the rook does not move. Attacks, therefore, are directed on the right side of the board. In *ranging* rook, the rook moves to the left side (typically 2nd to 5th file), shifting the offense to that side of the board.

This difference matters because opening moves (called *joseki*) are classified as one of these two and can drastically change what kind of game is played. Certain static rook openings are meant for enemy static rook openings, while others are directed against ranging rook players.

### 圍玉

Castles in shogi are defensive formations that take multiple steps to form. Knowledge of castles is essential because weak king defenses can be quickly exploited with drops in your own territory. It is also important to know each castle’s strengths and weaknesses.

As above, castles depend on static / ranging rook matchup. In static rook openings, kings castle to the left. In ranging rook openings, kings castle to the right. There are many, many castles, many of which are covered in Hidetchi’s videos (see below). Here are three of the most important ones to know:

**矢倉**

![Yagura](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Yagura.png)

The Yagura castle is one of the most powerful *static rook* castles, used against static rook. A mnemonic that may be useful for remembering the positions of the generals is “S G | G B”, or perhaps remembering that the king is guarded by the gold general, a strong defensive piece. Yagura is strong at its front, but weak on its edge and side.

For development of the Yagura, remember that generals always move diagonally to be most efficient. There are different josekis for developing the castle, but keep in mind that at any point white can attack and that you may have to react in between your developmental moves. The 24-move standard joseki is as follows (Source: Hidetchi):

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

**美濃**

![Mino Castle](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Mino.png)

The Mino castle is a classic *ranging rook* castle, used against static rook. The king moves to the rook’s starting spot, the left gold moves up+right, and then the right silver moves up to form a “G G S” V formation. This castle is strong to the left, but weak to the front and edge.

Example opening for black using a 4th file rook:

* P76
* B77 (protects the 86/8f square) 
* P66 (reject bishop exchange if white opens bishop up)
* R68 (fourth file rook)
* S78 
* K48 -> K38 -> K28
* S38 (silver up)
* G58 (gold up-right)
* P16 (creates escape route for the king)
* P46

After this point, you are free to exchange bishops and as many pieces as you want, including rooks to generate an attack.

**穴熊**

![Anaguma](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Anaguma.png)

十分著名的圍玉方式，曾在棋界流行數十年。它的防守非常強大，只不過要浩費許多步數完成。

**Double Wing Attack**

Not a castle per se, but a *static rook* opening. Both sides advance their rook pawns, leading to an exchange. Part of the joseki is that the silvers must defend the bishop pawns before the enemy pawn reaches its target. Of note, this is AlphaZero’s favorite opening, accounting for more than half of its openings as black.

## 讓子

為了讓相對較弱的棋手也有獲勝的機會，較強的棋手有時會讓子（日文稱為駒落）。在讓子的情況下，讓子方（即上手）必須在開局時永久除去自己一部分的棋子（即不能以任何方式將之放上棋盤）。不過，在國際賽上，讓子並不會因為兵力上的差異而為相對較弱的棋手造成明顯的優勢。現列如下：

名稱 | 讓子
-- | --
左香落 | 除去左旁香車
角落 | 除去角行
飛落 | 除去飛車
飛香落 | 除去飛車與左旁香車
二枚落 | 除去飛車與角行
四枚落 | 除去飛車、角行與香車兩乘
六枚落| 除去飛車、角行、香車兩乘與桂馬兩匹
裸玉 | 除玉將外讓去所有子

<iframe width="560" height="315" src="https://www.youtube.com/embed/YH63AlxpXkg" frameborder="0" allowfullscreen></iframe>
