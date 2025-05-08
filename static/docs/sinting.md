# sinting

It's basically just regular chess but the pieces r weaker

Sahib-Darter{nAfF}
Slides to the 2nd square diagonally, or steps one square diagonally forward

Sober Hut{nDvW}
Steps one square, or slides to the 2nd square orthogonally

Royal Fuhlking{fhlK}
Steps one square straight ahead, or left, or diagonally forward. You're in check if ur last Royal Fuhlking is threatened

Royal Fuhrking{fhrK}
Steps one square straight ahead, or left, or diagonally forward. You're in check if ur last Royal Fuhrking is threatened

Ksatria Sinting{mpabmpafmpafsmpafsoabFoabavsmpafsmpafmpabFmpafsmpafmpafmpafmpafoabmpafmpafmpafmpasmpafmpafmpafoabmpafmpafmpafFmpafsmpafmpafmpafmpafmpafoabmpafmpafmpafmpafmpasmpafmpafmpafoabmpafmpafmpafFmpafmpafmpafoabmpafmpafmpafmpasmpafmpafmpafoabmpafmpafmpafmpavsmpafsW}
This Knight recommends that u read the works of George Peter Jelliss

Definition For Fairy Stockfish variants.ini:
[Sinting:chess]
customPiece1 = r:vWnD
customPiece2 = n:N
customPiece3 = b:nAfF
customPiece4 = k:fKlW
customPiece5 = q:fKrW
customPiece6 = i:N
startFen = rnbkqbir/pppppppp/8/8/8/8/PPPPPPPP/RIBQKBNR
mobilityRegionWhiteCustomPiece6 = b1  d1  f1  h1  a2  b2  d2  f2  c3  e3  g3  h3  a4  b4  e4  f4  c5  d5  g5  h5  a6  b6  d6  f6  c7  e7  g7  h7  a8  c8  e8  g8
mobilityRegionBlackCustomPiece6 = b1  d1  f1  h1  a2  b2  d2  f2  c3  e3  g3  h3  a4  b4  e4  f4  c5  d5  g5  h5  a6  b6  d6  f6  c7  e7  g7  h7  a8  c8  e8  g8
mobilityRegionWhiteCustomPiece2 = a1  c1  e1  g1  c2  e2  g2  h2  a3  b3  d3  f3  c4  d4  g4  h4  a5  b5  e5  f5  c6  e6  g6  h6  a7  b7  d7  f7  b8  d8  f8  h8
mobilityRegionBlackCustomPiece2 = a1  c1  e1  g1  c2  e2  g2  h2  a3  b3  d3  f3  c4  d4  g4  h4  a5  b5  e5  f5  c6  e6  g6  h6  a7  b7  d7  f7  b8  d8  f8  h8
extinctionPieceTypes = qk
extinctionPseudoRoyal = true
extinctionValue = loss
promotionPieceTypes = qrbink

Designed by [HaruN Y](https://www.chessvariants.com/who/AaronJoseph)
