# Terminologie

Sur ce site, y compris dans les guides, on trouve partout des mots et expressions peut-être moins connus, tout faisant partie du lexique des variantes d'échecs que vous trouverez ici ou ailleurs. Certains termes sont d'usage global ; d'autres se voyent utilisés seulement dans le cadre de quelques jeux en particulier (ex. le *byoyomi* pour le shogi) ; encore d'autres s'appliquent aux plusieurs jeux, mais ont de sens différent selon le jeu (ex. le concept du *pat*). Tout terme qui est spécifique à une variante particulière sera discuté au page consacré à ladite variante. Ceci dit, ce page sera un référence pour démystifier tout le reste du lexique des variantes d'échecs.

# "Variantes d'échecs"

Il vaut mieux de clarifier d'abord ce que l'on entend par une **variante d'échecs**. Si l'on pense au jeu d'échecs classique à l'occident, des jeux comme le Bughouse et le Crazyhouse, basés sur les échecs occidentaux, valent evidémment l'appellation "des variantes d'échecs". Moins évidents sont les jeux régionaux comme le xiangqi (échecs chinois), le shogi (échecs japonais), le janggi (échecs coréens) et le makruk (échecs thaïlandais), qui sont parfois appelés aussi des variantes d'échecs, bien qu'ils ressemblent à peine aux échecs occidentaux.

Sur le grand site des variantes d'échecs, chessvariants.com, il y a un article entièrement dédié au sujet [« Qu'est-ce qu'une variante d'échecs ? » (en anglais)](https://www.chessvariants.com/what.html). Ici à Pychess, nous sommes du même avis. Nous proposons que par le terme **variante d'échecs** nous entendons tout jeu de stratégie au tour par tour, dérivé du chaturanga, où les différentes types de pièces possèdent des mouvements distincts, et dont le but est de mater le roi (ou son analogue) adverse. Les jeux d'échecs d'Asie ne sont pas dérivés des échecs occidentaux ; pourtant, ils ont tous un ancestre commun (à savoir le chaturanga), et sont tous considérés *le* jeu d'échecs dans leur pays.

Remarquons que ainsi, le mot « échecs » ne s'agit pas que du jeu d'échecs réglé par la FIDÉ mais à un concept abstrait d'un jeu d'« échecs ». Le terme « variante d'échecs » comprend aussi donc des variantes basées sur le xiangqi ou le shogi, par exemple. Nous utilisons alors le terme « jeu d'échecs » sans qualification pour designer n'importe quel variante d'échecs régionale de manière générale. Si l'on veut parler d'une variante en particulier, on la precisera.

# Pièces

**Pièce féerique** - Toute pièce qui n'est pas dans les échecs occidentaux, le mot « féerique » ayant le sens de « inventée, pas ordinaire ». Il n'est pas évident si des pièces appartenant aux échecs régionaux sont considérées « féeriques », mais nous préférons considérer qu'elles ne le sont pas dans le contexte de leur jeu d'origine. Pourtant, un canon du xiangqi apparaissant dans un variante des échecs occidentaux (voir le Shako) ou bien une dame dans une variante du shogi seront « féeriques », n'étant pas présentes dans le jeu de base.

On note bien que certaines pièces sont identiques mais s'appellent différemment dans des variantes différentes. Par exemple, la tour des échecs occidentaux et le chariot du xiangqi sont les mêmes. Il sera mieux d'utiliser le nom d'une pièce propre à la variante dont il est question.

## Classification

Because fairy pieces introduce dozens of possible pieces, there is a classification system for pieces. There are also notations used to describe movements, but that is outside of the scope of this page. There are three types of simple pieces:

**Riders** (also called ranging pieces) are pieces that keep moving in a direction indefinitely until obstructed by another piece or the edge of the board. The rook and bishop in chess are classic examples.

**Leapers** are pieces that have fixed movements and cannot be obstructed to reach their destination. The knight in chess is a classic example. The horse in xiangqi and janggi is a modified leaper because it can be blocked. Similar pieces have also been referred to as "lame leapers."

**Hoppers** are pieces that must first jump over another piece before it can move or capture. There are no hoppers in chess, but the cannon in Xiangqi (captures orthogonally by jumping over another piece first) as well as a different cannon in Janggi (both moves and captures orthogonally by jumping over another piece first) are the classic hoppers.

Finally, **compound pieces** are pieces that combine the moves of two simple pieces. The chess queen, which combines the rook and bishop, is a classic example. Many fairy pieces are compound pieces.

# Time Control

Time controls determine the time restrictions that govern ending the game due to one player taking too long to move. One type of game, called **correspondence** games, uses long time controls of at least several hours, typically counted in days. Players typically play their moves whenever they happen to have a break in their day. As of now, correspondence is not available on Pychess, where games are instead meant to be finished in one sitting.

Games played in one sitting use a main timer set anywhere from 1 minute to 60 minutes typically, with each player having their own timer. A player may or may not have extra time throughout the game. There are three main timer types that dictate how extra time is given:

1. **(Fischer) Increment** - Every time a player ends his turn, he/she gains a fixed amount of time to their clock. A game in Pychess labeled as "10+15" means 10 *minutes* on the starting timer, and a 15 second increment. This is the standard used for most variants.

2. **Byo-yomi** - (Japanese for countdown) Once a player's main clock expires, he has a fixed amount of time to take his/her turns from that point on (i.e. extra time). This system is used in Shogi and Janggi. Multiple byo-yomi periods can be used, typically in Janggi. For example, if there are 3 periods, then that player can drain the clock up to 3 times before losing. This can be useful in a critical move, where a single period of byo-yomi is not enough time to assess the situation carefully. A game in Pychess labeled as "10+3x30(b)" means 10 *minutes* on the starting timer, then 3 periods of 30 second byo-yomi.

3. **Sudden death** - No extra time is given. A game that uses increment or byo-yomi can be played with sudden death by setting the respective slider to 0 seconds.

# General concepts

**Check** - Threatening the king with a piece that can capture it next turn if not addressed.

**Checkmate** - The primary goal in chess, where the king cannot escape check. The player that is checkmated loses.

**Stalemate** - When the king is not in check, but has no valid moves. In chess, this is a draw, but in many variants (such as xiangqi), it is a loss for the player that's stalemated.

**Repetition** - When the board state repeats itself, usually at least three times. This is often due to pieces chasing each other. Different variants handle repetition differently. Even within the same game, different federations have different rules for repetition.

**Perpetual check** - Like repetition, but one player keeps checking the king and eventually repeating the same position. Rules for perpetual check similarly vary between variants and governing federations.

**Rank** - A row on the board.

**File** - A column on the board.

**Notation** - System used in each game to refer to the positions on the board, abbreviations for pieces, as well as movements for each turn.

**Standard Algebraic Notation (SAN)** - The notation used in chess. Each move is described by using the piece name (except for the pawn), followed by its destination. Additional letters are used for disambiguation.

**Move** - A move in chess is a piece movement by both players. However, in shogi, a move is described as a single movement by each player. In chess, you can have "checkmate in 1," 2, 3, etc. But in shogi, you can only have checkmate in 1, 3, 5, 7, etc.

**Drop** - A move made by taking a captured piece and dropping it onto the board as your own. This is a staple of Shogi and Crazyhouse, but cannot be done in chess. Variants that allow drops are called "drop variants," and there are several in Pychess (often with the suffix "house")

**Promotion Zone** - The area of the board in which pieces can promote. In chess, only pawns can promote on the furthest rank. However, in shogi, the promotion zone is the last three ranks, and most pieces can promote. Other variations can vary on how the promotion zone is defined.

# Tactics

**Fork** - Attacking two pieces at the same time. Knights most commonly deliver forks in all variants. In drop variants, rooks and bishops are also a little more capable of delivering forks, especially bishops.

![Fork example](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Fork.png)

**Pin** - Attacking a piece such that it can't move, or else it would expose a much higher value piece behind it (often the king).

![Pin example](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Pin.png)

**Skewer** - Similar to a pin, but attacking two pieces in a line with the more valuable piece exposed in front. The more valuable piece is compelled to move, allowing the attacker to capture the exposed second piece.

![Skewer example](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Skewer.png)

**Discovered attack** - One of your pieces would normally threaten an opposing piece, but is blocked by one of your own pieces. By moving your blocking piece (and often threatening another piece at the same time), this opens up the piece behind it to attack, which is called a discovered attack. Discovered attacks are particularly prominent in Xiangqi. 

![Discovered attack example](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Discovery.png)

In this situation, moving the knight to threaten the black queen also opens a discovered check on the king by the rook. Since black must respond to the check, white can then take the queen. If the black queen and king were switched, the end result would the same (black losing a queen).

**Sacrifice** - Losing material value in order to gain a better position.

![Sacrifice example](https://github.com/gbtami/pychess-variants/blob/master/static/images/CVariantsGuide/Sacrifice.png)

In this example, if the white queen takes the black knight, it can easily be retaken by a pawn. However, that would open the knight to deliver checkmate (red arrow). The queen was sacrificed for a much greater reward.
