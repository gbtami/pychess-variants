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

# R Kappa and L Kappa = lance + bishop movement in the direction the kappa faces
customPiece4 = r:fRlB
customPiece5 = l:fRrB

# Tengu (sideways forward knight (fhN), 2 square jump forward (fD)
customPiece6 = g:fDfsN

# Azure Oni (R) and Crimson Oni (L) = Azure cannot go left or down-left. Crimson cannot go right or down-right.
customPiece8 = a:fFbrFvrW
customPiece9 = c:fFblFvlW

# Yurei = R2 that can't move backwards
customPiece10 = y:sWfR2

# Promoted Pawn ("Kasa-obake") = copper general
gold = z

# Promoted Tengu ("Dai Tengu") = knight
knight = d

# Promoted Yurei = "Vengeful Spirit" (R2 that can move like a lion)
customPiece11 = v:R2mFmAmDmN

# Promoted Kitsune ("Nine tails") = gains king movement/cap
customPiece12 = e:KmRcB

# Promoted Tanuki ("Bake-danuki") = gains king movement/cap
customPiece13 = b:KmBcR

capturesToHand = true
pieceDrops = true
immobilityIllegal = true
perpetualCheckIllegal = true
shogiPawnDropMateIllegal = true
dropNoDoubled = p
promotionRegionWhite = *7 *8 *9
promotionRegionBlack = *1 *2 *3
promotedPieceType = p:z s:e g:d y:v t:b
stalemateValue = loss
startFen = rygckagyl/1s5t1/ppppppppp/9/9/9/PPPPPPPPP/1S5T1/LYGAKCGYR[Nn] w 0 1
```
