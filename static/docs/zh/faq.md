# 常見問題

## Pychess

<details><summary>什麼是Pychess?</summary>

Pychess是一個提供各種象棋類變體的網站，包括各地的傳統象棋與現代較新的變體。
  
請參閱 [關於](https://www.pychess.org/about).</details>

<details><summary>為何取名為Pychess?</summary>

因為此網站是以Python寫成。</details>

<details><summary>這和知名西洋棋軟體Pychess有何不同?</summary>

兩者都致力於象棋變體，且開發者是同一人([gbtami](https://www.github.com/gbtami))。然而， 兩者的共通性只到這裡，此網站的全名其實是「Pychess Variants」，但常常簡稱 Pychess。
  
該軟體的網站在[這裡](https://pychess.github.io/)</details>

<details><summary>Pychess跟 [Lichess](https://lichess.org/) 有什麼關係?</summary>

Pychess網頁的設計受到 Lichess 的影響，然而 Pychess 與 Lichess 並沒有官方的關係。但 Pychess 使用 Lichess 的使用者帳號以方便管理。
</details>

<details><summary>什麼是Fairy-Stockfish?</summary>

Stockfish是最強的西洋棋軟體之一，而 [Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish)是由[Ianfab](https://www.github.com/ianfab)改良Stockfish而成，將其擴展到各種象棋類變體。</details>

<details><summary>8級的Fairy-Stockfish就是最強的嗎?</summary>

這是**網站**上最強的等級,但並不是Fairy-Stockfish的最高水平。要達到最高水平需要更多的計算量與時間，而Pychess上的Fairy-Stockfish被限制在幾秒內就要完成移動。</details>

<details><summary>我找到了一個Bug，可以怎麼辦?</summary>

你可以在github上發表[issue](https://github.com/gbtami/pychess-variants/issues/new)，畢竟我們所有的工作都在github上進行。
  
如果可以的話，請儘可能附上網址與詳細說明。如果你不會用github，你可以在我們的Discord伺服器上發佈，就會有人將其放上去。</details>

## 變體

<details><summary>Pychess上有哪些變體?</summary>

請參閱[變體頁面](https://www.pychess.org/variants).</details>

<details><summary>XX棋要怎麼玩?</summary>

請參閱[變體頁面](https://www.pychess.org/variants).同時，也可以在下棋時點選左上角該棋類的名稱，就會前往該棋類的介紹頁面。</details>

<details><summary>為什麼Pychess選擇這些變體?</summary>

通常會加入各地流行的傳統棋類，也有加入一些較常見的西洋棋變體。然而，也還有一些變體沒有被加進去。Pychess 依靠 Fairy-Stockfish 的支援， 我們的程式碼也是由它來運作，因此不被Fairy-Stockfish支援的變體是不會被放上來的。</details>

<details><summary>Pychess會加入恰圖蘭卡(古印度象棋，所有象棋類遊戲的源頭)嗎?</summary>

真正的恰圖蘭卡已經失傳了，而且尚有許多十分相似的變體(例如:泰國象棋)，因此不會加入。如果你想玩，可以去其他有支援的網站。</details>

<details><summary>可以新增XX棋嗎?</summary>

這要看該棋是否有足夠的受歡迎度。當然如果Fairy-Stockfish不能支援也就不可能.你也可以直接在我們的Discord和github上問問。</details>

## 介面

<details><summary>我要如何改變設定?</summary>

點選右上角齒輪狀按扭(使用者名稱旁邊)並點選 "棋盤配置".</details>

<details><summary>我要如何改變棋盤和棋子外觀?有通用的國際棋子嗎?</summary>

同上，點選"棋盤設定"。所有的亞洲變體都有國際棋子。</details>

<details><summary>我要如何在棋盤上劃記?</summary>

點右鍵可以在目標棋子上劃圈，拖弋可以產生箭頭。預設都是綠色的，你可以按Shift或Ctrl來改成紅色，而按Alt則會變藍。</details>

<details><summary>時間"5+3"是什麼意思?</summary>

Th這些是遊戲時間設置，"5+3" 代表每人有 5 *分鐘*, 每動一步則加 3 *秒*。你也當然也可以自由設定遊戲計時。</details>

<details><summary>"5+3(b)"那個(b)又是?</summary>

The b signifies byo-yomi time control, which is different from increment, and is only used in certain variants (i.e. Shogi and Janggi). Each player has a fixed time bank (5 minutes, in this example), and then after that, they only have the byo-yomi period for the rest of their moves before losing. In this example, that means only 3 seconds per move. Typically, byo-yomi is played with more than just 3 seconds... usually anywhere from 10 seconds to 30 seconds.</details>

<details><summary>什麼是電腦隨機走子?</summary>

電腦隨機走子是讓電腦隨機移動的模式，主要是用來讓玩家熟悉遊戲規則。之後會建議與Fairy-Stockfish (就算是比較低等級的)對奕以增進棋感</details>

## 帳號、社群

<details><summary>如何登入?</summary>

你要有一個 Lichess 帳號。如果你沒有，請至 [Lichess](https://lichess.org/signup)註冊。</details>

<details><summary>這會使我的 Lichess 帳密外洩嗎?</summary>

No! That is done via OAuth and your password isn't revealed to Pychess, just like how you can log in to third-party websites with your Google or Facebook accounts.</details>

<details><summary>What's the best way to contact the developers?</summary>

You can try the lobby chat, although the developers might not be on to answer. More reliably, we use [Discord](https://discord.gg/aPs8RKr).</details>

<details><summary>How is the site supported?</summary>

Purely through donations. You can [become a patron](https://www.pychess.org/patron) to help us make this site better!</details>

<details><summary>Can I contribute?</summary>

You sure can! Pychess is open source. Please communicate your suggestions by [Github](https://github.com/gbtami/pychess-variants) or [Discord](https://discord.gg/aPs8RKr) </details>


