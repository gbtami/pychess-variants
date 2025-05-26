# melonvariant

![stratpos](../static/images/MelonvariantGuide/startpos.webp)

Is a chess variant designed in 2024-2025 by Watermelonely for the Variant Design Contest.
The idea was to make use of unique short range pieces used in Shatranj and Shogi variants while also allowing powerful pieces to exist without dominating the game, and achieve a game feel rather different to standard Chess without making use of complex pieces and rules.

## THE BOARD

Is the regular 8x8 Chess board, but divided into multiple regions with different functions.
- The 2 outer rings of the board are the deployment zones.
- The remaining 4x4 central squares are the demotion zone.
- The 4 central files confine the Kings' movement.
- The 2 first ranks are white's territory.
- The 2 last ranks are black's territory.

## RULES

- Win by checkmating your opponent's King, or by safely reaching the enemy's territory with your King.
- The player that causes the position to be repeated 3 times loses the game.
- Stalemate is a draw (though unlikely to happen)
- All captured pieces go to hand, and can be drop in the deployment zones.
- All pieces (except pawns) drop in a promoted state and have full range of movement, but are immediatly demoted if they land into the demotion zone.

## THE PIECES

### KING (KmpQ2)

![king](../static/images/MelonvariantGuide/king.webp)

Moves and captures like a Chess King, and can also move without capturing by hopping adjacent pieces to the next immediate square.
It's the royal and flag piece of the game.

### PAWN (mKpQ2)

![pawn](../static/images/MelonvariantGuide/pawn.webp)

Moves without capturing like a Chess King, and can also move and capture by hopping adjacent pieces to the next immediate square. This is the Cannon Pawn from the Chess Variant Rococo.
Pawns never promote.

### KNIGHT (N / NN)

![knight](../static/images/MelonvariantGuide/knight.webp)

Moves and captured like a Chess Knight.

![knight+](../static/images/MelonvariantGuide/knight+.webp)

Drops promoted as a Nightrider.

### COMMONER (K / Q)

![commoner](../static/images/MelonvariantGuide/commoner.webp)

Moves and captures like a Chess King.

![commoner+](../static/images/MelonvariantGuide/commoner+.webp)

Drops promoted as a Chess Queen.

### ALIBABA (AD / pQ)

![alibaba](../static/images/MelonvariantGuide/alibaba.webp)

Moves and captures like an Alibaba.

![alibaba+](../static/images/MelonvariantGuide/alibaba+.webp)

Drops promoted as a Quetzal from Chak.

### ELEPHANT (FA / BpB)

![elephant](../static/images/MelonvariantGuide/elephant.webp)

Moves and captures like the Elephant in Shako.

![elephant+](../static/images/MelonvariantGuide/elephant+.webp)

Drops promoted as a Chess Bishop + Janggi diagonal Cannon.

### MACHINE (WD / RpR)

![machine](../static/images/MelonvariantGuide/machine.webp)

Moves and captures like the Captain in Spartan Chess.

![machine+](../static/images/MelonvariantGuide/machine+.webp)

Drops promoted as a Chess Rook + Janggi Cannon.

### KIRIN (FD / BpR)

![kirin](../static/images/MelonvariantGuide/kirin.webp)

Moves and captures like the Kirin in Chu Shogi.

![kirin+](../static/images/MelonvariantGuide/kirin+.webp)

Drops promoted as a Bishop + Janggi Cannon.

### PHOENIX (WA / RpB)

![phoenix](../static/images/MelonvariantGuide/phoenix.webp)

Moves and captures like the Phoenix in Chu Shogi.

![phoenix+](../static/images/MelonvariantGuide/phoenix+.webp)

Drops promoted as a Rook + Janggi diagonal Cannon.

## NOTES

- Pawns don't promote but have free movement arround the board to compensate, and can work fine as mounts for the King to achieve campmate quicker.
- To better visualize the pieces and starting position, remember that the King side is pretty much the standard position but with leapers instead of riders (King, Elephant, Knight and Machine), and the Queen side uses the counterparts of the "regular" leapers (King to Commoner, Elephant to Kirin, Knight to Alibaba, and Machine to Phoenix).
- To better visualize the all the promotions, remember that all pieces that have movement of 1 step, gain full range movement on that direction when promoted, and that all pieces (except knights) that have a leap, replace the leap with full range cannon (hop) movement in that direction.
