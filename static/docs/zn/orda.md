# ![Orda chess](https://github.com/gbtami/pychess-variants/blob/master/static/icons/orda.svg) Orda Chess

![Orda](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Orda.png)

![Legend](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/OrdaLegend.png)

Orda是一种国际象棋变体，在2020被Couch Tomato推出。这次意思是创造一体真正非对的变体，其中双方使用不同的部队。Chess with different armies 的 Ralph Betza是一个灵感，但目标是跟一个主题更加精简。主题是马这个棋子的移动。既然如此，还好仿照蒙古军队模式。事实上，Orda是阶级的人的一种军事结构，而这在英语中产生了一个新词：Horde。对方原来的军队因此成为王国，为了做对比。游戏本身按照象棋程序是极其平衡，甚至比国际象棋更平衡，双方的胜率接近一半。
 
## 规则
1.	设置如上所示。
2.	双方拥有兵和王（Horde的王名称可汗）
3.	王国是先手。
4.	Horde 不可王车易位。
5.	Horde的兵因为已经过了第二行不可前进两格，相反王国的兵可以，而可以被吃过路兵。
6.	双方的兵只可升变为后或Keshig
7.	双方有另一个生理条件：Campmate. 这个情况会出现在一个王能安全达到对方的底线。
8.	其他规则，包括stalemate和repetition跟国际象棋一样

## Horde 的棋子
有四个Horde特有的心单位：2槍骑，2射骑，2 禁衛，1 穹盧. 禁衛是最强（王和马的移动）他们带领两边，而穹盧相当若，不像王国的后。Horde的王叫做河汉，而又自己的符号，但本质上是一个王，差异就审美和主体性的槍骑和射骑很独特因为他们的移动和吃掉移动不一样（分歧的棋子，犹如兵一样）。它们的移动正是马的走法，不过槍骑的吃掉走法随车一样，射骑随象一样。禁衛更传统，它可吃犹如他可移动，阐明的说它可移动如王或马。类似地，穹盧不特别，就是日本将棋的银将。

**Horde** 棋子	| **王国** 棋子	| 移动 | 吃掉移动
-- | -- | -- | --
穹盧 | 后 | “银将” | “银将”
射骑 | 象 | 马 | 象
禁衛 | 马 | 马+王 | 马+王
槍骑 | 车 | 马 | 车

下面是每个棋子的细节和图示。绿色点代表移动，红色点代表吃掉移动，黄色点代表都可。
 
### 穹盧 | Yurt (Y)

![Yurt](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Yurt.png)
 
穹盧能移动到斜角方向或挣钱方行走一格，正犹如日本将其的银将。穹盧一开始站在后的位置，不过不像后它弱一些，即为小棋子。无论怎样，在他的小范围之内，他的控制强度很高，因为没有多棋子有兴趣跟它贸易生命。穹盧对蒙古人和土耳其人来说是一种可移动的房屋，它们的重要性和小移动能力反应在这个棋子上。

### 禁衛 | Keshig (H)

![Kheshig](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Kheshig.png)

禁衛的移动融合马和王的移动。禁衛一开始坐在一匹传统马的位置。不像马，它是Horde的最强棋子。一般来说，因为它们比其他棋子贵，最好是隐忍不发，因为首先的争夺围绕小棋子而如果一枚棋子不能轻易被吃掉反而需要逃跑，它会风险为了大局失去中心。禁衛曾经身为帝国卫队。所以理所当然的是在它们的守护下，王很难将死。

### 射骑 | Horse Archer (A)

![Horse Archer](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Archer.png)

射骑是一枚分歧棋子，移动犹如马，吃掉移动犹如象。因为它能换方格的颜色而控制比象更多的方格，它可能比象强一点。射骑在蒙古军队中一个核心部分。他们的速度和威力代表一个独特的威胁。
 
### 槍骑  | Lancer (L)

![Lancer](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Lancer.png)

槍骑是一枚分歧棋子，移动犹如马，吃掉移动犹如车。它的价值比车偏低，因为它的移动差不少，特别在终局里。它因该还比射骑强一点。虽然槍骑比车弱，他们能更快被激动。槍骑在蒙古军队中另一个核心部分，当重骑兵。
 
## 棋子价值

准确的棋子价值不清。这是Fairy-stockfish所用的，不过它们是通用值，不是为了Orda选择的。

Kingdom piece	| 价值 (早期 / 晚期) | Horde 棋子 | 价值 (早期 / 晚期)
-- | -- | -- | --
兵| 120 / 213	| 兵 | 120 / 213
后 | 2538 / 2682	| 穹盧 | 630 / 630
象 | 825 / 915	| 射骑	| 1100 / 1200
马 | 781 / 854	| 禁衛 | 1800 / 1900
车 | 1276 / 1380	| 槍骑 | 1050 / 1250

For those who want a more simplified approach, this table may be an approximation.

王国棋子	| 价值 | Horde 棋子	| 价值
-- | -- | -- | --
兵 | 1	| 兵 | 1
后	| 9	| 穹盧 | 2
象 | 3 | 射骑 | 4
马 | 3 | 禁衛 | 7
车 | 5 | 槍骑 | 4

## 战略
游戏还年轻，大部分的数据来自电脑比赛。

Horde不能王车易位，所以一个基本组成部分的战略是将河汉移动到g7。Fairy stockfish （程序）在56%的游戏中开发了Kf7。然后它没有特别强的偏向。王国的首选是d4，g3，b3，依次排列。Horde的一个主要弱点是它的棋子不能维持威胁，如果他受到攻击和需要撤退，就失去它们的攻击。国王可利用这一点。

### 开局
以下分析来自Fairy-Stockfish的喜欢

白方第一找	| 游戏比例 | 白方胜率 % | 今方胜率 % | 今方回答
-- | -- | -- | -- | --
d4 | 38%	(47) | 45% | 38% | Kf7 ~= c5 >> Hb7
g3	| 24% (30)	| 33% | 43% | Kf7 >> d5
b3 | 14% (18) | 33% | 44% | Kf7 >> Lc7
e3 | 11% (14) | 50% | 50% | Kf7 ~50% of the time
d3 | 6% (8) | 25% | 25% | e5 ~=Kf7
Nf3 | 3% (4) | 25% | 50% | e5 always
e4 | 2% (3) | 33% | 67% | d5
c4 | 1% (1) | 100% | 0% | Kf7

四个最常见开局。“Castle”代表今方很快把河汉移动到f7。小括号代表有更多的选择。

**Benko's Castle - Double Corner Opening** - 最常见
1. g3 Kf7
2. e4 Kg7
3. (Bd3 or Nf3) ...

![Benko's Castle](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/BenkoCastle.png)

*Benko's Castle after 2... Kg7*

**Stockfish Defense - Closed Variation**
1. d4 c5
2. dxc5 *bxc5*
3. c4 Kf7
4. (Nc3) ...

**Stockfish Defense - Open Variation**
1. d4 c5
2. dxc5 *dxc5*

**Stockfish Defense - Queenside Push**
1. d4 c5
2. *e3* cxd4
3. exd4 b5
4. b3 Kf7
5. c4

![Stockfish Defense Queenside Push](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/QueensidePush.png)

*Stockfish Defense- Queenside Push after 5. c4*
