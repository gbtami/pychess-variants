# ![Tori Shogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/ToriShogi.svg) Tori Shogi

![International Set](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriIntl.png)![Traditional Set](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/ToriKanji.png)

*Tori Shogi* (禽将棋/鳥将棋), Japanese for Bird Chess/Shogi, is a Shogi variant invented by Toyota Genryu in 1799, although traditionally attributed to his master Ōhashi Sōei. The game is played on a 7x7 board and is one of the oldest Shogi variants to use the drop rule. The game enjoys a relative degree of popularity to this day, including English-language books and tournaments.

## Rules

Tori Shogi rules are very similar to Shogi, so we will break it down to rules that are the same and rules that are different. The goal is to checkmate the opposing player's **Phoenix**, which is essentially the King.

* **Drops** - Captured pieces can be dropped back onto the board as your move.
* **Illegal drops** - The following drops are illegal:
  * **Dropped Swallows cannot immediately mate** - Dropping a Swallow to immediately mate the opposing Phoenix. In Pychess, this will cause the player to lose. 
  * **A swallow (equivalent of a pawn) cannot be dropped into a file containing *two* swallows of the same player**. This is different from Shogi, where the rule is only *one* pawn is allowed in each file.
  * **You may not drop a piece where it can't move, such as a Swallow on the last rank.**
* **Promotions** - Certain pieces can promote. This happens either moving (not dropping) into the promotion zone, or beginning a move from the promotion zone. The promotion zone is the last two ranks of the board. *Only two* pieces promote (unlike Shogi).
  * Promotions are compulsory, unlike in Shogi.
* **Repetition** - The rule for repetition (千日手 sennichite) in Tori Shogi is that if the same position occurs three times with the same player to play by repetition of moves, the player starting the sequence must vary the move. For two positions to be considered the same, the pieces in hand must be the same, as well as the position on the board. Note that in Shogi, repetition leads to a draw.
* **Stalemate** is a loss for the player who cannot move their Phoenix. Note that this is technically not the actual rule: the real rule is an illegal move is a loss. Stalemate is a condition where the stalemated player can only make illegal moves.

*Sente/Gote* - In Pychess, sente/gote correspond to black/white. *Sente* means the first player, and in the default set, is indicated by the Phoenix having dark wings.

*Timer* - Tori Shogi uses a byo-yomi timer. Once the main clock expires, a player enters byo-yomi. If it is set at 30 seconds, then that player will only have 30 seconds to make his move from then for each of his/her moves or else lose the game on time.

## Intro to Pieces

All Tori Shogi pieces (except two) are new, and learning them may be daunting for new players. This guide will draw to simplify this as much as possible. For starters, we will use the internationalized set\*. The symbols used in the international set are unique in that nearly every piece has a *mnemonic device in the shape of the bird/picture on the piece*, where the birds point to where they move, so please take advantage of this when learning the game. How does this work? Take a look at this *fake piece* below:

![A fake piece](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/FakeBird.png)

If you were to guess, how would this make-believe piece move?  Note how it has a *long beak pointing up, long wings pointing to the sides, and long talons pointing diagonally backwards*. A logical guess would be that it moves like a *rook* orthogonally left and right (wings) and up (beak), while moving like a *bishop* diagonally backwards (talons). It also has a *small little tail poking straight down*, so it's also a reasonable assumption that this piece can also go backwards just a little bit, likely one space. Now, on to the real pieces.

Two pieces are very straightforward as they are just renamed versions of the king and pawn from Shogi. The rest of the pieces are all unique. To make things simple, these new pieces' movements fall into two main patterns: 

1. **Pieces that move like a king**
2. **Pieces whose moves resemble a Y-shape (right-side up or upside-down)**

As mentioned in the rules, **only two pieces promote**. The weakest piece in the game promotes to a very weak piece, while the strongest unpromoted piece in the game promotes into a far stronger piece. These two pieces will be discussed last, and both fall into the Y-shape class (both happen to be right-side up Y's).

\* *Note* - Unlike other East Asian variants on this site, Tori Shogi uses the internationalized set as a default. This is because of vastly increased complexity of the kanji in this game, the relative complexity of the moves (which would benefit from mnemonic devices as employed by the international pieces), and the fact that these pieces are not used in other variants as far as we know. The traditional kanji set is of course available as well.

## The Fundamental Pieces

These are the only two pieces without mnemonic devices in the birds, and these are the two pieces needed in almost every traditional chess variant. One is essentially the king, and the other is essentially a pawn, so the piece size and number should already be large clues as to which pieces these are.

### Phoenix

![Phoenix](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Phoenix.png) 

The Phoenix (鵬, *ootori*) moves exactly like a chess king: one step in any direction. In the internationalized set, sente (marked as black) is the Phoenix with dark wings, while gote (marked as white) is the Phoenix with light wings.

### Swallow

![Swallow](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Swallow.png)

The Swallow (燕, *tsubame*) is the same as the Shogi Pawn (but different than the Chess Pawn). It moves and captures by moving forward one square. This is the weakest piece in the game, just like any other pawn.

(While there is no explicit mnemonic in the Swallow's design, the bird is oriented upwards.)

The Swallow is one of the two promotable pieces, and it promotes to the **Goose**.

## King-like Pieces

![King-like pieces](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/KinglikePieces.png) 

These pieces are like the generals from Shogi, but even stronger. Why are they "king-like"? They move very much like a King (only step into any of the adjacent 8 squares) except missing a square or two, and they start right next to the Phoenix (this game's king). The key to these pieces is simply remembering which squares are their blind spots. On the international set, this is indicated by an open area in the side corresponding to the piece's blind spot.

### Falcon

![Falcon](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Falcon.png)

The Falcon (鷹, *taka*) moves like a king except *it cannot move straight backwards* (on the picture, this is the empty space between the talons and tail at the bottom of the piece). This is the most powerful unpromoted piece in the game (tied with the quails), as its large coverage allows it to deliver checkmate very easily.

The Falcon is the other of the two promotable pieces, and it promotes to the **Eagle**.

### Crane

![Crane](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Crane.png)

The Crane (鶴, *tsuru*) moves like a king except *it cannot move sideways (left or right)* (on the picture, this is the empty space between the crane and the water it's standing on -- yes, treat the water as part of the mnemonic). While not as strong as the Falcon, the Crane is also a very strong piece.

## ⅄-shaped Pieces

![Upside-down Y pieces](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/UpsidedownYPieces.png) 

The main feature of these pieces is that their move patterns resemble an upside-down Y (⅄). *One is weak and can jump (like a chess knight). The other(s) is stronger and is a ranging piece (i.e. can move as many steps as it wants in that direction).* These exact words will be repeated for the next group of pieces.

### Pheasant

![Pheasant](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Pheasant.png)

The Pheasant (雉, *kiji*) moves either one space diagonally backward or can jump two spaces straight forward. *Jump* means that it can still go there even if there is a piece in the way (like a chess/shogi knight). Essentially, this piece is the Tori Shogi equivalent of the Shogi knight.

FYI, the red circle above the pheasant is the "rising sun" -- the green pheasant depicted here is the national bird of Japan.

### Quails (Left and Right)

![LeftQuail](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/LeftQuail.png) ![RightQuail](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/RightQuail.png)

The Quails (鶉, *uzura*) start in the corners of the board and are two separate pieces called the **Left Quail** and the **Right Quail**. Their movements are mirror images of each other. Both Quails can move any number of spaces forward (like a Rook or Lance), but they can also move backwards diagonally in the direction away from their starting side of the board. For example, the *Left* Quail can move diagonally *right* (in the direction of its talons). Finally, they can also move one space diagonally backwards on the opposite side, towards the bird's tail.

The Quails are tied with the Falcon for being the strongest unpromoted piece in the game. However, unlike the Falcon, they cannot promote.

A note on the kanji set: Traditional sets just use the character for quail on the front and "left" or "right" on the back. As players playing online cannot physically peek under the pieces, we put the kanji for left (左) and right (右) above the kanji for quail.

## Y-shaped Pieces (Promoted Pieces)

![Promoted pieces](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/PromotedPieces.png) 

Finally, the last two pieces are the two promoted pieces, which also happen to share a similarity in that their move patterns resemble a Y. *One is weak and can jump (like a chess knight). The other is stronger and is a ranging piece (i.e. can move as many steps as it wants in that direction).* 

### Goose

![Goose](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Goose.png)

The Wild Goose (鴈, *kari*), or simply Goose, is the promoted form of the Swallow. It can jump exactly two spaces diagonally forward (left or right), or exactly two spaces straight backwards. Because of this unique pattern, the Goose can only reach a very limited number of spaces on the board (about one quarter of the board). 

### Eagle

![Eagle](https://github.com/gbtami/pychess-variants/blob/master/static/images/ShogiGuide/Eagle.png) 

The Mountain Hawk Eagle (鵰, *kumataka*), or simply Eagle, is the promoted form of the Falcon. Its moves are broken down into three components:

1. It ranges in a Y-shape (wings and tail) -- It can move any number of spaces diagonally forward or straight backwards.
2. It can move like a king (one step in any of the 8 spaces around the piece) -- this technically makes it a "Y-shaped piece" AND a "king-like piece", but the Y-shape is the dominant part of this piece.
3. Finally, it can also move two spaces diagonally backwards (indicated by the Eagle's talons). This is not a jumping move; it can be blocked.

This is by far the strongest piece in the game.

## Notation

George Hodges originally created a notation system in 1976 which uses two-letter piece abbreviations. As we cannot use two-letters on Pychess, we use a modified version. The notation is otherwise the same as Shogi. We will still summarize the notation for players who are not familiar with Shogi notation. 

### Coordinates

One noticeable difference is that the board coordinates are switched from chess. First is the file, then the rank. In traditional Hodges style, the first space is 1a. However, in modern days, international players prefer to use numbers (Hodgkin style), so the first space is "1-1". This is also how coordinates are described in Japanese (although with the second number written in kanji).

The origin is the bottom left for the white player/gote. However, since most diagrams are oriented for the black player (sente, first player), these will seem to originate from the top right. As an example, the white phoenix is on square 4-1.

### Piece Abbreviations
Name | Hodges  | Pychess
------------ | ------------- | -------------
Phoenix | Ph | K 
Swallow | Sw | S
Falcon | Fa | F
Crane | Cr | C
Pheasant | Ph | P 
Left Quail | LQ | L
Right Quail | RQ | R 
*Goose* | +Sw | +S
*Eagle* | +Fa | +F

For the most part, the Pychess notation should make sense, as we use the first letter of the piece names. The only problem is two pieces start with a P, the Phoenix, and Pheasant. Therefore, the Phoenix is assigned to K, as it functions as the game's king. You may also think of it as a "Phoeni**K**s."

### Symbols

* Drops are indicated with a \*. For example, a Swallow drop on 3-3 is "S\*33"
* Moves that end in promotion add a + at the end. A Swallow promoting on 1-1 would be S11+.
* Checks and checkmates are not notated.

## Strategy

### Piece Values

Here are piece values used in a Tori Shogi app ([see here](https://happyclam.github.io/project/2019-01-03/torishogiapp)). These may not be the most accurate but can serve as a reference for comparing piece values.

Piece | Value 
------------ | -------------
Swallow | 1 
Pheasant | 3
Crane | 6
Quails | 7
Falcon | 7
*Goose* | 2
*Eagle* | 16

Pieces are worth slightly less in hand, except for the Swallow, which is slightly worth more in hand.

## Handicaps

Unlike chess and more similar to go, handicaps are a big part of teaching and should not be treated as one player giving pity to another. They are a great way to learn the game, and there are even standard strategies for different types. In Shogi, handicap games are fairly standard, and Tori Shogi should be no different.

While normal games have black (*sente*) starting, **white is the handicap giver and therefore goes first**. White is called *uwate* while black is called *shitate*. Despite the handicap, the material difference can be overcome because of drops. And since there are fewer powerful pieces, black/*shitate* loses a lot more when a piece a captured.

Common handicaps are as follows:

* One-piece: Left Quail
* One-piece: Falcon
* Two-piece: Falcon and Left Quail
* Three-piece: Falcon and both Quails
