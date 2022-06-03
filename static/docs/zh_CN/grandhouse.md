# ![Grandhouse](https://github.com/gbtami/pychess-variants/blob/master/static/icons/Grandhouse.svg) 双狂大象棋

双狂大象棋的规则就如双狂象棋与西洋大象棋，只是略有修改。

## 双狂象棋规则

除使用正统的西洋棋规则外，另外加上简化的日本将棋持驹（打入）规则。记谱方式同一般，但棋子打入时用@符号表示。每回玩家可选择移动自己的棋子，或将俘虏来的棋子放置没有被占据的格子上。将棋子放回时必须遵循下列原则：

* 允许打步诘(即打入兵将死对方，这与日本将棋不同)。
* 兵不能打在己方底线或**8 - 10 列**!
* 升变后的兵被吃掉后会还原成兵打入场上。
* 打入在己方第三列(就是兵初始所在列)的兵允许第一步动二格。

**与双狂象棋不同之处**: *兵不能打在8 - 10 列(对方前三列)*

## 西洋大象棋规则

以下全都来自西洋大象棋的规则:

使用10\*10格的棋盘。

棋子布置为第三横行皆为兵卒。第二横行布置从白方左侧、黑方右侧开始，皆为空格、骑士、主教、皇后、国王、首相、大主教、主教、骑士、空格。底横行的左右角各有一城堡。

除了新增棋子和初始配置不同外，另有以下三个新增规则:

* 兵在到达第八列及第九列时升变，到第十列时则**必需**升变，若无法升变(见下点)，则该兵不可至进到第十行。
* 兵只能升变成与它同色的棋子，且该棋子已经失去。
* 没有王车易位。

其余规则与正统象棋同。

## 新棋子

### 大主教

![Cardinal](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Princesses.png)

大主教，Archbishop ：走法同西洋棋的主教 + 骑士(看棋子的样子就知道了吧!)。记法简称为A。

![Cardinal moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Archbishop.png)


大主教是唯一可以单独将死对方王的棋子。

通常认为大主教的价值大于城堡，但逊于大象和王后。

### 首相

![Marshal](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Empresses.png)

首相，Chancellor ：走法同西洋棋的城堡 + 骑士，记法简称为C。 (还有另一个名称为大象，只会在S-Chess中使用)

![Marshal moves](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Chancellor.png)


棋子价值比大主教高，但逊于或等于王后。

## 策略


请不要以「象棋」的观念，一开始就急于出动子力，在西洋大象棋中，有时重复的动同一子反而会给对方造成更多威胁。

子力价值与传统西洋棋同，由于打入的规则你可以不断地换子、弃子打入，并擅用骑士和兵的捉双。你也可以打入子在国王旁边加强防守。