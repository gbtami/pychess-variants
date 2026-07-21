# Chess with Different Armies

Chess with Different Armies (CWDA) was designed by Ralph Betza. Each player chooses one of four armies whose pieces are intended to have roughly equal strength. Use the **Alternate Start** menu to choose both armies. Matchups are listed as **first player's army — second player's army**, using Clobberers, Knights, and Rookies as short names for the three fairy armies.

Kings and pawns move exactly as in Chess. Check, checkmate, stalemate, en passant, the fifty-move rule, and repetition also follow the usual Chess rules.

## Armies

The back-rank order in every army is rook replacement, knight replacement, bishop replacement, queen replacement, king, then the same pieces in reverse order.

Army | Rook replacement | Knight replacement | Bishop replacement | Queen replacement
--- | --- | --- | --- | ---
FIDE | R (`R`) | N (`N`) | B (`B`) | Q (`Q`)
Colorbound Clobberers | D (`BD`) | W (`WA`) | A (`FAD`) | C (`BN`)
Nutty Knights | G (`fsRbK`) | I (`FvN`) | H (`fhNbKsW`) | O (`KfsRfhN`)
Remarkable Rookies | S (`R4`) | M (`WD`) | F (`FDH`) | E (`RN`)

The expressions in parentheses use [Betza notation](https://www.chessvariants.com/piececlopedia.dir/betza.html) to describe how each piece moves.

## Piece movement

These diagrams show the twelve fairy pieces from White's perspective. Standard FIDE pieces are omitted. Directional pieces reverse their forward and backward directions when played by Black.

<section class="cwda-betza-diagrams">
{% include "cwda_diagrams.html" %}
</section>

## Promotion and castling

A pawn may promote to any non-king piece belonging to either army in the game. For example, FIDE versus Nutty Knights offers the four FIDE promotion pieces and all four Nutty Knights pieces.

The rook replacements can castle. In a Colorbound Clobberers matchup, queenside castling moves the king to the b-file and the D piece to the c-file. Fairy-Stockfish currently configures that destination per matchup rather than per color, so in a mixed Colorbound game the opponent's queenside castling also uses the b-file destination.

This implementation offers the Alfaerie piece set and CouchTomato's Cburnett-style CWDA set. See also the [Chess with Different Armies overview](https://en.wikipedia.org/wiki/Chess_with_different_armies) and [Betza's original rules](https://www.chessvariants.com/unequal.dir/cwda.html).
