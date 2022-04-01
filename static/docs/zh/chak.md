# ![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Chak.svg) 馬雅象棋 | Chak

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Chak.png)

## 背景

國際象棋遊戲最早起源於印度，爾後演變為波斯象棋，傳播到歐洲並發展出現代的形式。東亞也有豐富的象棋變體，融合了各地的傳統文化。世界各地的許多文化都有自己的象棋，然而，美洲原住民呢？ 中美洲曾經擁有偉大的帝國。如果他們也有自己的國際象棋呢？

馬雅象棋 Chak 是Couch Tomato 於 2021 年設計的遊戲，設計理念是使用象棋常見的元素：國王、車型棋子、騎士型棋子和兵，並引入的中美洲的馬雅文化。例如，對於馬雅和其他中美洲文化來說，社會的組成圍繞著祭祀儀式；因此，神靈祭祀和神殿成了遊戲的關鍵精神。

Chak 這個詞來自馬雅神祇中雨神 Chaac，它掌管雨水、雷電與戰爭。剛好此遊戲的戰場是設在有河邊。而馬雅語中相似的兩個詞「Chuc-ah」(俘虜) 和「Ch’ak」(斬首)剛好成為了 Chak 中的 「登壇」和「將死」。

## 基本規則

分為白綠兩方，白方先行。

### 棋盤

馬雅象棋的棋盤為 9x9 :

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakBoard.png)

其中有三個特殊的區域:

-**河界**, 兩方的界限，王和兵過河後可升變，然而，**王與兵過河後不能再回去己方陣地**，只能待再對方一側。

-**神殿**, 一個象徵性的 3x3 位置，中心為**祭壇**，並無特殊功能。然而從戰略上講，神殿非常重要，因為有許多將死與登壇的戰術都在神殿發生。

-**祭壇**, 神殿的中心，將己方國王動至對方祭壇即獲勝。

### 勝負條件

有三種勝利條件:

**將死** - 對方無法防止將軍。

**困斃** - 讓對方的王無處可動。

**登壇** - 將己方王動到對方祭壇，且不能被將軍。


以下情形為和棋:

**重復動子** - 同一個局面連續重復三次。

**50步無吃子** - 如果五十步都沒有棋子被吃則和棋。


## 棋子

### 國王 (K)

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakKing.png)

國王 (*Ajaw*, 讀作 「Dachau」) 走法就如就如西洋棋的國王，朝八方走一格。

國王過河後可升變為「神王」

### 神王 (D)

![Divine King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/DivineKing.png)

神王可向任何方向移動最多*兩個*方格，也可以通過被對方棋子威脅的方格（換句話說，它不像西棋的王車易位，王的路徑上不能有棋子攻擊）。 請記住，國王一互升變，便不能退到河界後！由於其攻擊範圍，神王可以直接將未變的國王將死。

請注意，神王的符號「D」是為了與國王「K」區別。

### 美洲豹 (J)

![Jaguar](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Jaguar.png)


美洲豹的移動融合西洋棋的騎士和國王，即 

1. 先朝一個方向走兩格，再垂直走一格，就如L型。

或者:

2. 朝八方移動一步。 

這種走法在其他變體中常被稱為「半人馬」，與幕府將棋中的將軍和可汗西征棋中的禁衛相同。

由於能同時打擊多個方位，美洲豹是馬雅象棋中最強的棋子。

### 羽神(Q)

![Quetzal range](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalRange.png)

羽神的走法很特別，它類似於國際象棋皇后，因為它可以在任何方向（垂直或對角）移動任意格...... *但是*，它需要先跳過中間的棋子。對於熟悉韓國將棋的人來說，這與韓國將棋的「包」類似，但增加了對角線移動，且沒有「不能跳過對方的羽神」的限制。

羽神是第二強的棋子，但就如象棋的炮，在殘局會因為沒有炮架而失去價值。

![Quetzal example](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalLegal.png)

*範例*: 上圖中，羽神可以移動到以上格子(紅色代表吃子)。

### 祭司 (S)

![Shaman](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Shaman.png)

祭司朝前方及後方三格移動一步。

由於步伐小，它是最弱的子之一，通常用來防守。

該棋子的形狀是用來提示它的走法。

### 禿鷹 (V)

![Vulture](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Vulture.png)

禿鷹的走法就如中國象棋的馬，只是沒有拐馬腳的規則(或如西洋棋的騎士)，先朝一個方向走兩格，再垂直走一格，就如L型。

### 蚺蛇 (R)

![Serpent](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Serpent.png)

蚺蛇就如中國象棋的車，可朝一個方向任意直行。

它是第三強的子，僅次於美洲豹和羽神。

### 兵 (P)

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakPawn.png)

兵的移動與攻擊是分開的。走法就如中國象棋的過河卒，吃子的方式卻如西棋的兵。

兵過河後升變為「士」。

### 士 (W)

![Warrior](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakWarrior.png)

士的走法就如祭司，朝前方與後方三格動一步。與祭司不同的是，士不能退回河界後。

### 祭品 (O)

![Offering](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Offering.png)



祭品不能移動或吃子，它一直待在在祭壇中心。設計上不只是為了主題（玩家獻上祭品），還可作為羽神的炮架。最後，如果你自己的國王在神殿內，它還有助於擋住神王的攻擊，如果此時沒有其他棋子則會強迫和棋。如果祭品在先前己被吃了，神王就有辦法登壇。


## 子力價值

詳細價值尚未知，但以下大小關係是己知的: 美洲豹 > 羽神 > 蚺蛇 > 禿鷹 > 祭司 > 士 > 兵

## 策略 - 棋子基本動法

**羽神**: 始終注意羽神的路線。在遊戲開始時，任何移動到羽神前面的棋子都會作為炮架攻擊對方的美洲虎，這是一個稍微有利的交換。

**美洲豹**: 建立防禦並防止美洲豹過河。如果美洲豹在你的棋子生根之前就發攻擊，將可以輕鬆地捉雙。

**兵**: 兵非常靈活和強大，並且很早就可升變。正因如此，它不像其他棋種的兵那樣可任意棄子；如果您願意棄兵，請確保獲得更好局勢，因為在遊戲結束時一個兵的差距可能會左右勝敗。

**神殿**: 神殿非常重要，因為對方的神王只要到達神殿就贏棋。

## 策略 - 殘局

殘局通常在搶先登上祭壇。在本節中，我們將關注以神王為唯一攻擊棋子的殘局。

### 王 v.s 王 
![KvsKzugzwang](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKzugzwang.png)
國王是唯一的防守者，獲勝很容易。攻擊者只需要到達一個位置，他們的國王在祭壇的一側，敵人的國王在角落裡，敵人可以移動。 然后防御者被迫將國王從寺廟中移開，攻擊者可以將國王移動到祭壇上。

由於產品仍然存在，攻擊者仍然可以獲勝，但它更棘手。 攻擊者應該瞄準的不是祭壇伴侶，而是這種僵局：
With the king being the only defender's piece, the win is pretty easy. The attacker only needs to reach a position with their king on the side of the altar, enemy king in the corner with enemy to move. Then the defender is forced to move the king away from the temple and the attacker can move the king to the altar. 

With the offering still there, the attacker can still win, but it's trickier. What the attacker should be aiming for is not altar mate, but rather this stalemate:

![KvsKStalemate](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKStalemate.png)

An example line on how to force this position goes like this

![KvsKO](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKO.png)

1. Dd6+ 

2. Kf7 Dd7+ 

3. Kf2 De8

4. Kf9 Df7+

5. Ke9 De7!

...and we've reached the following position:

![KvsKOzugzwang](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKOzugzwang.png)

where green is in zugzwang; moving the king to either side allows white to respond with a stalemate.

![KvsKdraw](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKdraw.png)

However. if the defender has one more piece (except for an immobile quetzal) things change dramatically. No matter if the offering is still there or not, there is no way for the divine king to check the defender's king and cut off all squares within the temple it could go in one move, so green can always either move their other piece, or move the king within the temple. The only thing to be concerned about is blundering the other piece, so it's recommended to keep it on the last 4 ranks as the divine king can never get there. Once it's there defender, can just move (and safely premove) either moving the piece around the last 4 ranks, or the king within the temple, and the attacker is then helpless.

### 堡壘

Fortress is set up with a piece defending the altar and every piece being defended. Against such a setup, a lone king is helpless. 

![Fortresses](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Fortresses.png)

All those examples are bareboned in a sense that if either side decided to move any of their pieces away from around the temple, they can no longer form a fortress. If both sides have a bareboned fortress like in above diagrams the game is a dead draw. On the other hand, if one side has a bareboned fortress and the other has a fortress plus any extra piece, as long as that extra piece can safely cross the river without being captured and join the attack on the fortress, it's almost always a win for the side with the extra piece.

### 其他防禦

#### 美洲豹

In a lone Jaguar vs a Divine King endgame either side can force a draw by repetition
![JaguarPerpetual](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarPerpetual.png)

...except when the side with the Jaguar can just ignore their Jaguar being under attack and run their King towards the altar like in this position.

![JaguarPerpetual2](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarPerpetual2.png)

White wins by just moving their King to c4 or c2 and to the altar on the next move.

With the Offering still alive, it's a different story. 

![JaguarvsKO](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarvsKO.png)

In this position, green can go 1. Jf9; white's only move to keep attacking the Jaguar is Df7, but after 2. Je9+ Dg then 3. Jd9, then there is no way to attack the Jaguar in one move, and if white spends 2 moves to do so, green has one tempo to do something meaningful on the other side of the board. If white gets their King to f9, then after Jd8, there is again no way to attack in one move, so it's better to get the King to d7 so again we can force the Jaguar to move twice. If the draw by 50 move rule is close it might be important to remember those exact lines to enforce wasting as many moves as possible as green or save as many as white.

#### 蚺蛇

![SerpentFortress](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortress.png)

The Serpent as a long range piece can easily move back and forth along the second rank, keeping an eye on the altar. If the Divine King stays on squares from which it can reach the altar directly, the Serpent has to stay there and is usually useless in breaking through the enemy fortress. So if green has a fortress as well, it's usually a draw.

![SerpentFortressTrap](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortressTrap.png)

However, moving away from the highlighted squares to harass the Serpent can be costly, like in this position:

![SerpentFortressTrap2](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortressTrap2.png)

White has abandoned the altar, allowing green to go Re8 and skewering both Shamans. If white moves the King back, e.g. to d7, green takes on e2, and as the Serpent still defends the altar, green is winning. If white tries something different, green can take one of the Shamans and still win.
