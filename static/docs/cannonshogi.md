# ![Cannon Shogi](https://github.com/gbtami/pychess-variants/blob/master/static/icons/CannonShogi.svg) Cannon Shogi

![Cannon Shogi](https://github.com/gbtami/pychess-variants/assets/161836208/de4d370e-5932-4194-a5e8-c3a2db1cfc2b)

Cannon Shogi is a shogi variant. It was invented by Peter Michaelsen in February 1998.

## Rules

Setup is the same as Shogi. However, there are now 4 different Cannons from Xiangqi (Chinese Chess) and Janggi (Korean Chess) on the 2nd row, between the Bishop and the Rook and the nine Pawns on the 3rd row are changed to the five from Janggi.

All other rules are the same as Shogi.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/07e678d9-1c9c-4376-a7ce-0c004735156e)

The **Pawns** now move and capture one square forward or sideways. This is the same move as the Soldier in Janggi.

All drop restrictions that apply to Pawns in regular Shogi do not apply to the Pawns in this variant.

* Two or more Pawns can be on the same file.
* Pawn drop checkmate is legal
* Pawns can be dropped on the back rank. (The sideways movement prevents them from being “trapped”)

Pawns still promote to the Tokin (Gold General) as normal.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/05fb8df0-8998-4fe4-8c7a-37ad1a5be4c1)

The **Gold Cannons** can move any number of spaces orthogonally like a Rook, but to capture there must be an intervening piece for them to jump over. This is the same move as the Cannon in Xiangqi.

Gold Cannons promote to Flying Gold Cannons.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/173747cf-a539-4e80-b08a-7e3dd0412bf3)

The **Copper Cannons** can move any number of spaces diagonally like a Bishop, but to capture there must be an intervening piece for them to jump over. This is a diagonal version of the Cannon in Xiangqi.

Copper Cannons promote to Flying Copper Cannons.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/a48a5aa1-6089-4cc3-83ff-5ff361637527)

The **Silver Cannons** can move any number of spaces orthogonally like a Rook, but there must be an intervening piece for them to jump over first. This is the same move as the Cannon in Janggi.

NOTE: unlike in Janggi, Silver Cannons can jump over and capture eachother.

Silver Cannons promote to Flying Silver Cannons.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/f222609c-f5d1-441c-8c35-b3e449e85a0d)

The **Iron Cannons** can move any number of spaces diagonally like a Bishop, but there must be an intervening piece for them to jump over first. This is the same move as the Cannon in Janggi.

Iron Cannons promote to Flying Iron Cannons.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/7712471a-95c3-4337-a2bb-c04412ba77af)

**Flying Gold Cannons** and **Flying Silver Cannons** have the combined powers of both pieces. They can also move one space diagonally, but if there is a piece adjacent to them in that direction, they will jump over that piece rather than capture it and will instead capture the piece on the destination square if there is one.

![image](https://github.com/gbtami/pychess-variants/assets/161836208/90f8c146-1b27-4d89-b07e-ece63af76c62)

**Flying Copper Cannons** and **Flying Iron Cannons** have the combined powers of both pieces. They can also move one space orthogonally, but if there is a piece adjacent to them in that direction, they will jump over that piece rather than capture it and will instead capture the piece on the destination square if there is one.

