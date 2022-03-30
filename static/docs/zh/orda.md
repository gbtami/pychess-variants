# ![Orda chess](https://github.com/gbtami/pychess-variants/blob/master/static/icons/orda.svg) 可汗 v.s 王室 | Orda

![Orda](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Orda.png)

![Legend](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/OrdaLegend.png)

可汗v王室是一种国际象棋变体，於2020由Couch Tomato推出。这次创造的是一個非对稱的变体，双方使用不同的棋種。靈感來自Chess with different armies 的 Ralph Betza，走的是草原民族風格。仿照蒙古军队的特色，主題是「馬」的移動。事实上，Orda是一种蒙古军事结构，意為皇室，而这也在英语中产生了一个新词：Hordeーー遊牧民族。為了描繪拔都西征，敵對的军队是歐洲王室。游戏本身极其平衡，甚至比国际象棋更平衡，双方的胜率接近一半。
 
## 规则
1.	设置如上所示。
2.	双方拥有兵和王（可汗）
3.	王室方是先手。
4.	可汗不可王车易位。
5.	可汗的兵因为已经过了第二行不可前进两格，相反王国的兵可以，而可以被吃过路兵。
6.	双方的兵只可升变为后或禁衛
7.	双方有另一个勝利條件：達陣ーー當一方的王能安全达到对方底线的時候，該方勝利。
8.	其他规则跟国际象棋一样，包括逼和(無子可動算和棋)和長將和。

## 可汗方的棋子
有四个可汗特有的新棋種：2槍骑，2射骑，2 禁衛，1 穹盧. 禁衛最强（王和马的移动），而穹盧相当弱，不如王国的后。Horde的王叫做可汗，有自己的符号，但本质上就是國王，差异就造型和主題而已。槍骑和射骑很特別，因为他们的動子和吃子方式不一样（犹如西洋棋的兵一样）。射騎以馬的走法移動，以主教的方式吃子;槍骑也是以馬的走法移動，而以车的走法吃子。禁衛吃子與移動沒有差別，走法是王+馬。穹盧則就如日本将棋的银将般移動和吃子。

**可汗** 棋子	| **王室** 棋子	| 移动 | 吃掉移动
-- | -- | -- | --
穹盧 | 后 | “银将” | “银将”
射骑 | 象 | 马 | 主教
禁衛 | 马 | 马+王 | 马+王
槍骑 | 车 | 马 | 车

下面是每个棋子的细节和图示。绿色点代表移動走法，红色点代表吃子走法，黄色点代表都可。
 
### 穹盧 | Yurt (Y)

![Yurt](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Yurt.png)
 
穹盧能移动到斜角方向或往正前方行走一格，犹如日本将其的银将。穹盧一开始站在后的位置，不过不像后它很弱，即为輕子。但在他的小范围之内，他的控制强度很高，因为没有人想跟他換子。穹盧对蒙古人和突厥人来说是一种可移动的房屋，它们的重要性和小移动能力反应在这个棋子上。

### 禁衛 | Keshig (H)

![Kheshig](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Kheshig.png)

禁衛的移动融合马和王的移动。禁衛一开始位於西洋棋「馬」的位置。不像马，它是Horde的最强棋子。一般来说，因为它们比其他棋子重要，最好是不要輕易出動，因为開局的争夺围绕著小棋子，而如果禁衛因為被威脅而需要逃跑，你會因此而失先。禁衛本身是帝国的卫队，所以在它们的守护下，王很难被将死。

### 射骑 | Horse Archer (A)

![Horse Archer](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Archer.png)

射骑是一枚分歧棋子，移动犹如马，吃子犹如主教。因为它能换方格的颜色而控制比主教更多的方格，所以比主教强一点。射骑是蒙古军队中一个核心主力，他们的速度和威力帶來凶猛的威胁。
 
### 槍骑  | Lancer (L)

![Lancer](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Lancer.png)

槍骑是一枚分歧棋子，移动犹如马，吃子犹如车。它的价值比车偏低，因为它的移动較慢，特别是在殘局。它應该还比射骑强一点。虽然槍骑比车弱，他们的機動性更強。槍骑是蒙古军队中另一个核心主力，做為重骑兵。
 
## 棋子价值

准确的棋子价值尚不清楚。以下是Fairy-stockfish所評估的。

王室方	| 价值 (前期 / 後期) | 可汗方 | 价值 (前期 / 後期)
-- | -- | -- | --
兵| 120 / 213	| 兵 | 120 / 213
后 | 2538 / 2682	| 穹盧 | 630 / 630
象 | 825 / 915	| 射骑	| 1100 / 1200
马 | 781 / 854	| 禁衛 | 1800 / 1900
车 | 1276 / 1380	| 槍骑 | 1050 / 1250

下表更為簡明

王室方	| 价值 | 可汗方	| 价值
-- | -- | -- | --
兵 | 1	| 兵 | 1
后	| 9	| 穹盧 | 2
象 | 3 | 射骑 | 4
马 | 3 | 禁衛 | 7
车 | 5 | 槍骑 | 4

## 战略
游戏推出尚早，大部分的数据来自电脑對弈。

可汗不能王车易位，所以一个基本的战略是将可汗移动到g7。Fairy stockfish程序在56%的游戏中走了Kf7。王室方的首选依序是d4，g3，b3。可汗方的主要弱点是它的棋子不能保持威胁，如果他受到攻击而需要撤退，就失去它们原先的攻擊。国王方可利用这一点。

### 开局
以下分析来自Fairy-Stockfish的評估

王室方第一步	| 游戏比例 | 白方胜率 % | 金方胜率 % | 金方應手
-- | -- | -- | -- | --
d4 | 38%	(47) | 45% | 38% | Kf7 ~= c5 >> Hb7
g3	| 24% (30)	| 33% | 43% | Kf7 >> d5
b3 | 14% (18) | 33% | 44% | Kf7 >> Lc7
e3 | 11% (14) | 50% | 50% | Kf7 ~50% of the time
d3 | 6% (8) | 25% | 25% | e5 ~=Kf7
Nf3 | 3% (4) | 25% | 50% | e5 always
e4 | 2% (3) | 33% | 67% | d5
c4 | 1% (1) | 100% | 0% | Kf7

四个最常见开局。“易位”代表金方很快把可汗移动到f7。小括号代表其他选择。

**本科易位 - 雙角攻擊** - 最常见
1. g3 Kf7
2. e4 Kg7
3. (Bd3 or Nf3) ...

![Benko's Castle](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/BenkoCastle.png)

*本科易位 2... Kg7*

**Stockfish 防禦 - 封閉變例**
1. d4 c5
2. dxc5 *bxc5*
3. c4 Kf7
4. (Nc3) ...

**Stockfish Defense - 開放變例**
1. d4 c5
2. dxc5 *dxc5*

**Stockfish Defense - 后翼推進**
1. d4 c5
2. *e3* cxd4
3. exd4 b5
4. b3 Kf7
5. c4

![Stockfish Defense Queenside Push](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/QueensidePush.png)

*Stockfish Defense - 后翼推進，走5. c4*
