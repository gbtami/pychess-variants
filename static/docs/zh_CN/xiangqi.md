# ![Xiangqi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/xiangqi.svg) 象棋

![Boards](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Boards.png)


象棋是中国大陆、香港、台湾、马来西亚、新加坡、越南、琉球地区所流行的传统的2人对弈棋类游戏。中国大陆为了进行区分称此为中国象棋，将西方的「Chess」称为国际象棋；台湾将「Chess」翻译为「西洋棋」。据说从春秋战国时期的「六博」演绎而来，也有一说是源自于古印度象棋恰图兰卡，传入中国成宝应象棋，最后中国人在宋代改造成中国象棋。德国西洋棋历史学家Peter Banaschak指出，唐代宰相牛僧孺的《玄怪录》内没有「炮」的宝应象棋是中国象棋的真正来源。

## 一、为何要玩中国象棋

中国象棋相较西洋棋虽需时较长，步数较多，但亦有其精采之处。中国象棋的开局更为紧凑，比起布阵决定盘面的「战略」，更需要考验棋手计算能力的「战术」。
它的局面丰富多样，行棋轻快流畅，战术凌厉，不像西洋棋常有子力拥塞的情况发生。相较西洋棋旨在发展空间，象棋更强调阻挡与抢占要道。学习象棋可以转换另类思维，加上「炮」这个复杂而特别的棋子带来许多别种棋所没有的战术，绝对可以增进你的棋感和敏锐度。
 

## 二、规则
所有的棋子都落在格子点上，且在纵横的线上移动。开局由红先行，黑其后，目的是将对方将死。与西洋棋不同的是，被困毙(stalemated无子可动)的一方算输，另外长将和(perpetual checks)在象棋中也不成立。只要有一方连续动三次一样的棋步该方就直接告负。


## 三、棋盘

象棋的棋盘由9条纵线和10条横线相交而成。棋子放在各条线的相交点上，并在线上移动。棋盘中间的一行没有画上纵线，称为「河界」，通常标上「楚河汉界」字样，象征楚汉相争时的鸿沟。现行的中式记录方法是：9条纵线，红方从右到左用汉字「一」至「九」表示，黑方在自己的那一面从右到左用数字「1」至「9」表示。也就是说，红方的纵线「一」就是黑方的纵线「9」，以此类推。第四条纵线（或第6条纵线）和第六条纵线（或第4条纵线）称为「两肋」、「两肋线」，简称「肋」。棋盘上，划有斜交叉线而构成「米」字形方格的地方，双方各有一块，称为「九宫」，是将（帅）和士（仕）活动的区域。

## 四、棋子


### 将、帅

![Kings](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Kings.png) 

只可在己方的九宫内直行或横行，每次一步。

将、帅在同一路且两个棋子之前无任何棋子时，属于违规走法，此称为「王不见王」或者「将帅对脸」。

被将死或无处可动时，该方告负。


![King and advisor movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/KingAdvisorDiagram.png)

### 士、仕

![Advisors](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Advisors.png) 

只可在己方的九宫内斜行，每次一步。
行动力较低的棋子，用作将（帅）的内防御之用。

### 象、相

 ![Elephants](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Elephants.png)
 
 ![Elephant movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/ElephantDiagram.png)

象行田：每一着斜走两步（路线如「田」字的对角线）。

塞象眼（挤象眼）：当「田」字的中心有棋子，就不能走。

与士大致相同，用作将（帅）的外防御之用。
### 马、傌

 ![Horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Horses.png)
 
 ![Horse movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/HorseDiagram.png)

马行日：先向一个方向直走两步，再横向走一步。

卡马脚(蹩马腿)：若前进两步的方向有棋子卡在第一步的位置，就不能往那个方向走。若棋子是卡在第二步的位置则还是可以跳马的。

最多能走八个方位（跟西洋棋的骑士一样，但是西洋棋的骑士并无拐马脚），有八面虎之称，近距离杀伤力最强，同时又能凭着九弯十八拐的行进路线掩藏杀机，厉害无比。
随着战局的进行，或是棋手实力越高，更易发挥其威力。

### 车、俥

 ![Chariots](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Chariots.png)
 
 ![Chariot movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/ChariotDiagram.png)

只要无子阻隔，直行或横行不限距离移动。

车为远距离杀伤力的主力，无论何时都是第2关键的子。
有「三步不出车，棋已输半盘」之称。残局有车在手，基本上不成问题；如果只有自己有车，常可稳操胜券。

### 包、炮

![Cannons](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Cannons.png)

![Cannon movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/CannonDiagram.png)

若不吃子，走法与车相同。

吃子时需与目标间有一个任何一方的棋子相隔（该子称为炮架或炮台）。

远距离杀伤力第二强，进攻时常与车和马配合使用。
开局因为棋子（炮台）众多，极为凶猛；残局时因炮架难以取得，力量大幅下降，若能换到一炮（甚至一马）会相当划算（西洋棋没有炮）

### 卒、兵

![Pawns](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Pawns.png)

![Pawn movement](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/PawnDiagram.png)

过河前每次只可向前直行一步；过河后可左右或往前走一步。

永远不能后退。

与西洋棋不同，即使打到底线也不能升变成其他棋子，但过河就能横移，加强能力。
越到残局威力越强，有时一兵（卒）可抵一马或一炮，甚至一车。

## 五、胜负:

对一般棋局来说，只要一方被「困毙」或者被「将死」，又或者自动认输，另一方即可得胜。困毙和将死定义如下：

行棋方无子可走，称为困毙。
当一方的棋子攻击范围内包含了对方的将帅，准备在下一步吃掉它，称为照将或将军，简称将。
被将军的一方必须应将，即移动将帅或别的棋子来化解。无法应将的情况称为「被将死」。

首先超时的一方判负。

双方在连续50步都没有吃子时，直接判和。

长打（即长捉、长将、长杀）的一方判负。

## 六、记谱

《棋子表示方式》

棋子 | 英文代号
------------ | ------------- 
帅 将| King（K）
仕 士| Advisor（A）
相 象| Elephant(Ｅ)
傌 马| Horse（H）
俥 车| Rook（R）
炮 包| Cannon（C）
兵 卒| Pawn（P）

在开始之前请先熟悉中式记谱法:https://zh.wikipedia.org/wiki/%E8%B1%A1%E6%A3%8B#%E4%B8%AD%E5%BC%8F%E8%A8%98%E8%AD%9C%E6%B3%95

PyChess在棋谱列使用传统西式记谱法，若要汇出PGN档案则是以中国象棋座标式记谱法表示。分述如下:

### 1. 西式记谱法:


**格式**: [棋子][原棋子所在行][前进或后退][移动后所在行]

直接将中式记法转成英文字母和数字。各种棋子以英文代号代替。 「平」用「=」代替；「进」、「退」和「前」、「后」分别用「+」、「-」取代。如果同一行有两只相同棋子，则前面的以+表示，后面的以-表示，其后不加棋子所在行。

例如:

* 马2进3（H2+3）：黑方在第2条直线上的马向前再转左，走到第3条直线上

* 俥一进一（R1+1）：红方在第一条直线上（即最右方）的俥向前一步

* 后炮平4（C-=4 / C-.4）：黑方在某条直线上有两只黑炮，将较近黑方自己的一只移动到第4条直线

### 2. 座标式记谱法:

**格式**: [棋子][新座标]

仿照国际象棋，将棋盘上每一个格子点都建立座标。

以红方为正面，把象棋棋盘的纵线从左到右依次记为

九|八|七|六|五|四|三|二|一
---|---|---|---|---|---|---|---|---
a|b|c|d|e|f|g|h|i

棋盘的横线从下到上依次记为

9|
---|
8|
7|
6|
5|
4|
3|
2|
1|
0

因此帅一开始所在的座标是e0

**记谱方式**

「-」 移动，常省略

「+」 将军

「#」 将杀

「x」 吃子

若遇到两种以上的动子可能时(例如红开局中炮)，则需另外再注明该子的行号(或列号)。

如开局炮二平五=Che2、炮八平五=Cbe2。

又如两只车都在肋道，一只在d3，一只在d2，则前车平九记为R3a3。


Ex:
1. Che2  (炮二平五) 　   Che7 (包８平５)
2. Cexe6+ (炮五进四) 　  Ade8 (士４进５)
3. Nhg2  (马二进三) 　   Nhg7 (马８进７)
4. Cbe2  (炮八平五) 　   Nbc7 (马２进３)
5. Cee4  (前炮退二) 　   Rih9 (车９平８)


## 七、策略

### 子力价值

棋子 | 分数
------------ | ------------- 
帅 将| 无限
仕 士| 2
相 象| 2.5
傌 马| 4
俥 车| 9
炮 包| 4.5
兵 卒| 1，过河后变 2

### 基本行棋原则

* 由于开局时子尚多，容易成为炮的炮架，所以炮在开局拥有相当强大的攻击性。而到残局时，由于子力变少炮容易成为孤炮，失去其战斗价值。反观马在开局时因为子力密集，易卡马脚，因此成为需被保护的弱子，待残局子力清空，马的威力才真正发挥，能在近距离控制多个点位。
* 用车控制住肋道或二、八路，并卡住相眼、马脚，或是占住河界。
* 撑起士、相以完善防守，限制对方子力在自方区域的活动能力。
* 不要让对方架住空头炮(炮、将之间没有棋子)。如此炮会将那条线完全封死。
* 开局让子力生根(互相防守)，不要轻易让马脱根。

### 开局原则

对于业余棋手来说，有70%红方开局走中炮，直接瞄准中路，目标明确且方便右翼子力出动，行棋较为套路，不易出错。



![Cannon opening](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/CannonOpening.png)

了解中炮局是对新手不错的还择，以下将简介四种黑方可以做出的应对，称为四大开局:



**1. 屏风马**

![Screen horses](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Screen_Horses.png)

屏风马是指在同一个棋局中，一位象棋棋手同时走马二进三和马八进七。

屏风马是一个防守稳健的布局，可让士象守护中宫、双马保护中兵。由于能有效果保护中兵，对将的保护很有利。

双马前进后 (即，马二进三和马八进七)，棋手一般会选择卒七进一或卒三进一，这样可让单马、甚至双马更为灵活，可立即出击。

可以有效果对抗对方红棋的当头炮开局，也可抗衡红棋比较积极进攻的中炮盘头马。

**2. 反宫马**

将炮动到士角使其更加灵活，可以直接牵制红方左翼上马八进七，往后也可发动肋道的攻势。

反宫马最明显的弱点是总有一边马没有根 (没有另一只棋子保护这只马)。

一旦没有根的反宫马被对方红棋的车压制，或被红炮瞄准攻击的时候，黑棋的防守会变得非常被动，造成难以抽出机会去反击对手。

![Fan Gong Ma](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Fan_Gong_Ma.png)

**3. 顺手炮**

顺炮 (顺手炮) 开局，是对炮局中的中炮局的一个主流开局布局。顺炮局的布局过程是后手方 (黑棋) 跟先手方走的是同一边的中炮开局。

在中国象棋中，能抢先是一个非常关键的赢棋因素。顺炮局这个开局方式其实没有大问题。相对于中炮对各种马局的开局方式，使用顺炮开局的后手方子力调动一般比较快，在一定程度上可跟先手方 (红棋) 拼抢先手。

后手方使用到顺炮开局的情况，意味着在棋局中的双方都属于偏向进攻型的棋手，双方在子力调动上都需要非常快速。先手方多数会走顺车，后手方可走横车，后手方在形势上还是能保持着均势。

**4. 对炮局**

与顺手炮相似，只是改走与对手反向的炮，

**5.三步虎**

![Three Step Tiger](https://github.com/gbtami/pychess-variants/blob/master/static/images/XiangqiGuide/Three_Step_Tiger.png)

黑方上马之后快速平边炮亮车，是较激进的走法。

### 其他先手开局
红方除了中炮局外，尚有其他开局，称为缓攻类开局，并不会如中炮对黑方直接造成威胁。

**1. 仙人指路** - 指先手走兵三进一或兵七进一，先开马前兵，意在等待后手方表露意图后再作打算，属缓攻型布局。因为它弹性大，可布成各类阵势，也非常常见。
以兵七进一为例，后手方一般的应着为：
* 炮８平５，称为还中炮，不理会挺兵而径自攻击对方中兵，属于攻击型的应着。
* 炮２平３，称为卒底炮，又称一声雷，针对挺起的兵进行攻击，同样属于攻击型的应着。
* 卒7进１，演变成对兵局，后手方针锋相对，一样不表示意图，而且同样弹性较大，之后能演变成多种不同类型的布局,同样亦是较稳健的应着。
* 象３进５，演变成仙人指路对飞象，是什为稳健的下法。
* 马８进７，演变成挺兵对起马

**2. 飞象局** - 飞象护住中路，为高手常用的下法，比起一来一往的激烈对攻，此局较为隐晦含蓄，敛藏杀机，较不入套路之流。

**3. 起马局** - 走马二进三或马八进七，是AI最为推荐，分数最高的开局

红方尚有「士角炮」、「过宫炮」等开局。


<iframe width="560" height="315" src="https://www.youtube.com/embed/5EDG5RP8OZ8" frameborder="0" allowfullscreen></iframe>

<iframe width="560" height="315" src="https://www.youtube.com/embed/boT1qyDA5RA" frameborder="0" allowfullscreen></iframe>