# ![Shogun](https://github.com/gbtami/pychess-variants/blob/master/static/icons/shogun.svg) 幕府棋

![Shogun](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ShogunPromotions3.png)

幕府棋是一种国际象棋变体，在2019-2020被Couch Tomato推出。虽然这种变体是融西洋棋于将其的规则，原意
是用跟通常的方式引进仙灵棋子（大主教和首相）。比如说，保持8x8棋盘而非让它扩大，这样不会减损小棋子的价值。另外我们希望避免S-chess的凌乱棋盘。思想演变到让小棋子在对方底线之前升变为仙灵棋。后来“打入“也加入规则为了增加攻击性的选择而抵消防御性质由于升变的威胁。兵棋和马的独特升变以及王后的降至也加入规则为了完成主题和对称性。
名字本来暂定称为”General's Chess“，根据那时兵的升变，现在马的升变。然而，因为打入和升变地区的规则以日本将其为基础，日本語的”将军“一词听起来更合适。

## 规则

1. 布置跟国际象棋一样

2. 新棋子如上图中的定义，它们的移动是以下纤细的描述。值得注意的是升变的棋子颜色不一样。此外，王后开始的形式是升变的，尽管它有新的未升变形式（士）。为了术语的缘故，车会称为小棋子，后，首相，大主教和将军(不包括队长)被认为大棋子。

3. 升变：位于距离棋手最远的三行称为敌阵。当一枚可升级的棋子移进，移出，或者在敌阵中移动时，棋手可以选择把该棋子翻转升级或保持原装。每个起步者（或者打入者）棋子（除了王和王后外）可升级。然而，你只能拥有每种棋子一枚升变形式的。例如，如果白方拥有一枚大主教，他剩余的象不可升变直到现有的大主教被吃掉。

4. 打入：犹如日本将其和crazyhouse一样，棋手可以花一手将己方吃掉的棋子放回棋盘成为己方棋子，当一枚已升级的棋子被吃时，它的升级被取消（这样王后可变回士）。打入被限制到先五行，正确的说不可打入到对方的敌阵。步兵可打入第一行！

其他规则说明:
* 车被打入之后不可做王车易位。
* 兵被打入在第一行还可从第二行前进两格
* 吃过路兵可行，不过不可直接升变。

## 棋子

### 大主教 | 副官 | 公主 Archbishop (A)

![Archbishop](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ArchbishopShogun.png)

国际象棋变体中的一种常见的仙灵棋子。再此游戏中，它升级从象而合并马的移动。因此，只有它能单人匹马把王将死。

### 首相 | Mortar (M)

![Mortar](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Mortar.png)

首相也是常见。再次游戏中，它升级从车而合并马的移动。

### 将军 | General | Centaur (G)

![General](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/General.png)

将军的移动如马或王的走法。

### 队长 | Captain (C)

![Captain](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Captain.png)

队长升级从兵而走法跟王一样。与众不同，许多队长可能同时存在，因为它的身份是小棋子。

### 士 | Duchess | Ferz (F) 

![Duchess](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Duchess.png)

士升变到王后，它只能在后被吃掉之后能存在与棋手手中的士。士的移动为斜向一格。别忘记，士不能升为后，如果棋手已经拥有一枚后（在幕府棋中，一夫多妻是非法的!）。

## 战略

游戏还年轻，没有太多的战略！
重要是防御你的敌阵，而不让对方免费升变。战略跟Crazyhouse不一样，因为打入的严厉限制。无论怎样，王的安全有关键的重要性，而棋子价值相对位置被减少。位置包括多少方格双方能控制，特别重要是控制王周围的方格。因为兵能打入到第一行，双方可以建造一个非常坚固的城堡，不过这样不会为了对方造成问题。玩家们应该不断尝试激活他们的棋子而同时限制对方，希望如此钻孔子。
