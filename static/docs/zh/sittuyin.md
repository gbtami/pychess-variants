# ![Sittuyin](https://github.com/gbtami/pychess-variants/blob/master/static/icons/sittuyin.svg) 緬甸象棋

![Sittuyin](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Sittuyin.png?raw=true)

**緬甸象棋**,是流行於緬甸的圖版遊戲，由印度的恰圖蘭卡演變而來。其發音「Sittuyin」，來自恰圖蘭卡的梵語音轉。or Burmese Chess is a classic board game native to Myanmar and is very similar to Makruk. The game is played in Myanmar, and although western chess is more popular there, there are efforts to revitalize the game. The pieces have the same movements as Makruk (Thai Chess), but the rules are slightly different. The game is plenty of fun in its own right, with its own balance/dynamics. The slightly slower pace can provide a good way to cultivate patience, and to hone strategic thinking.

## Rules

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


Since it is rare for one side to be up by two pieces, the easy-to-promote-to general is commonly present in most endgames, assisting the stronger side in delivering checkmate.

For the disadvantaged side, a general is a good decoy which must be trapped and captured before the bare king can be forced into checkmate. It can either stay near the general for additional protection, or failing that, lead enemy pieces away from it. Scattering the enemy pieces in this fashion can cost them valuable time to reorganize, thus giving the defending side some extra chance to draw the game under counting rules.

### 象

![Elephant](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Elephant.png?raw=true)

The elephant moves one step diagonally or one step forward, just like the silver general in shogi.

The elephant is a powerful piece for controlling squares immediately in front of it, and for shouldering off enemy forces. It is also a good defender around its king.

The elephant is worth more than the queen, but generally not as much as a knight. The justification may be that isolated knights have little trouble escaping from an enemy king, while isolated bishops can fall.

Elephants can sometimes prove slow/awkward to maneuver or retreat. It is therefore advisable to have some friendly pieces nearby to support and rescue them. In the endgame, it's usually safer to get a lone king behind the enemy bishop, compared to staying in its front.

### 馬

 ![Horse](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Horse.png?raw=true)

馬走法與西洋棋的騎士相同，移動為跳躍至2x3的對角格，可以越子(沒有卡馬腳)。。

馬在緬甸象棋中是強子，儘量讓它保持在中央，以控制更多方格。

### 車

 ![Chariot](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Chariot.png?raw=true)


車走法與象棋的車相同，移動為直向任意格。無西洋棋的王車易位規則。

車是最強的子，主宰著盤面。


### Feudal lord

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/SittuyinGuide/Pawn.png?raw=true)

The pawn, or feudal lord, moves and attacks the same as a pawn in chess. However, there is no double-step first move. 

#### 升變
After a feudal lord reaches the diagonal line on the opponent's side of the board, the player can choose to promote that piece into a general instead of moving. Each side can only has *one* general at any given time, so this can only occur if their general has already been captured. Promotion does not happen on the move where the feudal lord reaches the promotion square, but rather any move after that.

In the act of promotion, the feudal lord can promote on the same square it is on (in-place), or any one of the adjacent diagonal squares. On pychess, **in-place promotion** is performed by a **double-click** on the feudal lord, and **diagonal promotion** is performed by **moving** it to the desired square.

However, there are some more restrictions. Promotion cannot be made such that the new general will capture an enemy piece, attack an enemy piece, attack the enemy king, or put the enemy king in a discovery check.

If you have only one feudal lord left on the board, then it has the ability to promote on any square.

Finally, if your only legal moves are promotion, you may opt not to promote and claim stalemate. On pychess, you can do so by **pressing the draw button** on the right side.

## 其他規則

*Stalemate* - Draw, as in International Chess

*Dead Position* - When checkmate is not possible with the remaining pieces, the game is a draw.

*Repetition* - The game may be drawn if the same position has occurred at least three times.

*50 Move Rule* - The game may be drawn if each player has made at least 50 consecutive moves without the movement of any pawn and without any capture.

*Counting Rule* - As soon as a player has only a king left on his side, the number of pieces belonging to the opponent shall be observed. If the opponent has no pawns, the game is drawn when the player having only a king (lone king) manages to escape in a number of fixed moves against an opponent having particular pieces shown below:
- If the opponent has at least one **rook**: 16 moves
- If the opponent has at least one **bishop**: 44 moves
- If the opponent has at least one **knight**: 64 moves

## 泰國象棋vs 緬甸象棋
 
緬甸象棋是一款與泰國象棋非常相似的遊戲，可以被視為是加速的泰國象棋，可能會跳過大約十幾個開局動作。緬甸象棋有一半的兵從第四排開始，而所有泰國象棋兵則從第三排開始。
 
泰國象棋必須通過策略進行開局設置，而緬甸象棋開局可以直接將棋子放置在想要的位置。
 
泰國象棋的兵可升變成數個士，很快就可以投入戰鬥。這使得泰國象棋兵比緬甸象棋兵更有價值。


 
## 策略

大多數棋子一次只能走一格，因此最好成小組式的移動，以提供相互支持。不要試圖多方面打開戰鬥，協調才是關鍵。

## 戰術
 
**車是唯一可以串打的棋子，其它的棋子主要用於捉雙。**

Most Sittuyin and Makruk games will actually reach the bitter (near) end.
When one side has only a bare king remaining, there are certain "counting rules" (see above) which come into effect and put pressure on the stronger side. Such requirements offer the weaker side an incentive to play out the whole game. Therefore it is crucial to master all the basic checkmates against a lone king. There just isn't much point in playing these games if one can't finish off the bare King at the end.
 
Because there is no promotion to heavy pieces, it becomes harder to force a checkmate after the existing pieces have left the board. Plan accordingly and leave yourself with enough fire power.
 
Please allow yourself enough time on the clock, as many of those mates require precision.
 
