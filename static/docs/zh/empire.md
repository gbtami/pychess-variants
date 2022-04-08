# ![Empire chess](https://github.com/gbtami/pychess-variants/blob/master/static/icons/empire.svg) 帝国棋 | Empire Chess

![Empire](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Empire.png)

是一种国际象棋变体，在2019-2020被Couch Tomato推出，非对称性变体系列之四。强大的帝国(金方）听说过以为在战场上大权在握的女士，所以以为帝国国公提出了结婚。可惜，王国的国王反而娶了她。受辱的凯撒带着军队出发去惩罚他们！

黄军非常强大，所有的棋子（国公之外）比对方对应强。主题像可汗v王室的主题，不过用后的走法代替吗的走法。另一个独特的规则是王凯撒对峙（象棋也有），这可增加将死的可能性。游戏是按照象棋程序极其平衡。双方的胜率接近一半。  

## General Rules
1.	设置如上所示
2.	帝国（金方）是先手
3.      帝国的兵因为已经过了第二行不可前进两格，相反王国的兵可以，而可以被吃过路兵。
4.	双方的兵只可升变为后
5.	**王凯撒对峙** - 王，凯撒在同一路（性或列）且两个棋子之间无任何棋子时，属于违规走法。
6.	**Campmate** - 双方有另一个生理条件，这个情况会出现在一个王能安全达到对方的底线。
7.	**Stalemate** - 没有合法的棋步代表失败（不是按照国际象棋的和平）
8.	**Repetition** - 三次重负同一局面代表失败
8.	帝国不可王车易位
9.	其他规则，包括王国的移动和吃过路兵跟国际象棋一样

## 帝国棋子

有五个新棋子属于帝国所用，2卒，2塔，2赢，2主教，1国公。帝国所有的第一行棋子可安然移动如后，攻击如他们王国的对应。国公是例外，只可攻击如王。帝国的王名称凯撒，有自己的表示不过跟对方的王实际上没有区别。

下面是每个棋子的细节和图示。绿色点代表走法，红色点代表吃掉走法，黄色点代表都可

### 卒 | Soldier (S)
![Soldier](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/EmpireSoldier.png)

卒正是象棋升变过的兵，可左右或往前走一步，不可升变。

### 国公 | Duke (D)

![Duke](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Duke.png)

国公是后对应。他可移动如后，但只能攻击为一个王。这不代表他太弱了，在残局中他可跟一枚棋子的帮助把王将死，甚至凯撒（因为王凯撒对峙）。

### 塔 | (T)

![Siege Tower](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Tower.png)

塔有后的安然走法，为了攻击有车的走法。算是一辆车加上象的安然走法。塔是帝国最强的棋子。

### 赢 (E)

![Eagle](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Eagle.png)

赢可如后移动，不过只可如马攻击。赢的价值跟马差不多所以是帝国最差的棋子（兵和卒之外）。

### 主教 | Cardinal (C)

![Cardinal](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Cardinal.png)

主教可如后移动，不过只可如象攻击。所以它算是一只象加上一辆安然车的走法。因为不像象，他可换方格的颜色，他不比塔若多少，算是帝国威力排名第二。

## 棋子价值

不清，下文是Fairy-Stockfish所用。

王国棋子	| 价值 (早期 / 晚期) | 帝国棋子 | 价值 (早期 / 晚期)
-- | -- | -- | --
兵 | 120 / 213	| 兵 | 120 / 213
后 | 2538 / 2682	| 国公 | 1050 / 1150
象 | 825 / 915	| 主教	| 1225 / 1420
马 | 781 / 854	| 赢 | 1000 / 1075
车 | 1276 / 1380	| 塔 | 1375 / 1480
 | | | 卒 | 200 / 270
