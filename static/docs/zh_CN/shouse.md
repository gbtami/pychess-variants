# ![S-House](https://github.com/gbtami/pychess-variants/blob/master/static/icons/SHouse.svg) 双狂S-Chess | S-House

S-House 结合了 S-Chess 和双狂象棋的规则，请先熟悉两者的规则。

## 双狂象棋的规则

除使用正统的西洋棋规则外，另外加上简化的日本将棋持驹（打入）规则。记谱方式同一般，但棋子打入时用@符号表示。每回玩家可选择移动自己的棋子，或将俘虏来的棋子放置没有被占据的格子上。将棋子放回时必须遵循下列原则：

* 可以打入棋子直接将死对方，与日本将棋不同的是，双狂象棋允许打步诘(打入兵以直接将死对方)
* 兵不得打在第一排和第八排
* 升级后的兵被俘虏后，打入时要还原成兵（与日本将棋相同，打入升变后的棋子时必须还原）
* 打入己方兵线(第二排)的兵第一步可走一格或两格
* 打入场上的车，不可进行王车易位


## 澄清

大象和老鹰一开始就可以打入场上。

## 新棋子

### 老鹰

![Hawk](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Hawk.png)

鹰的走法等于骑士加上主教。它是唯一可以直接将死对方王的棋
鹰的价值一般认为比城堡高，但比大象和后低。


### 大象

![Elephant](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/ElephantSeirawan.png)

大象的走法等同马加上城堡，一般认为它的价值比鹰高，但是跟后相等或是低一些。