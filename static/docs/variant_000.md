# variant_000

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
#Tested on fairyground.vercel.app with 101 games of 60000ms+600ms (59300ms for white, tested before time control bug) gives results of 52-0-48 (with 1 timeout).
