# ![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Chak.svg) 馬雅象棋

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Chak.png)

## 背景

The game of chess first arose from India (or so the common theory states), from where it evolved into western Chess in Persia where it spread to Europe and developed its modern form. East Asia has multiple rich forms of chess that offer something new but also infuse their culture into it. Many cultures throughout the world have a chess of their own. However, what about the native peoples of the Americas? Mesoamerica once had great empires. What if they had a chess of their own? 

Chak is a game designed by Couch Tomato in 2021 specifically to answer this hypothetical question. The design philosophy was to start from scratch and use only the common elements from all forms of chess: a king, a rook-type piece, a knight-like piece, and some sort of pawns; the rest would develop organically infusing a specific Mesoamerican culture -- in this case, the Maya. For example, for the Maya and other Mesoamerican cultures, the native religion with ritual sacrifice was a fundamental part of society; the concept of an offering to the gods as well as the large temples are a key part of the game. 
Chak 是 Couch Tomato 在 2021 年設計的遊戲，設計理念是使用象棋常見的元素：國王、車型棋子、騎士型棋子和兵，並引入的中美洲文化——在這種情況下，就是瑪雅人。 例如，對於瑪雅人和其他中美洲文化來說，具有祭祀儀式的本土宗教是社會的基本組成部分； 祭祀神靈的概念以及大型寺廟是遊戲的關鍵部分。

The name Chak itself is derived from the Mayan God Chaac, the rain deity who possesses war-like fury. This matches the setting of Chak, which is a battlefield along a river. Finally, two words of warfare in Mayan epics include “Chuc-ah” (capture) and “Ch’ak” (decapitation).  In Chak, these are utilized as the win conditions of altar mate, and checkmate, respectively.

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

The Offering does not move or capture; it blocks the altar until captured. The piece exists not only for thematic purposes (serving as the offering at each player’s own altar), but also serves as a mount for the quetzal. Finally, because of its position, it also helps prevent your altar from a lone divine king if your own king has not left the temple, potentially forcing a draw if all other pieces are off the board. Without the offering, the divine king would be able to displace the defending king and take the altar.

祭品不能移動或吃子，它一直待在在祭壇中心。這件作品不僅出於主題目的（作為每個玩家自己的祭壇上的祭品），而且還可作為羽神的炮架。 最後，由於它的位置，如果你自己的國王沒有離開神殿，它還有助於防止你的祭壇成為一個孤獨的神王，如果所有其他棋子都離開了棋盤，則可能會迫使平局。 沒有祭品，神王就能取代守王，奪取祭壇。


## Piece valuation

Accurate piece values are unknown.  However, the following piece ranking is generally accepted: Jaguar > Quetzal > Serpent > Vulture > Shaman > Warrior > Pawn.

## Strategy - Pieces and Basics

**Quetzal**: One primary tip for beginners is always pay attention to the lines of sight for the quetzal. Specifically, at the beginning of the game, any piece that moves in front of the quetzal opens it up to an attack on the opposing jaguar, which is a slightly favorable move.

**Jaguar**: Regarding the jaguar, build defenses and prevent the jaguar from crossing the river. If the jaguar crosses before your pieces are coordinated, it can singlehandedly capture multiple pieces with ease.

**Pawns**: Pawns in Chak are actually quite flexible and strong and also threaten promotion very early. Because of all this, they are not as "expendable" as pawns in other games; make sure to get good value if you are wiling to trade off your pawns, as a one pawn difference at the end of the game could make the difference between a victory and loss.

Tempo is very, very important in Chak, as it ultimately boils down to a race to get your king to the other side. Positional play is also very important. 

## Strategy - Endgames

Endgames often boil down to getting the king to the Altar faster then our opponent. In this section we'll focus mostly on endgames where Divine King is the only attacking piece.

### King vs King
![KvsKzugzwang](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKzugzwang.png)

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

### Fortresses 

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
