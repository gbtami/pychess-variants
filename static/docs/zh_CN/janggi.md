# ![Janggi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Janggi.svg) 韩国将棋

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Boards.png)

韩国将棋，韩文장기(“*chahng-ghee*”)，流行于朝鲜地区的象棋类游戏，与中国象棋有相近发展的关系，在宋代以前由中国传入高丽。


## 棋盘

韩国将棋的棋盘与中国象棋的棋盘大致相同，差别在于没有河界。

### 棋盘布置

韩国将棋主要有四种开局配置，在对局开始前，双方各自都可以自由选择其中一种配置。虽然楚方是先手，但选择配置时，是由汉方先选择，才轮到楚方。配置选好后就不得更改，并由楚方先行。配置的名称主要是根据象的位置决定的。

1. 内象配置 - 两只象都在马内侧
2. 外象配置 - 两只象都在马外侧
3. 左象配置 - 左象在马外侧，右象在马内侧
4. 右象配置 - 右象在马外侧，左象在马内侧


## 棋子

韩国将棋的棋子是八角形，棋子大小不一。楚／汉为最大，表示它的重要性；然后为车、包、马和象为第二大；士、卒／兵为最小。先手方为楚，以蓝色或绿色代表，棋子名以草书汉字书写；后手方为汉，以红色代表，棋子名以正楷汉字书写。棋子只有一面写着棋子名，背面为空白，唯楚／汉例外两面都写着楚／汉，做为虚手时的用途，详见后述。

### 将 (楚／汉)

![Kings](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Kings.png) 

将 (楚／汉)的走法为在九宫内沿着直线或斜线走一步，不能离开九宫。此外将还有虚手、照面等规则，详见后述。

**照面:** 当将主动移到和对方的将在同一直线上且彼此间无棋子时，为「**照面**」，目的是邀请对方结束对局，被照面的一方若没立即移开或用棋子遮挡就必须接结束对局，以计分方式判定胜负。详见下文「**规则**」。

**虚手:** 轮到走棋的一方可以把自己的将翻面，表示弃权不走棋，直接让对方继续下，此动作为「虚手」。除了被将军时之外，任何时候都可以自由虚手，也没有次数限制，若双方都虚手则和局。韩国将棋没有困毙或逼和，当一方无子可动时只是被迫虚手，对局仍旧继续进行。

![King and advisor](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Palace.png)

### 士

![Advisors](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Advisors.png) 

士的走法为在九宫内沿着**直线**或斜线走一步，不能离开九宫，即与将相同。

### 马

 ![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Horses.png)
 
 ![Horse movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/HorseDiagram.png)
 
马的走法为直一步再斜一步，即与中国象棋的马相同，路径上若有棋子同样会被拐脚。以上图为例，打勾处为马能走到的地方，蓝色处为拐脚点。

### 象

 ![Elephants](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Elephants.png)
 
 ![Elephant movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/ElephantDiagram.png)

与中国象棋的象走田不一样，韩国将棋象是是走2x3的长方型，即先朝一个方向直走一步，再朝斜向走**两步**。与马一样，只有是行走的路径上有子就会被卡象眼。

### 车

 ![Chariots](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Chariots.png)
 
 ![Chariot movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/ChariotDiagram.png)

车的走法为沿着直线或**九宫的斜线**走任意距离。


### 包

![Cannons](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Cannons.png)

![Cannon movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/CannonDiagram.png)

与中国象棋的包不一样，不能像车一般任意移动，无论是走子或吃子都需要跳过一子。且有限制包不能吃包，且也不能跳过包移动，无论自己的还是对手的均不可跳过，故韩国将棋没有双包杀。

当包在宫中时，还可以**沿着斜线**移动。亦即，当包在宫的一角，且中宫有子时，可斜跳至宫的另一角。

总而言之，包的走法为沿着直线或**九宫的斜线**跳过一个棋子走任意距离。

### 兵、卒

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/Pawns.png)

![Pawn movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/PawnDiagram.png)

兵的走法为沿着直线或**九宫的斜线**前进一步，或横着走一步。不能后退。

## 记谱

### 缩写

K = 将

A = 士

E = 象

H = 马

C = 包

R = 车

P = 兵

现今韩国将棋的记谱方式是先以座标定位要移动的棋子，再写棋子名，最后再写目标处的座标。座标均以楚方的视角为基准，以两个阿拉伯数字表示；第一个数字表示横线，由上至下依序为1至9，最底为0；第二个数字表示緃线，由左至右依序为1至9。如：76象53，记录象从76的位置移动到53的位置。

在 Pychess 中，我们使用 (英文缩写)(初位置)-(末位置)，吃子在后方加上x，若将军则在后加上+，将死为#。

因此，左车前进三格记作 R01-71。


## 规则


1. 与国际象棋一样，目标是将死对方。

2. 与大多数其他国际象棋变体不同，Janggi可以虚手(pass)。因此，将不可能被困毙。 **要在Pychess中虚手，请双击将军，或单击右侧的pass按钮。 **

3. 当将主动移到和对方的将在同一直线上且彼此间无棋子时，为「**照面**」，目的是邀请对方结束对局，被照面的一方若没立即移开或用棋子遮挡就必须接结束对局，以计分方式判定胜负。

棋子 | 计分
------------ | ------------- 
车 | 13
包 | 7
马 | 5
象 | 3
士 | 3
卒 | 2

由于蓝方(楚方)先行较有优势，因此红方(汉方)额外获得1.5分

在可能「将军」与「照面」同时发生，此时以「照面」为优先。

4. 重复动子与长将:
* 长将与重复动子三次者者判负。
* 50步未将死则以计分决定胜负。


## 与象棋不同之处

* 棋盘无河界
* 有多种配置双方皆可各自选择；开局时将位于九宫正中心
* 象直走一步再斜走两步，无范围限制，全盘都可走
* 将走九宫的直线和斜线 
* 包移动和吃子时都必须跳过棋子，且有限制不能跳过包亦不能吃包，可跳过一子走九宫的斜线
* 除马、象外，其余棋子在宫中的走法皆改变，将、车、包、兵可走斜、士可走直。



## 策略

### 基本概念

* 因为兵可以横向移动，互相生根，所以兵形很重要，也因此通常不会建议进兵。


* 开局配置的重点是象该如何定位，这对开局有重大影响。外象能进到两个卒之间。而内象则被卒挡住。
* 再者，象的位置决定了要打开哪一边线的攻击。例如，在左象配时（并且对手象也是外象），可以将左边的卒移走，打开车的开放线，然后用象去攻击对方的包路卒。原因是现在对方的边兵不能动，如果他的边兵防守包路卒，他就会掉卒请注意，如果对手有两个内象，则改为开相反的边线。

![Activating the elephant and chariot](https://github.com/gbtami/pychess-variants/blob/master/static/images/JanggiGuide/ActiveElephant.png)

<iframe width="560" height="315" src="https://www.youtube.com/embed/KDkF2dEt41g" frameborder="0" allowfullscreen></iframe>