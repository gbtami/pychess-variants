```
[yokai]
maxRank=9
maxFile=9
king = k
shogiPawn = p

# Kitsune (move Rook cap Bishop)
customPiece1 = s:mRcB

# Tanuki (move Bishop cap Rook)
customPiece2 = t:mBcR

# Nurikabe (sideways slider)
customPiece3 = n:sR

# R Kappa and L Kappa
customPiece4 = r:fRlB
customPiece5 = l:fRrB

# Tengu (sideways forward knight (fhN), 2 square jump forward (fD)
customPiece6 = g:fDfsN

# Azure Oni (R) and Crimson Oni (L) - Azure cannot go left or down-left. Crimson cannot go right or down-right.
customPiece8 = a:fFbrFvrW
customPiece9 = c:fFblFvlW

# Yurei = upside-down T to 2 spaces
customPiece10 = y:sWfR2

# Promoted Pawn ("Kasa-obake") = copper general
gold = z

# Promoted Tengu ("Dai Tengu") = knight
knight = d

# Promoted Yurei = "Vengeful Spirit" (R2 that can move like a lion)
customPiece11 = v:R2mFmAmDmN

# Promoted Kitsune ("Nine tails")- gains king movement
customPiece12 = e:mRcBW

# Promoted Tanuki ("Bake-danuki") - gains king movement
customPiece13 = b:mBcRF

capturesToHand = true
pieceDrops = true
immobilityIllegal = true
dropNoDoubled = p
promotionRegionWhite = *7 *8 *9
promotionRegionBlack = *1 *2 *3
promotedPieceType = p:z s:e g:d y:v t:b
nFoldRule = 4
stalemateValue = loss
startFen = rygckagyl/1s5t1/ppppppppp/9/9/9/PPPPPPPPP/1S5T1/LYGAKCGYR[Nn] w 0 1
```
