export const variantsIni = `
# Hybrid variant of Grand-chess and crazyhouse, using Grand-chess as a template
[grandhouse:grand]
startFen = r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R[] w - - 0 1
pieceDrops = true
capturesToHand = true

# Hybrid variant of Gothic-chess and crazyhouse, using Capablanca as a template
[gothhouse:capablanca]
startFen = rnbqckabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQCKABNR[] w KQkq - 0 1
pieceDrops = true
capturesToHand = true

# Hybrid variant of Embassy chess and crazyhouse, using Embassy as a template
[embassyhouse:embassy]
startFen = rnbqkcabnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKCABNR[] w KQkq - 0 1
pieceDrops = true
capturesToHand = true

[gorogoroplus:gorogoro]
startFen = sgkgs/5/1ppp1/1PPP1/5/SGKGS[LNln] w 0 1
lance = l
shogiKnight = n
promotedPieceType = l:g n:g

[cannonshogi:shogi]
# No Shogi pawn drop restrictions
dropNoDoubled = -
shogiPawnDropMateIllegal = false
# Soldier is Janggi soldier
soldier = p
# Gold Cannon is exactly like Xiangqi cannon
cannon = u
# Silver Cannon moves and captures like Janggi cannon
# Janggi cannons have this EXCEPTION:
# The cannon cannot use another cannon as a screen. Additionally, it can't capture the opponent's cannons.
# This is NOT exists here.
customPiece1 = a:pR
# Copper Cannon is diagonal Xiangqi cannon
customPiece2 = c:mBcpB
# Iron Cannon is diagonal Janggi cannon 
customPiece3 = i:pB
# Flying Silver/Gold Cannon 
customPiece4 = w:mRpRmFpB2
# Flying Copper/Iron Cannon 
customPiece5 = f:mBpBmWpR2
promotedPieceType = u:w a:w c:f i:f p:g
startFen = lnsgkgsnl/1rci1uab1/p1p1p1p1p/9/9/9/P1P1P1P1P/1BAU1ICR1/LNSGKGSNL[-] w 0 1

[shogun:crazyhouse]
startFen = rnb+fkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB+FKBNR[] w KQkq - 0 1
commoner = c
centaur = g
archbishop = a
chancellor = m
fers = f
promotionRegionWhite = *6 *7 *8
promotionRegionBlack = *3 *2 *1
promotionLimit = g:1 a:1 m:1 q:1
promotionPieceTypes = -
promotedPieceType = p:c n:g b:a r:m f:q
mandatoryPawnPromotion = false
firstRankPawnDrops = true
promotionZonePawnDrops = true
whiteDropRegion = *1 *2 *3 *4 *5
blackDropRegion = *4 *5 *6 *7 *8
immobilityIllegal = true

[orda:chess]
centaur = h
knibis = a
kniroo = l
silver = y
promotionPieceTypes = qh
startFen = lhaykahl/8/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1
flagPiece = k
flagRegionWhite = *8
flagRegionBlack = *1

[khans:chess]
centaur = h
knibis = a
kniroo = l
customPiece1 = t:mNcK
customPiece2 = s:mfhNcfW
promotionPawnTypesBlack = s
promotionPieceTypesBlack = t
stalemateValue = loss
nMoveRuleTypesBlack = s
flagPiece = k
flagRegionWhite = *8
flagRegionBlack = *1
startFen = lhatkahl/ssssssss/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1

[synochess:pocketknight]
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
flagRegionWhite = *8
flagRegionBlack = *1

[shinobi:crazyhouse]
commoner = c
bers = d
archbishop = j
fers = m
shogiKnight = h
lance = l
promotionRegionWhite = *7 *8
promotionRegionBlack = *2 *1
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
flagRegionWhite = *8
flagRegionBlack = *1

[shinobiplus:crazyhouse]
commoner = c
bers = d
dragonHorse = f
archbishop = j
fers = m
shogiKnight = h
lance = l
promotionRegionWhite = *7 *8
promotionRegionBlack = *1 *2 *3
promotionPieceTypes = -
promotedPieceType = p:c m:b h:n l:r
mandatoryPiecePromotion = true
stalemateValue = loss
nFoldRule = 4
perpetualCheckIllegal = true
startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K3[JDFCLHM] w kq - 0 1
capturesToHand = false
whiteDropRegion = *1 *2 *3 *4
immobilityIllegal = true
flagPiece = k
flagRegionWhite = *8
flagRegionBlack = *1

[ordamirror:chess]
centaur = h
knibis = a
kniroo = l
customPiece1 = f:mQcN
promotionPieceTypes = lhaf
startFen = lhafkahl/8/pppppppp/8/8/PPPPPPPP/8/LHAFKAHL w - - 0 1
flagPiece = k
flagRegionWhite = *8
flagRegionBlack = *1

[empire:chess]
customPiece1 = e:mQcN
customPiece2 = c:mQcB
customPiece3 = t:mQcR
customPiece4 = d:mQcK
soldier = s
promotionPieceTypes = q
startFen = rnbqkbnr/pppppppp/8/8/8/PPPSSPPP/8/TECDKCET w kq - 0 1
stalemateValue = loss
nFoldValue = win
flagPiece = k
flagRegionWhite = *8
flagRegionBlack = *1
flyingGeneral = true

[chak]
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
promotionRegionWhite = *5 *6 *7 *8 *9
promotionRegionBlack = *5 *4 *3 *2 *1
promotionPieceTypes = -
mandatoryPiecePromotion = true
promotedPieceType = p:w k:d
extinctionValue = loss
extinctionPieceTypes = kd
extinctionPseudoRoyal = true
flagPiece = d
flagRegionWhite = e8
flagRegionBlack = e2
nMoveRule = 50
nFoldRule = 3
nFoldValue = draw
stalemateValue = loss

[chennis]
maxRank = 7
maxFile = 7
mobilityRegionWhiteKing = b1 c1 d1 e1 f1 b2 c2 d2 e2 f2 b3 c3 d3 e3 f3 b4 c4 d4 e4 f4
mobilityRegionBlackKing = b4 c4 d4 e4 f4 b5 c5 d5 e5 f5 b6 c6 d6 e6 f6 b7 c7 d7 e7 f7
customPiece1 = p:fmWfceF
cannon = c
commoner = m
fers = f
soldier = s
king = k
bishop = b
knight = n
rook = r
promotionPieceTypes = -
promotedPieceType = p:r f:c s:b m:n
promotionRegionWhite = *1 *2 *3 *4 *5 *6 *7
promotionRegionBlack = *7 *6 *5 *4 *3 *2 *1
startFen = 1fkm3/1p1s3/7/7/7/3S1P1/3MKF1[] w - 0 1
pieceDrops = true
capturesToHand = true
pieceDemotion = true
mandatoryPiecePromotion = true
dropPromoted = true
castling = false
stalemateValue = loss

# Mansindam (Pantheon tale)
# A variant that combines drop rule and powerful pieces, and there is no draw
[mansindam]
variantTemplate = shogi
pieceToCharTable = PNBR.Q.CMA.++++...++Kpnbr.q.cma.++++...++k
maxFile = 9
maxRank = 9
pocketSize = 8
startFen = rnbakqcnm/9/ppppppppp/9/9/9/PPPPPPPPP/9/MNCQKABNR[] w - - 0 1
pieceDrops = true
capturesToHand = true
shogiPawn = p
knight = n
bishop = b
rook = r
queen = q
archbishop = c
chancellor = m
amazon = a
king = k
commoner = g
centaur = e
dragonHorse = h
bers = t
customPiece1 = i:BNW
customPiece2 = s:RNF
promotionRegionWhite = *7 *8 *9
promotionRegionBlack = *3 *2 *1
mandatoryPiecePromotion = true
doubleStep = false
castling = false
promotedPieceType = p:g n:e b:h r:t c:i m:s
dropNoDoubled = p
stalemateValue = loss
nMoveRule = 0
nFoldValue = win
flagPiece = k
flagRegionWhite = *9
flagRegionBlack = *1
immobilityIllegal = true

[fogofwar:chess]
king = -
commoner = k
castlingKingPiece = k
# extinction rules prevents to get valid moves for fog FENs ceated on server side
#extinctionValue = loss
#extinctionPieceTypes = k

# Hybrid variant of xiangqi and crazyhouse
[xiangqihouse:xiangqi]
startFen = rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR[] w - - 0 1
pieceDrops = true
capturesToHand = true
dropChecks = false
whiteDropRegion = *1 *2 *3 *4 *5
blackDropRegion = *6 *7 *8 *9 *10
mobilityRegionWhiteFers = d1 f1 e2 d3 f3
mobilityRegionBlackFers = d8 f8 e9 d10 f10
mobilityRegionWhiteElephant = c1 g1 a3 e3 i3 c5 g5
mobilityRegionBlackElephant = c6 g6 a8 e8 i8 c10 g10
mobilityRegionWhiteSoldier = a4 a5 c4 c5 e4 e5 g4 g5 i4 i5 *6 *7 *8 *9 *10
mobilityRegionBlackSoldier = *1 *2 *3 *4 *5 a6 a7 c6 c7 e6 e7 g6 g7 i6 i7

# Hybrid variant of makruk and crazyhouse
[makrukhouse:makruk]
startFen = rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR[] w - - 0 1
pieceDrops = true
capturesToHand = true
firstRankPawnDrops = true
promotionZonePawnDrops = true
immobilityIllegal = true

[makbug:makrukhouse]
startFen = rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR[] w - - 0 1
capturesToHand = false
twoBoards = true

# WIP
[melonvariant:chess]

# PIECES
#Cannon Pawn
customPiece1 = p:mKpQ2

#Commoner
commoner = g
#Knight
#Elephant
fersAlfil = e
#Machine
customPiece2 = l:WD
#Alibaba
customPiece3 = s:AD
#Kirin
customPiece4 = f:FD
#Phoenix
customPiece5 = h:WA

#Commoner+ (Queen)
#Knight+ (Nightrider)
customPiece6 = c:NN
#Elephant+
customPiece7 = b:BpB
#Machine+
customPiece8 = r:RpR
#Alibaba+
customPiece9 = m:pQ
#Kirin+
customPiece10 = a:BpR
#Phoenix+
customPiece11 = w:RpB

#Cannon King
customPiece12 = k:KmpQ2

# ROYALTY
extinctionPieceTypes = k
extinctionPseudoRoyal = true
mobilityRegionWhiteCustomPiece12 = c* d* e* f*
mobilityRegionBlackCustomPiece12 = c* d* e* f*

# CAMPMATE
flagPiece = k
flagRegionWhite = *7 *8
flagRegionBlack = *1 *2
flagPieceSafe = true

# PROMOTIONS
promotionRegionWhite = c3 d3 e3 f3 c4 d4 e4 f4 c5 d5 e5 f5 c6 d6 e6 f6
promotionRegionBlack = c3 d3 e3 f3 c4 d4 e4 f4 c5 d5 e5 f5 c6 d6 e6 f6
promotedPieceType = q:g c:n b:e r:l m:s a:f w:h
mandatoryPiecePromotion = true

# DROPS
pieceDrops = true
capturesToHand = true
whiteDropRegion = *1 *2 *7 *8 a* b* g* h*
blackDropRegion = *1 *2 *7 *8 a* b* g* h*

# OTHER RULES
perpetualCheckIllegal = true
nFoldValue = loss
startFen = +r+c+bk+q+a+m+w/pppppppp/8/8/8/8/PPPPPPPP/+W+M+A+QK+B+C+R[] w - 0 1

# MARTIAL ARTS XIANGQI
# V3 of my variant
[martialxiangqi]

# Board Parameters
maxFile = 9
maxRank = 9

# Pieces

commoner = k
bishop = b
horse = n
rook = r
elephant = e
cannon = c
customPiece1 = a:mBcpB

startFen = 2rbe4/2can4/2k1k4/9/9/9/4K1K2/4NAC2/4EBR2[] w - 0 1

# Palace
mobilityRegionBlackCommoner = c3 c4 c5 c6 c7 d3 d4 d5 d6 d7 e3 e4 e5 e6 e7 f3 f4 f5 f6 f7 g3 g4 g5 g6 g7
mobilityRegionWhiteCommoner = c3 c4 c5 c6 c7 d3 d4 d5 d6 d7 e3 e4 e5 e6 e7 f3 f4 f5 f6 f7 g3 g4 g5 g6 g7
mobilityRegionBlackElephant = a1 e1 i1 c3 g3 a5 e5 i5 c7 g7 a9 e9 i9
mobilityRegionWhiteElephant = a1 e1 i1 c3 g3 a5 e5 i5 c7 g7 a9 e9 i9

# Drop Rules
pieceDrops = true
capturesToHand = true
whiteDropRegion = *1 *2
blackDropRegion = *8 *9

# Royal piece rules
extinctionPieceTypes = k
extinctionPseudoRoyal = true
dupleCheck = true

# Misc Rules
nMoveRule = 0
perpetualCheckIllegal = true
chasingRule = axf
stalemateValue = loss

[sinting:chess]
customPiece1 = r:vWnD
customPiece2 = n:N
customPiece3 = b:nAfF
customPiece4 = k:fKlW
customPiece5 = q:fKrW
customPiece6 = i:N
startFen = rnbkqbir/pppppppp/8/8/8/8/PPPPPPPP/RIBQKBNR w - - 0 1
mobilityRegionWhiteCustomPiece6 = b1  d1  f1  h1  a2  b2  d2  f2  c3  e3  g3  h3  a4  b4  e4  f4  c5  d5  g5  h5  a6  b6  d6  f6  c7  e7  g7  h7  a8  c8  e8  g8
mobilityRegionBlackCustomPiece6 = b1  d1  f1  h1  a2  b2  d2  f2  c3  e3  g3  h3  a4  b4  e4  f4  c5  d5  g5  h5  a6  b6  d6  f6  c7  e7  g7  h7  a8  c8  e8  g8
mobilityRegionWhiteCustomPiece2 = a1  c1  e1  g1  c2  e2  g2  h2  a3  b3  d3  f3  c4  d4  g4  h4  a5  b5  e5  f5  c6  e6  g6  h6  a7  b7  d7  f7  b8  d8  f8  h8
mobilityRegionBlackCustomPiece2 = a1  c1  e1  g1  c2  e2  g2  h2  a3  b3  d3  f3  c4  d4  g4  h4  a5  b5  e5  f5  c6  e6  g6  h6  a7  b7  d7  f7  b8  d8  f8  h8
extinctionPieceTypes = qk
extinctionPseudoRoyal = true
extinctionValue = loss
promotionPieceTypes = qrbk

[borderlands]
maxFile = 9
maxRank = 10
# Non-promoting pieces.
customPiece1 = c:KmNmAmD
customPiece2 = g:KmNmAmD
# Unpromoted pieces.
customPiece3 = a:RmFcpR
customPiece4 = s:BmWcpB
customPiece5 = h:NmB3
customPiece6 = e:ADmR3
customPiece7 = m:FmN
customPiece8 = f:WmAmD
customPiece9 = w:fWfceFifmnD
customPiece10 = l:KNAD
# Promoted pieces.
customPiece11 = b:RFcpR
customPiece12 = d:BWcpB
customPiece13 = i:NFmWmB3
customPiece14 = j:ADWmFmR3
customPiece15 = k:KmN
customPiece16 = n:KmAmD
customPiece17 = o:NADmQ3
customPiece18 = p:KNAD
promotedPieceType = a:b s:d h:i e:j m:k f:n w:o l:p
pieceValueMg = c:882 g:616 a:1635 b:2501 s:1079 d:1383 h:613 i:1118 e:602 j:1023 m:183 k:428 f:256 n:712 w:284 o:1914 l:1174 p:2680
mandatoryPiecePromotion = true
startFen = a1hs1sh1a/1ce1l1ec1/fwgw1wgwf/w1w1w1w1w/9/9/W1W1W1W1W/FWGW1WGWF/1CE1L1EC1/A1HS1SH1A[MMmm] w - - 0 1
mobilityRegionWhiteCustomPiece1 = *1 *2 *3 *8 *9 *10 a* e* i*
mobilityRegionBlackCustomPiece1 = *1 *2 *3 *8 *9 *10 a* e* i*
mobilityRegionWhiteCustomPiece10 = *1 *2 *3 *4 *5 d7 f7 e9
mobilityRegionBlackCustomPiece10 = *6 *7 *8 *9 *10 d4 f4 e2
flagPiece = *
flagPieceCount = 4
flagRegion = b2 h2 b9 h9
flagMove = true
pieceDrops = true
capturesToHand = false
whiteDropRegion = *6 *7
blackDropRegion = *4 *5
promotionRegionWhite = *8 *9 *10
promotionRegionBlack = *1 *2 *3
doubleStepRegionWhite = *3
doubleStepRegionBlack = *8
nMoveRule = 100
perpetualCheckIllegal = true
moveRepetitionIllegal = true
extinctionValue = loss
extinctionPseudoRoyal = false
extinctionPieceTypes = c
extinctionPieceCount = 0

[od_variant:chess]
customPiece1 = s:cFmW
#black royal z (using pseudoroyal and extinction)
customPiece2 = z:FD 
customPiece3 = m:KN 
customPiece4 = f:bWAD
customPiece5 = e:cffNcbFfDfFW
customPiece6 = x:bWFD
customPiece7 = j:NJ
archbishop = a
chancellor = c
horse = h
maxRank = 9
maxFile = 9
startFen = mfjezejfm/sssssssss/9/9/9/9/9/PPPPPPPPP/RHBCKABHR[sssss] w - - 0 1
nMoveRuleTypesBlack = s
pawnTypes = ps
enPassantTypes = ps

mobilityRegionBlackCustomPiece2 = *9 *8 *7 *6 *5 *2 *1
mobilityRegionBlackCustomPiece3 = *9 *8 *7 *6 *5 *2 *1
mobilityRegionBlackCustomPiece4 = *9 *8 *7 *6 *5 *2 *1 
mobilityRegionBlackCustomPiece5 = *9 *8 *7 *6 *5 *2 *1
mobilityRegionBlackCustomPiece7 = *9 *8 *7 *6 *5 *2 *1

mobilityRegionWhiteKing = d1 e1 f1 d2 e2 f2

promotionPawnTypesBlack = s
promotionPieceTypesWhite = hbrac
promotionPieceTypesBlack = jefm
promotionRegionBlack = *5 *4 *3
promotionRegionWhite = *9
#black royal can promote
promotedPieceType = z:x
promotionLimit = s:9 
mandatoryPawnPromotion = false
mandatoryPiecePromotion = false
pieceDemotion = true

pieceDrops = true
blackDropRegion = *9 *8 *7 *6

flagPiece = z
flagRegionBlack = *1

extinctionPieceTypes = zx
extinctionValue = loss
extinctionPseudoRoyal = true
dupleCheck = true
stalemateValue = win

[shocking:chess]
connectRegion1Black = d*
connectRegion2Black = e*
connectValue = loss
startFen = dca2acd/moa2aom/ttt2ttt/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1
pawnTypes = pta
enPassantTypes = t
enPassantRegion = *3
promotionPieceTypesBlack = mdo
# missile
customPiece1 = m:RgR
# drone
customPiece2 = d:BgB
# turret
customPiece3 = t:fmWfmpR2fcFfcpB2
# core
customPiece4 = c:KgQ2
extinctionPieceTypes = c
extinctionPseudoRoyal = true
extinctionPieceCount = 1
extinctionOpponentPieceCount = -1
# automaton
customPiece5 = a:fcWfcpR2fmFfmpB2
# rover (better name needed)
customPiece6 = o:FnN

[chess_xiangqi:chess]

maxRank = 9
maxFile = 9
pieceToCharTable = PNBRQaes.w.hc.r............................K
startFen = rheawaehr/9/1c5c1/s1s1s1s1s/9/9/8*/PPPPPPPP*/RNB1KBNR*[Us] w KQ - - 0 1
nMoveRule = 25 #could leave it at 50, doesnt change the balance much, but its just boring
nMoveRuleTypesBlack = s

pawnTypes = ps
enPassantTypes = ps

; soldier = s
; soldierPromotionRank = 5
customPiece1 = s:fR2 # Soldiers have double move,
; customPiece1 = s:fsW
customPiece2 = t:fsW
promotionRegionBlack = *5 *4
promotionPieceTypesBlack = t
# doesnt work
# mandatoryPiecePromotion = true
# promotedPieceType = t:r

flagPiece = t # win the game on promotion
flagRegionBlack = *1

cannon = c
fers = a
horse = h
elephant = e
mobilityRegionBlackElephant = *9 *8 *7 *6 *5 *10

# RED KING
customPiece3 = w:W
mobilityRegionBlackCustomPiece3 = d9 e9 f9 d8 e8 f8 d7 e7 f7
extinctionPieceTypes = wk
extinctionPseudoRoyal = true
mobilityRegionBlackFers = d9 e9 f9 d8 e8 f8 d7 e7 f7


# FOR WHITE
# FOR 9 RANKS
mobilityRegionWhiteKing = *1 *2 *3 *4 *5 *6 a7 b7 c7 g7 h7 i7 a8 b8 c8 g8 h8 i8 a9 b9 c9 g9 h9 i9
promotionRegionWhite = *9
# FOR 10 RANKS
; mobilityRegionBlackFers = d9 e9 f9 d8 e8 f8 d10 e10 f10
; mobilityRegionBlackCustomPiece3 = d9 e9 f9 d8 e8 f8 d10 e10 f10
; mobilityRegionWhiteKing = *1 *2 *3 *4 *5 *6 *7 a8 b8 c8 g8 h8 i8 a9 b9 c9 g9 h9 i9 a10 b10 c10 g10 h10 i10
; promotionRegionWhite = *10

promotionPieceTypesWhite = rnbq

# the queen is a droppable piece
# :mQ means it can move but not capture as a queen
customPiece9 = U:mQ
pieceDrops = true
capturesToHand = false
whiteDropRegion = *1 *2 *3 *4
blackDropRegion = *6 *7 *8 *9

materialCounting = blackdrawodds

# doesnt work when the kings are different
flyingGeneral = true

[variant_000]
#Description: the game is inspired by chess, xiangqi, and shogi (with few elements borrowed from janggi and makruk). 
#The game is designed to have slow opening phrase but fast closing phrase with good region control being vital. 
#There are 3 main regions in the game for each player (from white perspective): row 1,2,3 are home; row 4,5 are neutral; row 6,7,8 are away. 
king = k:K
customPiece1 = q:FWAND
#defensive queen
customPiece2 = b:nAF
#bishop, but ancient
customPiece3 = n:nN
#horse in xiangqi
customPiece4 = r:nDW
#rook but less powerful
customPiece5 = p:fmWfcF
#makruk pawn, but promote differently
customPiece6 = e:BpR
#promoted bishop, with actual bishop move and janggi cannon
customPiece7 = h:NNnZ
#promoted knight, with knightrider move and janggi elephant (including lame block)
customPiece8 = c:RgB
#promoted rook, with actual rook move and a grasshoper bishop (land adjancent square after jump)
customPiece9 = s:WfF
#promoted pawn, a nobleman (silver)
maxRank = 8
maxFile = 8
startFen = rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR[] w - - 0 1
#game is setup exactly like in makruk with pawns arranged 1 row away from remaining pieces. 
mobilityRegionWhiteKing         = d1 d2 e1 e2
mobilityRegionBlackKing         = d8 d7 e8 e7
#king can only move 4 squares of palace inside home region. 
mobilityRegionWhiteCustomPiece1 = *1 *2 *3
mobilityRegionBlackCustomPiece1 = *8 *7 *6
#queen can only move inside home region.
promotionRegionWhite = *6 *7 *8
promotionRegionBlack = *3 *2 *1
#similar to makruk and shogi, promotion zone started in the sixth row. 
promotedPieceType = b:e n:h r:c p:s
mandatoryPiecePromotion = true
#unlike shogi but like chess or makruk, piece must promote when reaching away zone. as a result, technically no piece promote in last row.  
perpetualCheckIllegal = true
#follow xiangqi perpetual check rule
doubleStep = false
castling = false
#procedural set-up
pieceDrops = true
capturesToHand = true
enclosingDrop = ataxx
whiteDropRegion = *4 *5
blackDropRegion = *5 *4
dropNoDoubled = p
dropNoDoubledCount = 0
#captured pieces (not pawn) can be dropped by capturing players; captured promoted pieces are dropped as normal piece (like in shogi).
#however, pieces can only be dropped on neutral zone; also, piece can only be dropped to a square that are adjacent to friendly pieces (ataxx rule). 
nFoldValue = loss
#not allow repeating 3 times. 
#Tested on fairyground.vercel.app with 101 games of 60000ms+600ms (59300ms for white, tested before time control bug) gives results of 52-0-48 (with 1 timeout).`