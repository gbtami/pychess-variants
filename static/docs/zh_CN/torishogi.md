# ![Tori Shogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/ToriShogi.svg) 禽将棋

|   |   |
--- | ---
![International Set](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriIntl.png) | ![Traditional Set](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriKanji.png)

禽将棋是十八世纪时，将棋九世名人大桥宗英发明的日本将棋变体，棋子皆以飞禽为名。现流行于欧美。

## 规则


* 7×7格的将棋盘，接近自己的二行横列为自阵，反之，接近对手的二行横列为敌阵。棋子进入敌阵就必须升变。
* 只有鹰与燕有升级棋，而且升级为强制性。
* 棋子共六类，若包含升级棋则八种，各方有十六颗棋子。
* 有打入与持驹规则。
* 燕的打入类同于步兵，同样不可打步诘，但可将燕打入于已有己方燕一子的一路，但不可打入己方燕已有两子以上的一路。
* 将对方的鹏将死和困毙为胜。
* 重复走子三次算和。

*计时* - 禽将棋使用byo-yomi计时，请参看「[术语](https://www.pychess.org/variants/terminology)」。



## 棋子

棋子造型预设为国际图案版，每只鸟的造型都代表其走法。

棋子走法分为两种，一种为单格型，一种为Y型。



## 单格型

单格型的棋子一次只能走一格。

### 鹏

![Phoenix](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Phoenix.png) 

等同于玉将，可向八方走一格。若被将死则输掉游戏。

### 燕

![Swallow](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Swallow.png)

可向前走一格。

升变后为**鹅**。

### 鹰

![Falcon](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Falcon.png)

可朝后方以外的方向走一格。由于可以同时攻击多方，常用于将死。

升变后为**雕**。

### 鹤

![Crane](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Crane.png)

可朝前方、后方三格走一步。

## ⅄型

![Upside-down Y pieces](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/UpsidedownYPieces.png) 

**⅄**型棋子的走法类似倒过来的英文字母**Y**。

### 雉

![Pheasant](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pheasant.png)

可向前向跳二格(不会被前方棋子阻挡)，或向后斜向走一格。

### 鹑

|   |   |
--- | ---
![LeftQuail](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/LeftQuail.png) | ![RightQuail](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/RightQuail.png)

鹑依据配置于左右两侧而走法不同，棋上会标明左或右字。

左鹑可以向前或右后方自由行走，或向左后斜向走一格。

右鹑可以向前或左后方自由行走，或向右后斜向走一格。


## **Y**型

### 鹅与雕

![Promoted pieces](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PromotedPieces.png) 


### 鹅

![Goose](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Goose.png)

为燕的升变，可向斜前方、后方跳两格。由于步伐大，它所能到达的位置很少。

### 雕

![Eagle](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Eagle.png) 

为鹰的升变。除保留原本走法外，可以向斜前与后方自由行走，或向斜后方走最多两格。

这是最强的棋子。

## 记谱

禽将棋使用类似将棋的记谱法。在Pychess中，使用较通用的棋子缩写。

### 座标

原点在白方(后手方)的最右方，也就是棋盘的左上角，先记行再记列，例如白方鹏在4-1。

### 棋子缩写
棋子 | 英文  | Pychess缩写
------------ | ------------- | -------------
鹏 | Ph | K
燕 | Sw | S
鹰 | Fa | F
鹤 | Cr | C
雉 | Ph | P 
左鹑 | LQ | L
右鹑 | RQ | R 
*鹅* | +Sw | +S
*雕* | +Fa | +F

### 记号

* 打入记作 \*。例如将燕打在3-3记作"S\*33"
* 升变会在后方加上「+」。如燕在 1-1 升变记作 S11+.
* 将和将死不特别标记。

## 策略

### 子力值值

下列是禽将棋软体列出的子力价值([看这里](https://happyclam.github.io/project/2019-01-03/torishogiapp))。

棋子 | 价值
------------ | -------------
燕 | 1 
雉 | 3
鹤 | 6
鹑 | 7
鹰 | 7
*鹅* | 2
*雕* | 16

除燕外，其他子持有在手中时价值会下降。 (其实笔者实战下来觉得鹤比鹑强。)

### 开局


基本上有四个合理的开局动作:

1+2：拿下对手的一只燕子

3+4：对角移动你的一只鹤到你的一只雉前面

若直接将鹤往前一步，对方可以将燕打入在雉前，而你无法防守。

![弱点](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriWeakSpots.png)

这些点是弱点，请记住这些点并用鹏或鹰保护，这样鹤就不必一直守住这些点！

推进鹑不是很有利（除非你想围玉）;进燕让对方吃，或特别动鹏也不好。

### 燕

燕子可以说是将棋的步兵，但也大不相同。可打入两只燕子到同行完全改变了策略。因此，燕子实际上是游戏的灵魂，知道如何运用它们是学习 Tori Shogi 的关键部分之一。

以下是有关燕子的战术:

* **双燕** (两只燕叠在一起)非常强。因为这可以锁住一条要道。缺点是你不太能够动它，也不能再打入燕在那行。

* 由于燕往往会以令人眼花缭乱的速度在场上交换，**几乎可以将它们视为货币**。手中有很多燕会让你的攻击有很大的灵活性。燕常作为棋子的前线，如果你有鹤或鹰可以生根的话，可以打入燕来推进你的前线。

* 使用燕子深入敌阵攻击时请小心，如果进入对方下二线，**它会被强迫升变成鹅**！

(顺序图)![别做这种傻事!](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriGooseMistake.png) 

### 边缘攻击

边缘攻击是发动攻击的好方法。如上所述，你可以牺牲一只燕子来推进自己的燕子，以夺取敌方的鹑(将燕打在鹑前方)。下面是成功进行边缘攻击时的顺序图(由左至右)：

![Edge Sequence!](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriEdgeSequence.png) 

由于鹑无处可緅，因此它只能选择换子: 把燕吃掉，再被对方的鹑吃。

![Edge Sequence!](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriFailedEdgeAttack.png) 

但这只有在鹑无处可动的情况下成立，如果鹑斜后方是空的，那它还是可以往那边撤退。

因此这最好用来对付对方开局将鹤动到雉前的情况，因为鹤刚好会挡到鹑。


### 残局


残局是最重要的部分。你可以打出完美的开局和中局，但如果你无法将死对方，对手可以将你的失误化为转机！残局的目标是俘虏足够的棋子来将对手的凤凰将死。你甚至不需要子力优势，只需正确的运子即可。由于将死的方式有很多，因此无法在说明中涵盖不同的情况。不过，有一些重要的提示:


* **鹤和鹰**是将军常用的子。
* **鹅**是非常弱的棋子，但常用来将杀，因为它是少数可以向前斜向攻击的棋子之一。可以用它为鹤、雕生根，以将死对方鹏。
* **鹰**很容易将对方将死。不要将它们打在鹏旁边将军（很容易跑掉），而是将其打在*可以*下一回合将到鹏的位置旁边。这样就可以升变为雕，这是一个更强大的棋子。更好的是打入鹰时，也同时威胁到另一子，形成捉双。
* **雉和鹑**也有向后斜向攻击，这对于打破鹏的防御很重要。再者，鹑有无限的对角线，可以在你攻击时用来保护你自己的鹏。请记住，当你全力将军时会一直换子，若将死不成功，对手可以使用这些新棋子来发动攻击，这就是鹌鹑非常有用的地方。
* 不能用燕子直接将死对方(将军是可以的)。

## 让子

以下是常见的让子:

* 让一子: 左鹑
* 让一子: 鹰
* 让二子: 鹰如左熟
* 让三子: 鹰与双鹑

<iframe width="560" height="315" src="https://www.youtube.com/embed/5f9QKK7cm20" frameborder="0" allowfullscreen></iframe>