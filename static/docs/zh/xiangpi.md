# ![Xiangqi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/xiangqi.svg) 象棋

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Boards.png)

象棋是中國大陸、香港、台灣、馬來西亞、新加坡、越南、琉球地區所流行的傳統的2人對弈棋類遊戲。中國大陸為了進行區分稱此為中國象棋，將西方的「Chess」稱為國際象棋；台灣將「Chess」翻譯為「西洋棋」。據說從春秋戰國時期的「六博」演繹而來，也有一說是源自於古印度象棋恰圖蘭卡，傳入中國成寶應象棋。最後中國人在宋代改造成中國象棋。德國西洋棋歷史學家Peter Banaschak指出，唐代宰相牛僧孺的《玄怪錄》內沒有「炮」的寶應象棋是中國象棋的真正來源。

## 為何要玩中國象棋

中國象棋相較西洋棋雖需時較長，步數較多，但亦有其精采之處。中國象棋的開局更為緊湊，比起佈陣決定盤面的「戰略」，更需要考驗棋手計算能力的「戰術」。
它的局面豐富多樣，行棋輕快流暢，戰術凌厲，不像西洋棋常有子力擁塞的情況發生。相較西洋棋旨在發展空間，象棋更強調阻擋與搶占要道。學習象棋可以轉換另類思維，加上「炮」這個複雜而特別的棋子帶來許多別種棋所沒有的戰術，絕對可以增進你的棋感和敏銳度。
 

## 規則
所有的棋子都落在格子點上，且在縱橫的線上移動。開局由紅先行，黑其後，目的是將對方將死。與西洋棋不同的是，被困斃(stalemated無子可動)的一方算輸，另外長將和(perpetual checks)在象棋中也不成立。只要有一方連續動三次一樣的棋步該方就直接告負。


## 棋盤

象棋的棋盤由9條縱線和10條橫線相交而成。棋子放在各條線的相交點上，並在線上移動。棋盤中間的一行沒有畫上縱線，稱為「河界」，通常標上「楚河漢界」字樣，象徵楚漢相爭時的鴻溝。現行的中式記錄方法是：9條縱線，紅方從右到左用漢字「一」至「九」表示，黑方在自己的那一面從右到左用數字「1」至「9」表示。也就是說，紅方的縱線「一」就是黑方的縱線「9」，以此類推。第四條縱線（或第6條縱線）和第六條縱線（或第4條縱線）稱為「兩肋」、「兩肋線」，簡稱「肋」。棋盤上，劃有斜交叉線而構成「米」字形方格的地方，雙方各有一塊，稱為「九宮」，是將（帥）和士（仕）活動的區域。

## 棋子


### 將、帥

![Kings](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Kings.png) 

只可在己方的九宮內直行或橫行，每次一步。

將、帥在同一路且兩個棋子之前無任何棋子時，屬於違規走法，此稱為「王不見王」或者「將帥對臉」。

被將死或無處可動時，該方告負。


![King and advisor movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/KingAdvisorDiagram.png)

### 士、仕

![Advisors](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Advisors.png) 

只可在己方的九宮內斜行，每次一步。
行動力較低的棋子，用作將（帥）的內防禦之用。

### 象、相

 ![Elephants](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Elephants.png)
 
 ![Elephant movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/ElephantDiagram.png)

象行田：每一著斜走兩步（路線如「田」字的對角線）。

塞象眼（擠象眼）：當「田」字的中心有棋子，就不能走。

與士大致相同，用作將（帥）的外防禦之用。
### 馬、傌

 ![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Horses.png)
 
 ![Horse movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/HorseDiagram.png)

馬行日：任何方向前進一步然後斜走一步（即「一步一尖」），或者說是先向前走兩步，再相應的垂直橫向走一步。

蹩馬腿（撬馬腳）：若前進方向與其緊挨的位置有任何棋子，就不能往那個方向走。

最多能走八個方位（跟西洋棋的騎士一樣，但是西洋棋的騎士並無拐馬腳），有八面虎之稱，近距離殺傷力最強，同時又能憑著九彎十八拐的行進路線掩藏殺機，厲害無比。
隨著戰局的進行，或是棋手實力越高，更易發揮其威力。

### 車、俥

 ![Chariots](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Chariots.png)
 
 ![Chariot movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/ChariotDiagram.png)

只要無子阻隔，直行或橫行不限距離移動。

車為遠距離殺傷力的主力，無論何時都是第2關鍵的子。
有「三步不出車，棋已輸半盤」之稱。殘局有車在手，基本上不成問題；如果只有自己有車，常可穩操勝券。

### 包、炮

![Cannons](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Cannons.png)

![Cannon movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/CannonDiagram.png)

若不吃子，走法與車相同。

吃子時需與目標間有一個任何一方的棋子相隔（該子稱為炮架或砲台）。

遠距離殺傷力第二強，進攻時常與車和馬配合使用。
開局因為棋子（砲台）眾多，極為兇猛；殘局時因砲架難以取得，力量大幅下降，若能換到一炮（甚至一馬）會相當划算（西洋棋沒有炮）

### 卒、兵

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Pawns.png)

![Pawn movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/PawnDiagram.png)

過河前每次只可向前直行一步；過河後可左右或往前走一步。

永遠不能後退。

與西洋棋不同，即使打到底線也不能升變成其他棋子，但過河就能橫移，加強能力。
越到殘局威力越強，有時一兵（卒）可抵一馬或一炮，甚至一車。

## 勝負:

對一般棋局來說，只要一方「欠行」或者被「將死」，又或者自動認輸，另一方即可得勝。欠行和將死定義如下：

行棋方無子可走，稱為欠行，亦稱為困斃。
當一方的棋子攻擊範圍內包含了對方的將帥，準備在下一步吃掉它，稱為照將或將軍，簡稱將。
被將軍的一方必須應將，即移動將帥或別的棋子來化解。無法應將的情況稱為「被將死」。

首先超時的一方判負。

雙方在若干步數之內都沒有吃過對方的棋子，由裁判決定結果（通常例勝之局判勝負，例和之局判和），或者使用西洋棋的50步規則，雙方在連續50步都沒有吃子時，直接判和。

長打（即長捉、長將、長殺、或一將一要殺）的一方通常判負，以下為例外情況：

將帥可以長捉（是指「可以用將/帥來長捉對方的棋子」

兵卒可以長捉（但不包括長將或長殺），雙方不變判和



## 記譜

PyChess使用中國象棋座標式記譜法，請注意這與傳同的中式記譜法不同。

中式記譜法:

[棋子][原棋子所在行][前進或後退][移動後所在行]

ex 炮二平五

座標式記譜法:

[棋子][原所在行][新座標]

ex Che2

## 說明

《座標記譜法》

座標方式是國際象棋棋譜的表示方式。它把國際象棋棋盤上
的每格格子都按座標編上記號。只要知道起始座標和到達座
標，就能記錄棋子移動的路線。

《記譜方式》

仿照國際象棋，以紅方為正面，把象棋棋盤的縱線從左到右
依次記為a b c d e f g h i，棋盤的橫線從下到上依次記為
0 1 2 3 4 5 6 7 8 9

《棋子表示方式》

帥 將 King（K）
仕 士 Advisor（A）
相 象 Bishop（B）
馬 馬 Knight（N）
車 車 Rook（R）
炮 炮 Cannon（C）
兵 卒 Pawn（P）

[註1:世界象棋聯合會推薦"相"、"象"的代號為 Elephant,E ]
[註2:世界象棋聯合會推薦"馬"的代號為 Horse,H]


《記譜方式》
「-」 移動，常省略
「+」 將軍
「#」 將殺
「x」 吃子


Ex:
1. Che2  (炮二平五) 　   Che7 (包８平５)
2. Cexe6+ (炮五進四) 　  Ade8 (士４進５)
3. Nhg2  (馬二進三) 　   Nhg7 (馬８進７)
4. Cbe2  (炮八平五) 　   Nbc7 (馬２進３)
5. Cee4  (前炮退二) 　   Rih9 (車９平８)


### 代號:

K = **K**ing 將

A = **A**dvisor 士

E = **E**lephant 象

H = **H**orse 馬

C = **C**annon 包

R = Cha**R**iot 車

P = **P**awn 卒

## WXF 記法

將中式記法轉成英文字母和數字。各種棋子H（Horse - 馬）、R（Rook - 車）、C（Cannon - 炮）和P（Pawn - 兵）代替。「平」用「=」或「.」代替；「進」、「退」和「前」、「後」分別用「+」、「-」取代。如果同一行有兩隻相同棋子，則前面的以+表示，後面的以-表示，其後不加棋子所在行。
例如四路有兩隻車，則前面那隻移到三路記做「前車平三」(R+=3)

馬2進3（H2+3）：黑方在第2條直線上的馬向前再轉左，走到第3條直線上

俥一進一（R1+1）：紅方在第一條直線上（即最右方）的俥向前一步

後砲平4（C-=4 / C-.4）：黑方在某條直線上有兩隻黑砲，將較近黑方自己的一隻移動到第4條直線



If two of the same piece are in the same file, then a + or - to specify if it's the more advanced piece (+) or the piece that's at a lower rank (-). For example, if two chariots are on the same file but on opposite sides of the river, and you wanted to move to the farther one to the center, that would be R+=5.

Finally, if there are 3 or more pawns in the same file, then the pawns are numbered in order, with the pawn closest to you being numbered 1 and so forth. Then instead of using "P", pawns are referred to by their number. So if three pawns are all on file 5, and you wanted to advance the furthest pawn forwards, that would be "35+1".

## Where are resources where I can learn Xiangqi?

[Xiangqi in English] (http://www.xqinenglish.com/) is a good place for beginners. The website owner, Jim Png Hau Cheng, has also written several books, the  “Xiangqi Primer” series, which may be a worthwhile investment for serious learners.

[Club Xiangqi](https://www.clubxiangqi.com/) is a site where you can play against tough players, most of which are Vietnamese.

## Strategy

### Piece Values

Consensus piece values are as below

Piece | Value 
------------ | ------------- 
K | Infinite
R | 9
H | 4
C | 4.5
P | 1 before river or at last rank, 2 after river
A | 2
E | 2.5

### General Principles

* Similar to the knight and bishop in chess, the horse and cannon have opposing values based on the state of the board. 
  * The horse is more defensive and less powerful in the early game because of too many pieces restricting its movement. It becomes much more powerful in the endgame when there are few pieces in its way (this is the opposite of the chess knight).  
  * The cannon is more offensive and more potent in the early game because of the pieces it can use as screens. In the endgame, when the board is empty, its power decreases significantly. 
* As above, use pieces to block the horse and elephants!
* Do not think of an elephant as a bishop; they do not at all have similar roles despite their similar movement and starting position. It is strictly a defensive piece. Its offensive utility may be as a screen for a cannon.
* *Discovery attacks* are far more prevalent in xiangqi than in chess or shogi because of the blockable pieces. Be ready to use them or defend against them.
* *Double checks* are also more common, especially with the chariot and cannon in tandem.

### Opening Principles

The following information is courtesy of [this site](http://www.shakki.info/english/openings.html)

The most common opening move is the central cannon, which is a pretty obvious move because it opens aggression down the central file. About 70% of games start this way, so it's probably the best way to start learning the game.

![Cannon opening](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/CannonOpening.png)

There are four very popular defenses, and a fifth will also be mentioned.

**1. Screen horses / Two horse defense**

![Screen horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Screen_Horses.png)

This is the most common defense. The goal of course is to have both horses protecting the center pawn. There are multiple variations.

**2. Fan Gong Ma / "Sandwich Horses"**

One horse is developed as normal, but before the other is developed, the cannon moves into a "palcorner cannon" position (cannon at the same side palace corner), then finally moves the second horse into place. Black will later connect the elephants to complete the defense. It's a relatively new opening.

![Fan Gong Ma](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Fan_Gong_Ma.png)

**3. Same Direction Cannon**

Black moves the cannon from the same side that red moved his. Red capturing the defenseless center pawn is considered a move by amateurs because it loses time and black gets the initiative.

**4. Opposite Direction Cannon**

Like the above, except the opposite cannon. The modern practice is to move the black cannon later though "Delayed Opposite Direction Cannon".

**5. Three Step Tiger**

![Three Step Tiger](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Three_Step_Tiger.png)

Black develops his chariot quickly by moving his cannon to the edge of the board. A typical sequence would be advancing the horse first, then cannon to the edge, then finally followed by chariot to the cannon's file.

Any other defenses are considered rare.

Aside from the cannon opening, Red has other options as well. These are called "soft openings" because it doesn't open with an immediate threat.

**Pawn Opening** - Advancing the 2nd or 4th pawn. This is a flexible opening allowing Red to adjust to Black's move. Black usually does not answer with the central cannon because Red could then play any of the central cannon openings with colors reversed and the pawn move would be an extra advantage.

**Elephant Opening** - Advancing an elephant to the palace instead of a cannon. This is a solid defensive opening, where the king is protected.

**Horse Opening** - Advancing a horse towards the middle. From there, Red can play the Two horse defence, Fan Gong Ma or Three Step Tiger openings with the colors reversed.

Red can also play his cannon to the front corner of the palace ("Palcorner Cannon") or to the opposite corner ("Crosspalace Cannon"). These moves are also useful developing moves.  

Other red opening moves are very rare.

<iframe width="560" height="315" src="https://www.youtube.com/embed/5EDG5RP8OZ8" frameborder="0" allowfullscreen></iframe>

<iframe width="560" height="315" src="https://www.youtube.com/embed/boT1qyDA5RA" frameborder="0" allowfullscreen></iframe>
