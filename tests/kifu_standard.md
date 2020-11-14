# Kifu file KIF format #

## Summary ##

The KIF file format used by programs like Kakinoki Shogi and "Kifu for Series" is a text file format described below.


## Word encodings and line breaks ##

If the file extension is ".kif" then Shift-JIS encoding is used, and if it is ".kifu" then UTF-8 is used.

The line breaks follow the OS standards. For Windows, this is CRLF.


## Example of a KIF file ##

~~~
# ---- Kifu for Windows95 V3.53 棋譜ファイル ----
開始日時：1999/07/15(木) 19:07:12
終了日時：1999/07/15(木) 19:07:17
手合割：平手
先手：先手の対局者名
後手：後手の対局者名
手数----指手---------消費時間-- # この行は、なくてもいい
1 ７六歩(77) ( 0:16/00:00:16)
2 ３四歩(33) ( 0:00/00:00:00)
3 中断 ( 0:03/ 0:00:19)
~~~


## Line escape (skipped by parser) ##

Lines beginning with the "#" symbol will be escaped by the parser. These may occur anywhere.


## Handicap ##

Handicaps are give in the following format:

~~~
手合割：平手
(TN: "Handicap: even")
~~~

The handicap must be one of the following:

~~~
「平手」、「香落ち」、「右香落ち」、「角落ち」、「飛車落ち」、「飛香落ち」、「二枚落ち」、「三枚落ち」、「四枚落ち」、「五枚落ち」、「左五枚落ち」、「六枚落ち」、「八枚落ち」、「十枚落ち」、「その他」
(TN: "even", "lance", "right lance", "bishop", "rook", "rook-lance", "two piece", "three piece", "four piece", "five piece", "left [lance] five piece", "six piece", "eight piece", "ten piece", "other"
~~~

When the handicap is not specified, it is assumed to be "even".


## Players ##

After the symbols 「先手：」「後手：」「下手：」「上手：」, the player names are given. (TN: sente, gote, shitate (handicap receiver), uwate (handicap giver) respectively).


## Game information ##

Information can be input using lines starting with 「(keyword)：」 (without quotes and brackets)

Following the standard, the following keywords are possible and users can also add other fields.

~~~
(TN: English meaning is given before the symbols used - ignore the 「」 quotes)
Start date: 「開始日時」（alternatively, 「対局日」 can be used too）
The date *must* be given in the format 「1999/07/15」。

End date: 「終了日時」
Tournament: 「棋戦」
Opening: 「戦型」
Heading? (TN: no idea): 「表題」
Time control (initial starting time on clock): 「持ち時間」
Time expended: 「消費時間」
Location: 「場所」
Published? (TN: no idea): 「掲載」
Reference? (TN: I'm quite bad at this aren't I?): 「備考」

Sente's name: 「先手省略名」
Gote's name: 「後手省略名」
(TN: these name fields are there because the "Players" fields usually contain full name and title/rank, while these are the abbreviated forms used in creating diagrams or for printing.)
~~~


## Tsumeshogi information ##

~~~
(TN: Once again, translation followed by symbols)
Problem ID: 作品番号
Problem name: 作品名
Composer: 作者
Publication (the magazine/book/etc. it was published in): 発表誌
Date of publication: 発表年月
Source (TN: um not sure how this differs from the Publication field): 出典
Length (number of halfmoves): 手数
Status (whether it is cooked or sound): 完全性
Type: 分類
Prize (if it won a prize or award): 受賞
Reference (can be used like the same field for games): 備考
~~~


## Move recording ##

Moves are recorded in the following format.
~~~
<move> = [<side>]<destination coordinates><piece>[<drop/promote>]<origin coordinates>

<side> = "▲" | "△" (TN: exactly those triangle symbols; the pipe is logical OR)
▲： sente/shitate
△： gote/uwate
※Note: now, side to move is omitted.

<destination coordinates> = <xcoord><ycoord> | "同　"
<xcoord> "１"～"９": full-width Arabic numerals
<ycoord> "一"～"九": full-width kanji numbers. For reference: 一二三四五六七八九
"同　" is used when the destination coordinate is the same as that of the immediately preceding move.

<piece>: the name of the piece.
玉、飛、龍、角、馬、金、銀、成銀、桂、成桂、香、成香、歩、と
(TN: King, promoted rook, promoted rook (not a typo), bishop, promoted bishop, gold, silver, promoted silver, knight, promoted knight, lance, promoted lance, pawn, promoted pawn)
For the promoted rook, both 「龍」 and 「竜」 may be used.
For the promoted non-major pieces, the single-kanji alternatives 「全」 (promoted silver), 「圭」 (promoted knight), 「杏」 (promoted lance) may be used, e.g. as used by Tsumeshogi Paradise.

<drop/promote> = ["打" | "成"] (TN: kanji for "drop" and "promote" respectively)
Drops *must* be noted with 「打」 when they occur.
When a non-promotion by choice occurs, 「不成」 is not noted.

<origin coordinates> = "(11)"～"(99)" ： Inside the parentheses (), a two digit Arabic number with half-width characters.
~~~

Aside from the moves played, the game termination is also recorded as a move.

~~~
Game aborted: 「中断」
Resignation: 「投了」 (noting which side resigned. The time expended up to the point of resignation is also recorded.)
Jishogi (one of the draw conditions): 「持将棋」
Sennichite (repetition): 「千日手」 (indicates that the immediately preceding move resulted in sennichite. The time expended on "sennichite" is 0.
Mate: 「詰み」
Loss by time (time out/flag drop): 「切れ負け」
Illegal move win: 「反則勝ち」 (indicates that the immediately preceding move was illegal)
Illegal move loss: 「反則負け」 (indicates that the player whose turn this was supposed to be somehow lost by illegality. The reason can be recorded in a comment.)
Entering king win: 「入玉勝ち」 (indicates the player whose turn this was supposed to be declares a win by entering king.)
~~~

Example of a recorded move: ２三歩成(24)
(TN: P23+)


## Time expended ##

On the same line as the move, behind the move played, the time spent for the move is recorded.

The time is recorded within parentheses (). The first number is the time spent on that one move in (minute:seconds). The second number is that player's total time expended thus far in the game in (hours:minutes:seconds).

The time expended can be omitted.


## Initial position ##

For tsumeshogi and nonstandard starting positions, the start position is recorded before the recorded moves.

For kifu starting from the standard starting positions (including handicap games), this field can be omitted.


## Comments to moves ##

New lines immediately following a move line and beginning with an asterisk `*` indicate comments to that move. There may be multiple comment lines following a move.

For comments before the first move of the game, attach them as comments after the line for the initial position.


## Bookmark (?) ##

Lines beginning with an ampersand `&` insert a bookmark for the position after all moves played up to that point. The name of the bookmark follows the ampersand.


## Revision history ##

- 2018/6/27 this document made public
- 2018/9/21 added explanation of "loss by time"
- 2019/5/09 added explanation of "entering king win"