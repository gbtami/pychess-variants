# Terminology

Throughout the site and in the guides, many different terms are used. Many of these terms are global and apply to all chess variants, some apply to several (byo-yomi), and some may have different implications depending the variant (e.g. stalemate). Any terms that apply to a single variant will be discussed there (e.g. many shogi terms). This page serves as a reference to hopefully clear up any confusion!

# "Chess Variants"

Probably the most important term to clarify first is what a "**chess variant**" is. There is now doubt that games like Bughouse and Crazyhouse are chess variants, becaus they're derived from chess. However, regional games such as Xiangqi, Shogi, Janggi, and Makruk are all also labeled "chess variants," and this may cause confusion.

The biggest library for chess variants, chessvariants.com has an entire article dedicated to the topic of ["What is a chess variant?"](https://www.chessvariants.com/what.html). At Pychess, we share the same sentiments. For the sake of brevity, "chess variant" means any turn-based strategy game, derived from Chatturanga, where pieces have distinct movements, and the goal is to capture or "checkmate" the opponent's king. Even though eastern variants are not derived from chess, they share a common ancestor, and their names for the game all mean "chess." In this manner, the "chess" in chess variant instead means a general concept of chess-like game, rather than the international FIDE chess. This is analagous to sports, where "football" has a different meaning in different regions.

As chess variants can mean both variants directly based on international chess, as well as all forms of "chess" (the all-encompassing term), there is a little ambiguity here. Most of the time, we can figure out which type is being referred to based on context. Still, it is a downside of having this ambiguous term, and perhaps when discussing all kinds of chess, then a more general term "chess-like variants" could be used. Still, this is not the standard terminology used today.

# Pieces

**Fairy piece** - A piece not used in conventional chess, with the word "fairy" connotating "invented." It's unclear if pieces native to regional variants are considered "fairy pieces," but we favor not using this term for established games. However, a xiangqi cannon appearing in a chess variant (as in Shako), or a bishop appearing in a xiangqi variant would count as "fairy pieces," because they don't exist in the native game.

It should be noted that several pieces have the same piece-type, but different names. For example, the "rook" and "chariot" both referring to the same piece. The name should reflect the name used in the game being played.

## Classification

Because fairy pieces introduce dozens of possible pieces, there is a classification system for pieces. There are also notations used to describe movements, but that is outside of the scope of this page. There are three types of simple pieces:

**Riders** (also called ranging pieces) are pieces that keep moving in a direction indefinitely until obstructed by another piece or the edge of the board. The rook and bishop in chess are classic examples.

**Leapers** are pieces that have fixed movements and cannot be obstructed to reach their destination. The knight in chess is a classic example. The horse in xiangqi and janggi is a modified leaper because it can be blocked. Similar pieces have also been referred to as "lame leapers."

**Hoppers** are pieces that must first jump over another piece before it can move or capture. There are no hoppers in chess, but the cannon in Xiangqi (captures orthogonally by jumping over another piece first) as well as a different cannon in Janggi (both moves and captures orthogonally by jumping over another piece first) are the classic hoppers.

Finally, **compound pieces** are pieces that combine the moves of two simple pieces. The chess queen, which combines the rook and bishop, is a classic example. Many fairy pieces are compound pieces.

# Time Control

Time controls determine the time restrictions that govern ending the game due to one player taking too long to move. One type of game, called **correspondence** games, uses long time controls of at least several hours, typically counted in days. Players typically play their moves whenever they happen to have a break in their day. As of now, correspondence is not available on Pychess, where games are instead meant to be finished in one setting.

Games played in one sitting use a main timer set anywhere from 1 minute to 60 minutes typically, with each player having their own timer. A player may or may not have extra time throughout the game. There are three main timer types that dictate how extra time is given:

1. **(Fischer) Increment** - Every time a player ends his turn, he/she gains a fixed amount of time to their clock. A game in Pychess labeled as "10+15" means 10 *minutes* on the starting timer, and a 15 second increment. This is the standard used for most variants.

2. **Byo-yomi** - (Japanese for countdown) Once a player's main clock expires, he has a fixed amount of time to take his/her turns from that point on (i.e. extra time). This system is used in Shogi and Janggi. Multiple byo-yomi periods can be used, typically in Janggi. For example, if there are 3 periods, then that player can drain the clock up to 3 times before losing. This can be useful in a critical move, where a single period of byo-yomi is not enough time to assess the situation carefully. A game in Pychess labeled as "10+3x30(b)" means 10 *minutes* on the starting timer, then 3 periods of 30 second byo-yomi.

3. *Sudden death** - No extra time is given. A game that uses increment or byo-yomi can be played with sudden death by setting the respective slider to 0 seconds.

# General concepts

**Check** - Threatening the king with a piece that can capture it next turn if not addressed.

**Checkmate** - The primary goal in chess, where the king cannot escape check. The player that is checkmated loses.

**Stalemate** - When the king is not in check, but has no valid moves. In chess, this is a draw, but in many variants (such as xiangqi), it is a loss for the player that's stalemated.

**Repetition** - When the board state repeats itself, usually at least three times. This is often due to pieces chasing each other. Different variants handle repetition differently. Even within the same game, different federations have different rules for repetition.

**Perpetual check** - Like repetition, but one player keeps checking the king and eventually repeating the same position.

**Rank** - A row on the board.

**File** - A column on the board.

**Notation** - System used in each game to refer to the positions on the board, abbreviations for pieces, as well as movements for each turn.

**Semialgebraic Notation (SAN)** - The notation used in chess. Each move is described by using the piece name (except for the pawn), followed by its destination. Additional letters are used for disambiguation.

**Move** - A move in chess is a piece movement by both players. However, in shogi, a move is described as a single movement by each player. In chess, you can have "checkmate in 1," 2, 3, etc. But in shogi, you can only have checkmate in 1, 3, 5, 7, etc.

# Tactics

**Fork** - Attacking two pieces at the same time.

**Pin** - Attacking a piece such that it can't move, or else it would expose a much higher value piece behind it (often the king).

**Skewer** - Similar to a pin, but attacking two piecs in a line with the more valuable piece exposed in front. The more valuable piece is compelled to move, allowing the attacker to capture the exposed second piece.

**Discovered attack** - One of your pieces would normally threaten an opposing piece, but is blocked by one of your own pieces. By moving your blocking piece (and often threatening another piece at the same time), this opens up the piece behind it to attack, which is called a discovered attack. Discovered attacks are particularly prominent in Xiangqi. 

**Sacrifice** - Losing material value in order to gain a better position.
