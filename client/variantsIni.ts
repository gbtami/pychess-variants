export const variantsIni = `
# Lose at anti-chess win at anti-antichess.
[anti_antichess:giveaway]
extinctionValue = loss
stalemateValue = loss
castling = false

# Hybrid of antichess and atomic.
[antiatomic:giveaway]
blastOnCapture = true
castling = false
extinctionOpponentPieceCount = 1

[antishogun:crazyhouse]
startFen = rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR[] w KQkq - 0 1
centaur = g
archbishop = a
chancellor = m
fers = f
promotionRank = 6
promotionLimit = g:1 a:1 m:1 q:1
promotionPieceTypes = -
promotedPieceType = p:c n:g b:a r:m f:q
mandatoryPawnPromotion = false
firstRankPawnDrops = true
promotionZonePawnDrops = true
whiteDropRegion = *1 *2 *3 *4 *5
blackDropRegion = *4 *5 *6 *7 *8
immobilityIllegal = true
king = -
commoner = c
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

[antiorda:chess]
centaur = h
knibis = a
kniroo = l
silver = y
promotionPieceTypes = qh
startFen = lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1
flagPiece = k
whiteFlag = *8
blackFlag = *1
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false

[antisynochess:pocketknight]
janggiCannon = c
soldier = s
horse = h
fersAlfil = e
commoner = a
startFen = rneakenr/8/1c4c1/1ss2ss1/8/8/PPPPPPPP/RNBQKBNR[ss] w KQ - 0 1
stalemateValue = loss
perpetualCheckIllegal = true
flyingGeneral = true
blackDropRegion = *5
flagPiece = k
whiteFlag = *8
blackFlag = *1
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false

[antiempire:chess]
customPiece1 = e:mQcN
customPiece2 = c:mQcB
customPiece3 = t:mQcR
customPiece4 = d:mQcK
soldier = s
promotionPieceTypes = q
startFen = rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1
stalemateValue = loss
nFoldValue = loss
flagPiece = k
whiteFlag = *8
blackFlag = *1
flyingGeneral = true
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false

[antishinobi:crazyhouse]
commoner = c
bers = d
archbishop = j
fers = m
shogiKnight = h
lance = l
promotionRank = 7
promotionPieceTypes = -
promotedPieceType = p:c m:b h:n l:r
mandatoryPiecePromotion = true
stalemateValue = loss
nFoldRule = 4
perpetualCheckIllegal = true
startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LH1CK1HL[LHMMDJ] w kq - 0 1
capturesToHand = false
whiteDropRegion = *1 *2 *3 *4
immobilityIllegal = true
flagPiece = k
whiteFlag = *8
blackFlag = *1
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false

[anticapablanca:capablanca]
# Hybrid of antichess and minishogi.
# This might look like a coffee variant, but it isn't.
[antiminishogi:minishogi]
king = -
commoner = k
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

[antichak]
maxRank = 9
maxFile = 9
rook = r
knight = v
centaur = j
immobile = o
customPiece1 = s:FvW
customPiece2 = q:pQ
customPiece3 = d:mQ2cQ2
customPiece4 = p:fsmWfceF
customPiece5 = k:WF
customPiece6 = w:FvW
startFen = rvsqkjsvr/4o4/p1p1p1p1p/9/9/9/P1P1P1P1P/4O4/RVSJKQSVR w - - 0 1
mobilityRegionWhiteCustomPiece6 = *5 *6 *7 *8 *9
mobilityRegionWhiteCustomPiece3 = *5 *6 *7 *8 *9
mobilityRegionBlackCustomPiece6 = *1 *2 *3 *4 *5
mobilityRegionBlackCustomPiece3 = *1 *2 *3 *4 *5
promotionRank = 5
promotionPieceTypes = -
mandatoryPiecePromotion = true
promotedPieceType = p:w k:d
flagPiece = d
whiteFlag = e8
blackFlag = e2
nMoveRule = 50
nFoldRule = 3
nFoldValue = draw
stalemateValue = win
extinctionValue = win
mustCapture = true
extinctionPieceTypes = *
extinctionPseudoRoyal = false

[antigrandhouse:grand]
startFen = r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1
pieceDrops = true
capturesToHand = true
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

# Hybrid of antichess and zh. Antichess is the base variant.
[antihouse:giveaway]
pieceDrops = true
capturesToHand = true
pocketSize = 6
castling = false

# antichess with a pawn structure following horde rules.
[antipawns:horde]
king = -
commoner = k
startFen = pppppppp/pppppppp/pppppppp/8/8/PPPPPPPP/PPPPPPPP/PPPPPPPP w - - 0 1
promotionPieceTypes = nbrqk
stalemateValue = win
extinctionValue = win
mustCapture = true
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

# Hybrid of antichess and placement.
[antiplacement:placement]
king = -
commoner = k
promotionPieceTypes = nbrqk
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

# Hybrid of antichess and hoppelpoppel
[antihoppelpoppel:hoppelpoppel]
king = -
commoner = k
promotionPieceTypes = nbrqk
mustCapture = true
stalemateValue = win
extinctionValue = win
extinctionPieceTypes = *
extinctionPseudoRoyal = false
castling = false

# Hybrid of 3 check and antichess.
[coffee_3check:3check]
startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3+3 0 1
checkCounting = true
mustCapture = true

# Hybrid of rk and antichess
[coffeerace:racingkings]
mustCapture = true

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
