# ![Makruk](https://github.com/gbtami/pychess-variants/blob/master/static/icons/makruk.svg) 泰國象棋
![Makruk](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Makruk.png?raw=true)

泰國象棋是泰國的經典傳統棋盤遊戲，與古印度恰圖蘭卡(國際象棋的祖先)密切相關，相較國際象棋，泰國象棋保留了恰圖蘭卡的思維與策略形式。遊戲本身十分有趣，步調稍慢，其原始的形式可以讓玩家體會古代象棋的獨特風格。

弗拉基米爾·克拉姆尼克(俄羅斯西洋棋特級大師，2000年至2007年世界冠軍)在嘗試過泰國象棋曾說:
「泰國象棋比國際象棋更具戰略性，必須全面地規劃子力的運用，因為泰國象棋更像國際象棋的殘局。」

這評論是相當精確的。從棋手的角度來看，換掉象（Khon）和士（Met）並進入殘局是最好的做法，但這種方法會使遊戲十分枯燥乏味。相反，使用不同戰術並嘗試運用子力會更加有趣。

日本將棋似由泰國將棋演變或從東南亞傳來，因皆為擒王棋、升級區域皆有三橫行、銀將與南亞諸象棋的象走法一樣。

## 規則

兵置於第三排，無論先後手國王都在玩家的左側。與中國象棋不一樣，**僵局等同平局**。

## 棋子

### 國王 (ขุน，*Khun*)

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/King.png?raw=true) 

王走法與西洋棋的王相同，移動為周圍八格。

### 士 (เม็ด，*Met*)

![Queen](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Queen.png?raw=true)

士，泰語為大臣，走法與中國象棋的士相同，移動為斜向四格。

士值約 1.5 到 2 個兵，是領導攻擊的棋子，有助於騷擾更有價值的敵人棋子。有時，也可以用來犧牲以換掉有利位置的敵方棋子。

### 象 (โคน，*Khon*)

![Bishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Bishop.png?raw=true)

象，泰語為面具舞，走法同日本將棋的銀將、或緬甸象棋、馬來象棋的象，移動為斜向四格或直前一格。

象是一枚強子，可以用來為其他棋子生根，也可以在國王旁保護。
 
象比士強，但比馬弱，因為孤馬可以輕易從對方王旁逃離，而孤象不行。
 
象有時會不好撤退，所以最好旁邊有棋子可以支援，也因此在殘局，讓己方的王在對方的象後方會比在它前方好。

### 馬 (ม้า，*Ma*)

 ![Knight](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Knight.png?raw=true)

馬走法與西洋棋的馬相同，移動為跳躍至2x3的對角格，可以越子(沒有卡馬腳)。。

馬在泰國象棋中是強子。

### 船 (เรือ，*Ruea*)

![Rook](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Rook.png?raw=true)

船走法與西洋棋的車相同，移動為直向任意格。無西洋棋的王車易位規則。

船是最強的子，主宰著盤面。

### 兵 (เบี้ย，*Bia*)

|   |   |
--- | ---
![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/Pawn.png?raw=true) | ![ProPawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/MakrukGuide/ProPawn.png?raw=true)

兵走法與西洋棋的兵相類似，單純移動時直前進一步，但吃子時斜進一步。兵的第一步時不能走兩步，故無吃過路兵。在走到對方底線的倒數第三列時，立即升級為士，不能選擇不升級。

升變兵在殘局非常重要，與將死有密切關聯。
 
For the disadvantaged side, a promoted pawn is a good decoy which must be trapped and captured before the bare king can be forced into checkmate. It can either stay near the king for additional protection, or failing that, lead enemy pieces away from it. Scattering the enemy pieces in this fashion can cost them valuable time to reorganize, thus giving the defending side some extra chance to draw the game under counting rules (see below).

## 計步規則

泰國象棋當殘局形成特定局面時，會引發計步規則，其機制類似象棋的六十步和規則及西洋棋的五十步和規則。泰國象棋計步規則分為兩種；殘局計步和殺王計步。


### 殘局計步

當雙方都沒有兵或所剩的兵均已變成士，同時尚有其他子力時，即達成殘局計步的條件。殘局計步不是強制的，如果雙方都不想計步的話也可以照舊繼續下；但如果任何一方想要開始計步的話，另外一方必須接受。殘局計步規定為64步，由提出計步的一方計算，如果能對方在64步內將死計步方，即獲勝，超過64步無法將死則和局；但計步方不能在計步的過程中將死對方，如果他想要求勝，必須放棄計步，那麼累積的步數也會重新歸零計算，而在此之後雙方都仍可自由決定是否重新開始計步。

### 殺王計步

當任何一方被吃到只剩孤王時，即達成殺王計步的條件，並立即強制開始，且不能中途停止或重新歸零計算，若有正在進行的殘局計步則自動取消。殺王計步依攻方的子力有不同步數的要求(見下)，若一個局面同時可以被分類到多條規則時，一律算在須求步數最少的那條規則，例如：若一方剩孤王，另一方剩一個車、兩個孔、一個馬，會以16步開始計算。如果無法在規定步數完成將殺則和局。
* 一方剩孤王，另一方有兩個車：8步
* 一方剩孤王，另一方有一個車：16步
* 一方剩孤王，另一方有兩個孔：22步
* 一方剩孤王，另一方有兩個馬：32步
* 一方剩孤王，另一方有一個孔：44步
* 一方剩孤王，另一方有一個馬：64步
* 一方剩孤王，另一方只有士：64步

## 泰國象棋 vs 緬甸象棋
 
Sittuyin is a game very similar to Makruk, but played in Myanmar. In a sense, Sittuyin can be thought of as a kind of accelerated Makruk, potentially skipping ahead about a dozen opening moves. Half of the Sittuyin pawns start on the fourth rank, as opposed to all Makruk pawns starting from the third rank.
 
Makruk players must negotiate their way towards getting a good opening setup from scratch, a vital skill for Makruk. Sittuyin players get to just set up their dream positions. Experience in either variant would be useful/beneficial in the other.
 
Makruk allows promoting pawns to multiple queens, which can quickly become dangerous. This makes Makruk pawns more valuable than Sittuyin pawns.

## 策略
 
The pace is rather slow, with most pieces stepping only one square at a time. It's a good idea to organize and group together the pieces. Move them in formation as a group to provide mutual support. Do not try to open up the game on too many fronts. Coordination is key.

## 戰術
 
**船是唯一可以串打的棋子，其它的棋子主要用於捉雙。**

Most Sittuyin and Makruk games will actually reach the bitter (near) end.
When one side has only a bare King remaining, there are certain "counting rules" (see above) which come into effect and put pressure on the stronger side. Such requirements offer the weaker side an incentive to play out the whole game. Therefore it is crucial to master all the basic checkmates against a lone King. There just isn't much point in playing these games if one can't finish off the bare King at the end.
 
Because there is no promotion to heavy pieces, it becomes harder to force a checkmate after the existing pieces have left the board. Plan accordingly and leave yourself with enough fire power.
 
請特別注意時間，as many of those mates require precision.
 
