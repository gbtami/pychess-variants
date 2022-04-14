# ![Sittuyin](https://github.com/gbtami/pychess-variants/blob/master/static/icons/sittuyin.svg) 緬甸象棋

![Sittuyin](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Sittuyin.png?raw=true)

**緬甸象棋**,是流行於緬甸的圖版遊戲，由印度的恰圖蘭卡演變而來，其發音「Sittuyin」，來自恰圖蘭卡的梵語音轉。緬甸象棋保留了恰圖蘭卡的思維與策略形式。遊戲本身十分有趣，步調稍慢，其原始的形式可以讓玩家體會古代象棋的獨特風格。主要盛行於緬甸地區(儘管當地更流行下西洋棋)。

## 規則

The general rules are extremely similar to Chess, so this guide will focus on the few differences. The boards are slightly different, with Sittuyin having two big diagonal lines dividing through the board. The sides are also red and black, with the red player moving first. The piece position in Sittuyin is much different compared to chess or Makruk. Key differences are as follows:

* For starters, the feudal lords (pawns) start on staggered ranks (as you can see in the board above).
* To start the game, the players (starting with the red player) alternate back and forth placing the remainder of their pieces on their halves of the boards.
* The rooks can only be placed on the back rank.
* Pawn (feudal lord) promotion works much differently. See the movement section below. 

## 棋子

### 國王

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/King.png?raw=true) 

國王的移動就如西洋棋的國王，朝八方走一格。

### 士

![General](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/General.png?raw=true)

士，走法與中國象棋的士相同，移動為斜向四格。

士值約1.5 到2 個兵，是領導攻擊的棋子，有助於騷擾更有價值的敵人棋子。有時，也可以用來犧牲以換掉有利位置的敵方棋子。

通常很少能把兩個以上兵在殘局時升變為士，因此士在殘局非常重要，與將死有密切關聯。對弱勢方(想要開始計步的一方)，其士是一個很好的誘餌，敵方必須先將其殺死，才能將死孤王。它既可以留在國王附近保護，也可以將敵人帶離國王。以這種方式分散敵人的棋子，使其耗費時間來重新組織，從而給防守方一些額外的機會在計步規則下和局（見下文）。

### 象

![Elephant](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Elephant.png?raw=true)

象，走法同日本將棋的銀將、或緬甸象棋、馬來象棋的象，移動為斜向四格或直前一格。

象是一枚強子，可以用來為其他棋子生根，也可以在國王旁保護。
 
象比士強，但比馬弱，因為孤馬可以輕易從對方王旁逃離，而孤像不行。
 
象有時會不好撤退，所以最好旁邊有棋子可以支援，也因此在殘局，讓己方的王在對方的象後方會比在它前方好。

### 馬

 ![Horse](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Horse.png?raw=true)

馬走法與西洋棋的騎士相同，移動為跳躍至2x3的對角格，可以越子(沒有卡馬腳)。。

馬在緬甸象棋中是強子，儘量讓它保持在中央，以控制更多方格。

### 車

 ![Chariot](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Chariot.png?raw=true)


車走法與象棋的車相同，移動為直向任意格。無西洋棋的王車易位規則。

車是最強的子，主宰著盤面。


### 兵

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Pawn.png?raw=true)

兵走法與西洋棋的兵相類似，單純移動時直前進一步，但吃子時斜進一步。兵的第一步時不能走兩步，故無吃過路兵。

#### 升變
After a feudal lord reaches the diagonal line on the opponent's side of the board, the player can choose to promote that piece into a general instead of moving. Each side can only has *one* general at any given time, so this can only occur if their general has already been captured. Promotion does not happen on the move where the feudal lord reaches the promotion square, but rather any move after that.

In the act of promotion, the feudal lord can promote on the same square it is on (in-place), or any one of the adjacent diagonal squares. On pychess, **in-place promotion** is performed by a **double-click** on the feudal lord, and **diagonal promotion** is performed by **moving** it to the desired square.

However, there are some more restrictions. Promotion cannot be made such that the new general will capture an enemy piece, attack an enemy piece, attack the enemy king, or put the enemy king in a discovery check.

If you have only one feudal lord left on the board, then it has the ability to promote on any square.

Finally, if your only legal moves are promotion, you may opt not to promote and claim stalemate. On pychess, you can do so by **pressing the draw button** on the right side.



## 計步規則

緬甸象棋當殘局形成特定局面時，會引發計步規則，其機制類似象棋的六十步和規則及西洋棋的五十步和規則。緬甸象棋計步規則分為兩種；殘局計步和殺王計步。


### 殘局計步

當雙方都沒有兵或所剩的兵均已變成士，同時尚有其他子力時，即達成殘局計步的條件。殘局計步不是強制的，如果雙方都不想計步的話也可以照舊繼續下；但如果任何一方想要開始計步的話，另外一方必須接受。殘局計步規定為64步，由提出計步的一方計算，如果能對方在64步內將死計步方，即獲勝，超過64步無法將死則和局；但計步方不能在計步的過程中將死對方，如果他想要求勝，必須放棄計步，那麼累積的步數也會重新歸零計算，而在此之後雙方都仍可自由決定是否重新開始計步。

### 殺王計步

當任何一方被吃到只剩孤王時，即達成殺王計步的條件，並立即強制開始，且不能中途停止或重新歸零計算，若有正在進行的殘局計步則自動取消。殺王計步依攻方的子力有不同步數的要求(見下)，若一個局面同時可以被分類到多條規則時，一律算在須求步數最少的那條規則，例如：若一方剩孤王，另一方剩一個車、兩個兵、一個馬，會以16步開始計算。如果無法在規定步數完成將殺則和局。
* 一方剩孤王，另一方有兩個車：8步
* 一方剩孤王，另一方有一個車：16步
* 一方剩孤王，另一方有兩個兵：22步
* 一方剩孤王，另一方有兩個馬：32步
* 一方剩孤王，另一方有一個兵：44步
* 一方剩孤王，另一方有一個馬：64步
* 一方剩孤王，另一方只有士：64步

## 其他規則

*逼和* - 與西洋棋一樣，無子可動和棋。

*子力不足* - 當雙方子力皆不足以將死對方時和局。

*重複動子* - 如果相同局面連續出現三次算和。

*50步未吃子* - 若雙方50步內皆沒有吃子算和。

## 泰國象棋vs 緬甸象棋
 
緬甸象棋是一款與泰國象棋非常相似的遊戲，可以被視為是加速的泰國象棋，可能會跳過大約十幾個開局動作。緬甸象棋有一半的兵從第四排開始，而所有泰國象棋兵則從第三排開始。
 
泰國象棋必須通過策略進行開局設置，而緬甸象棋開局可以直接將棋子放置在想要的位置。
 
泰國象棋的兵可升變成數個士，很快就可以投入戰鬥。這使得泰國象棋兵比緬甸象棋兵更有價值。


 
## 策略

大多數棋子一次只能走一格，因此最好成小組式的移動，以提供相互支持。不要試圖多方面打開戰鬥，協調才是關鍵。

## 戰術
 
**車是唯一可以串打的棋子，其它的棋子主要用於捉雙。**

泰國象棋與緬甸象棋幾乎都會打到殘局。當一方只剩下國王時，就會進入「計步規則」(如以上)，給較優勢一方造成壓力。
因此，掌握將死孤王的技術至關重要，如果優勢方不能在最後將死孤王，那麼前面的努力就有可能白費。

由於對強子並沒有升變規則，到了遊戲末期會變得很難將死對方，因此請算好步數。
 
最後，請特別注意時間。
 
