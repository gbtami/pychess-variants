export const variantsIni = `
# Lose at anti-chess win at anti-antichess.
[anti_antichess:giveaway]
extinctionValue = loss
stalemateValue = loss
castling = false

# Hybrid of antichess and atomic
# This might look like what you'd call coffeeatomic, but it isn't.
[antiatomic:atomic]
king = -
commoner = k
mustCapture = true
stalemateValue = win
extinctionValue = win
promotionPieceTypes = nbrqk
commoner = k
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

# Hybrid of antichess and zh. Antichess is the base variant.
[antihouse:giveaway]
pieceDrops = true
capturesToHand = true
pocketSize = 6
castling = false

# Hybrid of antichess and horde.
[antihorde:giveaway]
startFen = "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1"
doubleStepRankMin = 1
enPassantRegion = *2 *5
castling = false

# Hybrid of antichess and zh. Zh is th base variant.
[coffeehouse:crazyhouse]
mustCapture = true

# Hybrid variant of antichess and king of the hill
[coffeehill:kingofthehill]
mustCapture = true

# Hybrid variant of antichess, atomic and king of the hill
[atomic_giveaway_hill:giveaway]
blastOnCapture = true
flagPiece = k
whiteFlag = d4 e4 d5 e5
blackFlag = d4 e4 d5 e5
castling = false`