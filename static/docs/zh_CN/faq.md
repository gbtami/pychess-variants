# 常见问题

## Pychess

<details><summary>什么是Pychess?</summary>

Pychess是一个提供各种象棋类变体的网站，包括各地的传统象棋与现代较新的变体。
  
请参阅 [关于](https://www.pychess.org/about).</details>

<details><summary>为何取名为Pychess?</summary>

因为此网站是以Python写成。 </details>

<details><summary>这和知名西洋棋软体Pychess有何不同?</summary>

两者都致力于象棋变体，且开发者是同一人([gbtami](https://www.github.com/gbtami))。然而， 两者的共通性只到这里，此网站的全名其实是「Pychess Variants」，但常常简称 Pychess。
  
该软体的网站在[这里](https://pychess.github.io/)</details>

<details><summary>Pychess跟 [Lichess](https://lichess.org/) 有什么关系?</summary>

Pychess网页的设计受到 Lichess 的影响，然而 Pychess 与 Lichess 并没有官方的关系。但 Pychess 使用 Lichess 的使用者帐号以方便管理。
</details>

<details><summary>什么是Fairy-Stockfish?</summary>

Stockfish是最强的西洋棋软体之一，而 [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)是由[Ianfab](https://www.github.com/ianfab)改良Stockfish而成，将其扩展到各种象棋类变体。 </details>

<details><summary>8级的Fairy-Stockfish就是最强的吗?</summary>

这是**网站**上最强的等级,但并不是Fairy-Stockfish的最高水平。要达到最高水平需要更多的计算量与时间，而Pychess上的Fairy-Stockfish被限制在几秒内就要完成移动。 </details>

<details><summary>我找到了一个Bug，可以怎么办?</summary>

你可以在github上发表[issue](https://github.com/gbtami/pychess-variants/issues/new)，毕竟我们所有的工作都在github上进行。
  
如果可以的话，请尽可能附上网址与详细说明。如果你不会用github，你可以在我们的Discord伺服器上发布，就会有人将其放上去。 </details>

## 变体

<details><summary>Pychess上有哪些变体?</summary>

请参阅[变体页面](https://www.pychess.org/variants).</details>

<details><summary>XX棋要怎么玩?</summary>

请参阅[变体页面](https://www.pychess.org/variants).同时，也可以在下棋时点选左上角该棋类的名称，就会前往该棋类的介绍页面。 </details>

<details><summary>为什么Pychess选择这些变体?</summary>

通常会加入各地流行的传统棋类，也有加入一些较常见的西洋棋变体和Pychess玩家发明的变体。然而，也还有一些变体没有被加进去。 Pychess 依靠 Fairy-Stockfish 的支援， 我们的程式码也是由它来运作，因此不被Fairy-Stockfish支援的变体是不会被放上来的。 </details>

<details><summary>Pychess会加入恰图兰卡(古印度象棋，所有象棋类游戏的源头)吗?</summary>

真正的恰图兰卡已经失传了，而且尚有许多十分相似的变体(例如:泰国象棋)，因此不会加入。如果你想玩，可以去其他有支援的网站。 </details>

<details><summary>可以新增XX棋吗?</summary>

这要看该棋是否有足够的受欢迎度。当然如果Fairy-Stockfish不能支援也就不可能.你也可以直接在我们的Discord和github上问问。 </details>

## 介面

<details><summary>我要如何改变设定?</summary>

点选右上角齿轮状按扭(使用者名称旁边)并点选 "棋盘配置".</details>

<details><summary>我要如何改变棋盘和棋子外观?有通用的国际棋子吗?</summary>

同上，点选"棋盘设定"。所有的亚洲变体都有国际棋子。 </details>

<details><summary>我要如何在棋盘上划记?</summary>

点右键可以在目标棋子上划圈，拖弋可以产生箭头。预设都是绿色的，你可以按Shift或Ctrl来改成红色，而按Alt则会变蓝。 </details>

<details><summary>时间"5+3"是什么意思?</summary>

这些是游戏时间设置，"5+3" 代表每人有 5 *分钟*, 每动一步则加 3 *秒*。你也当然也可以自由设定游戏计时。 </details>

<details><summary>"5+3(b)"那个(b)又是?</summary>

b 代表倒数计时，这与加时不同，只有特定变体会有(例如:日本将棋和韩国将棋)。当双方的时间用完时(在此范例里是五分钟)，双方每步就只剩下倒数计时的时间可以动子。在此范例中，就是每步3秒。通常倒数计时是10秒或30秒。 </details>

<details><summary>什么是电脑随机走子?</summary>

电脑随机走子是让电脑随机移动的模式，主要是用来让玩家熟悉游戏规则。之后会建议与Fairy-Stockfish (就算是比较低等级的)对奕以增进棋感。 </details>

## 帐号、社群

<details><summary>如何登入?</summary>

你要有一个 Lichess 帐号。如果你没有，请至 [Lichess](https://lichess.org/signup)注册。 </details>

<details><summary>这会使我的 Lichess 帐密外泄吗?</summary>

不可能! 这是基于 OAuth 协定且你的密码不会给予 Pychess, 就像你可以用你Google的帐号登入其他网站一样。 </details>

<details><summary>怎么跟网站的开发者联系?</summary>

你可以试试大厅的聊天功能，虽然他们可能不会随时上线。更好的方式是用[Discord](https://discord.gg/aPs8RKr)，通常都会看得到。 </details>

<details><summary>此网站是如何维持运作的?</summary>

全靠赞助 Donate ! 你也可以[成为赞助者](https://www.pychess.org/patron) 来支持我们并让Pychess网站改更好!</details>

<details><summary>我可以加入Pychess的行列吗?</summary>

当然! Pychess 完全开源，在[Github](https://github.com/gbtami/pychess-variants)上你可以尽情创作修改，也可以加入我们[Discord](https://discord.gg/aPs8RKr)来和大家一起合作!</details>