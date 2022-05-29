# ![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Chak.svg) 马雅象棋 | Chak

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Chak.png)

## 背景

国际象棋游戏最早起源于印度，尔后演变为波斯象棋，传播到欧洲并发展出现代的形式。东亚也有丰富的象棋变体，融合了各地的传统文化。世界各地的许多文化都有自己的象棋，然而，美洲原住民呢？中美洲曾经拥有伟大的帝国。如果他们也有自己的国际象棋呢？

马雅象棋 Chak 是Couch Tomato 于 2021 年设计的游戏，设计理念是使用象棋常见的元素：国王、车、骑士和兵，并引入中美洲的马雅文化。例如，对于马雅和其他中美洲文化来说，社会的组成围绕着祭祀仪式；因此，神灵祭祀和神殿成了游戏的关键精神。

Chak 这个词来自马雅神祇中雨神 Chaac，它掌管雨水、雷电与战争。刚好此游戏的战场是设在河边。而马雅语中相似的两个词「Chuc-ah」(俘虏) 和「Ch’ak」(斩首)刚好成为了 Chak 中的 「登坛」和「将死」。

## 基本规则

分为白绿两方，白方先行。

### 棋盘

马雅象棋的棋盘为 9x9 :

![Chak](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakBoard.png)

其中有三个特殊的区域:

-**河界**, 两方的界限，王和兵过河后可升变，然而，**王与兵过河后不能再回去己方阵地**，只能待再对方一侧。

-**神殿**, 一个象征性的 3x3 位置，中心为**祭坛**，并无特殊功能。然而从战略上讲，神殿非常重要，因为有许多将死与登坛的战术都在神殿发生。

-**祭坛**, 神殿的中心，将己方国王动至对方祭坛即获胜。

### 胜负条件

有三种胜利条件:

**将死** - 对方无法防止将军。

**困毙** - 让对方的王无处可动。

**登坛** - 将己方王动到对方祭坛，且不能被将军。


以下情形为和棋:

**重复动子** - 同一个局面连续重复三次。

**50步无吃子** - 如果五十步都没有棋子被吃则和棋。


## 棋子

### 国王 (K)

![King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakKing.png)

国王 (*Ajaw*, 读作 「Dachau」) 走法就如就如西洋棋的国王，朝八方走一格。

国王过河后可升变为「神王」

### 神王 (D)

![Divine King](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/DivineKing.png)

神王可向任何方向移动最多*两个*方格，也可以通过被对方棋子威胁的方格（换句话说，它不像西棋的王车易位，王的路径上不能有棋子攻击）。请记住，国王一互升变，便不能退到河界后！由于其攻击范围，神王可以直接将未变的国王将死。

请注意，神王的符号「D」是为了与国王「K」区别。

### 美洲豹 (J)

![Jaguar](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Jaguar.png)


美洲豹的移动融合西洋棋的骑士和国王，即 

1. 先朝一个方向走两格，再垂直走一格，就如L型。

或者:

2. 朝八方移动一步。

这种走法在其他变体中常被称为「半人马」，与幕府将棋中的将军和可汗西征棋中的禁卫相同。

由于能同时打击多个方位，美洲豹是马雅象棋中最强的棋子。

### 羽神(Q)

![Quetzal range](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalRange.png)

羽神的走法很特别，它类似于国际象棋皇后，因为它可以在任何方向（垂直或对角）移动任意格...... *但是*，它需要先跳过中间的棋子。对于熟悉韩国将棋的人来说，这与韩国将棋的「包」类似，但增加了对角线移动，且没有「不能跳过对方的羽神」的限制。

羽神是第二强的棋子，但就如象棋的炮，在残局会因为没有炮架而失去价值。

![Quetzal example](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/QuetzalLegal.png)

*范例*: 上图中，羽神可以移动到以上格子(红色代表吃子)。

### 祭司 (S)

![Shaman](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Shaman.png)

祭司朝前方及后方三格移动一步。

由于步伐小，它是最弱的子之一，通常用来防守。

该棋子的形状是用来提示它的走法。

### 秃鹰 (V)

![Vulture](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Vulture.png)

秃鹰的走法就如中国象棋的马，只是没有拐马脚的规则(或如西洋棋的骑士)，先朝一个方向走两格，再垂直走一格，就如L型。

### 蚺蛇 (R)

![Serpent](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Serpent.png)

蚺蛇就如中国象棋的车，可朝一个方向任意直行。

它是第三强的子，仅次于美洲豹和羽神。

### 兵 (P)

![Pawn](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakPawn.png)

兵的移动与攻击是分开的。走法就如中国象棋的过河卒，吃子的方式却如西棋的兵。

兵过河后升变为「士」。

### 士 (W)

![Warrior](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/ChakWarrior.png)

士的走法就如祭司，朝前方与后方三格动一步。与祭司不同的是，士不能退回河界后。

### 祭品 (O)

![Offering](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Offering.png)



祭品不能移动或吃子，它一直待在在祭坛中心。设计上不只是为了主题（玩家献上祭品），还可作为羽神的炮架。最后，如果你自己的国王在神殿内，它还有助于挡住神王的攻击，如果此时没有其他棋子则会强迫和棋。如果祭品在先前己被吃了，神王就有办法登坛。


## 子力价值

详细价值尚未知，但以下大小关系是己知的: 美洲豹 > 羽神 > 蚺蛇 > 秃鹰 > 祭司 > 士 > 兵

## 策略 - 棋子基本动法

**羽神**: 始终注意羽神的路线。在游戏开始时，任何移动到羽神前面的棋子都会作为炮架攻击对方的美洲虎，这是一个稍微有利的交换。

**美洲豹**: 建立防御并防止美洲豹过河。如果美洲豹在你的棋子生根之前就发攻击，将可以轻松地捉双。

**兵**: 兵非常灵活和强大，并且很早就可升变。正因如此，它不像其他棋种的兵那样可任意弃子；如果您愿意弃兵，请确保获得更好局势，因为在游戏结束时一个兵的差距可能会左右胜败。

**神殿**: 神殿非常重要，因为对方的神王只要到达神殿就赢棋。

## 策略 - 残局

残局通常在抢先登上祭坛。在本节中，我们将关注以神王为唯一攻击棋子的残局。

### 王 v.s 王 

若对方国王是唯一的防守者，攻击者只需要迫使对方王移出神殿，便可以轻松登坛:

![KvsKzugzwang](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKzugzwang.png)



当祭品还在的时候，攻击者仍然可以获胜，但更加棘手。攻击者应该做的不是登坛，而是以下这种困毙：

![KvsKStalemate](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKStalemate.png)

以下是走出这种困毙的棋谱:

![KvsKO](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKO.png)

1. Dd6+ 

2. Kf7 Dd7+ 

3. Kf2 De8

4. Kf9 Df7+

5. Ke9 De7!

如此形成以下局面:

![KvsKOzugzwang](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKOzugzwang.png)

此时绿方被迫移动，白方即可走出困毙。

然而。如果防守方多出一子（不动的羽神除外），情况就会发生巨大变化，如下:

![KvsKdraw](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/KvsKdraw.png)

不管祭品是否还在，神王都没有办法将死守方的王。唯一需要担心的是下错棋，让自己多出来的一子被神王吃掉。因此建议将其保留在最后4列内，因为神王永远无法到达那里，如此双方便和棋。


### 堡垒

堡垒是指有子防守着祭坛，如此对方便无计可施: 

![Fortresses](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/Fortresses.png)

以上这些范例都意谓着，若一方将棋子移开防守，将卸掉堡垒，若双方都如此则导致和局。另一方面，若一方的堡垒有根而一方没有，该子通常可以过河并攻击对方的堡垒，通常多子的一方会获胜。

### 其他防御

#### 美洲豹

美幻豹对神王会因重复局面而和棋

![JaguarPerpetual](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarPerpetual.png)

...除非对方可以直接弃子登坛。

![JaguarPerpetual2](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarPerpetual2.png)



然而当祭品还在时，又是两码子事:

![JaguarvsKO](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/JaguarvsKO.png)

绿可走 1. Jf9; 白方唯一可以继续攻击美洲豹的走法为 Df7, 但当 2. Je9+ Dg 而 3. Jd9, 则将失去对美洲豹的威胁。而若白方花二步来攻击美洲豹， 绿方可以在河的另一头作更有义意的事。若白把王动到f9, 则 Jd8 后，同样也会失去对美洲豹的威胁。所以最好是把王动到 d7 来迫使美洲豹移动。最好记得以走法来形成和棋。

#### 蚺蛇

![SerpentFortress](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortress.png)

蚺蛇可以封住整条路线，如此神王便无法登坛。

![SerpentFortressTrap](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortressTrap.png)

而且，若神王从划记的格子离开去骚扰蚺蛇，可能会付出代价，例如:

![SerpentFortressTrap2](https://github.com/gbtami/pychess-variants/blob/master/static/images/ChakGuide/SerpentFortressTrap2.png)

绿方弃蚺蛇攻击白祭司，同时又守住绿祭坛。此时白祭司无论吃掉蚺蛇与否都无法阻止绿方登坛。