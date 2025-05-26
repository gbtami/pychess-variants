<style>
td { vertical-align: top; }
.tab_inline { display: inline; width: 50%; border: 1px solid; }
.region_name { vertical-align: bottom; font-weight: bold; }
.region_area { vertical-align: top; }
.zone_highlight { vertical-align: middle; min-width: 60px; }
.piece_title { vertical-align: middle; width:50%; }
.piece_title_nowrap { white-space: nowrap; }
.piece_movement { vertical-align: middle; }
.piece_values { vertical-align: middle; border: 1px solid; }
#region_table tr.line_t { border-style: solid; border-width: 1px 0px 0px 0px; }
#region_table tr.line_b { border-style: solid; border-width: 0px 0px 1px 0px; }
#region_table tr.line_tb { border-style: solid; border-width: 1px 0px 1px 0px; }
#region_table td { text-align: left; }

.board_row { display: flex; }
.board_column { flex: 50%; padding: 5px; }
</style>

# 🌄 Borderlands

![Borderlands](../static/images/BorderlandsGuide/BorderlandsPoster.png)

Borderlands is a chess variant created by dpldgr in 2025 for PyChess' Variant Design Contest.

Borderlands draws inspiration from many classic variants (Chess, Shogi, Xiangqi, and Courier Chess) and fuses them together in a unique and creative way. Pieces are in general more powerful than those found in the classic variants.

- The Chief (the "royal" piece) is very mobile, but has restricted movement which allows it to be cornered and captured.
- Sliding pieces (Rooks, Bishops) and jump capturing pieces (Pao, Vao) are merged to create more powerful pieces (Archer, Slinger).
- Most pieces are promotable, giving incentive to keep them on the board as every piece can help win the game by cornering and capturing enemy Chiefs or occupying Village Squares.
- Players can't just push their pieces forward or they leave themselves exposed to a quick loss by conquest.
- There is a wide variety of pieces with different strengths and weaknesses.

## Historical Setting
Borderlands is not set in a specific place or culture. Rather, it serves as an abstract representation of warfare as it evolved during the early Classical Antiquity period (approximately 500–100 BCE), following the decline of chariot warfare. It reflects the tactical emphasis on infantry formations, skirmishers, and emerging combined-arms warfare typical of that era.

## General Rules
1.	White has the first move.
2.	All pieces are capturable and are permanently removed from play upon capture.
3.	There is no checkmate or stalemate in Borderlands.
4.	There is no castling in Borderlands. On any move, a Chief can instead make a non-capturing leap two squares in any direction within their movement zone.
5.	Pieces promote immediately upon reaching their Promotion Zone/Square.
6.	Warriors starting on the 3rd rank may make a double step on their first move, and may be captured en passant on the enemy's next move.

## Win Conditions
1.	Win by Surrender: Capture both enemy Chiefs and the enemy immediately surrenders.
2.	Win by Conquest: Occupy all four Village Squares for two consecutive moves (one move by each player).

## Draw Conditions
1.	No Progress: 150 moves (75 by each player) without a capture or promotion.
2.	Impasse: the game is unable to progress due to neither side having a realistic chance of occupying all four Village Squares or capturing both enemy Chiefs.

## Lose Conditions
1.	No Legal Moves: if a player cannot make a legal move they lose the game.
2.	Perpetual Check: (TODO: confirm this works for Chiefs).
3.	Move Repetition: repeating a position for the 5th time.

## The Board
The empty board and initial position for Borderlands are as follows:

<div class="board_row">
  <div class="board_column"><img src="../static/images/BorderlandsGuide/BoardEmpty.png" alt="Borderlands Empty Board" style="width:100%"></div>
  <div class="board_column"><img src="../static/images/BorderlandsGuide/BoardInitial.png" alt="Borderlands Initial Position" style="width:100%"></div>
</div>

### Regions and Squares
There are a number of important regions and squares in Borderlands:

<table id="region_table" style="border-style: solid; border-width: 1px 0px; border-collapse: collapse;">
<tbody>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteTerritory.png" alt="White Territory"></td><td class="region_name">White Territory</td></tr>
	<tr><td class="region_area">Ranks 1-5</td></tr>
	<tr><td>All White pieces start the game within this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteVillageZone.png" alt="White Village Zone"></td><td class="region_name">White Village Zone</td></tr>
	<tr><td>Ranks 1-3</td></tr>
	<tr><td>The majority of White pieces start the game in this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteIncursionZone.png" alt="White Incursion Zone"></td><td class="region_name">White Incursion Zone</td></tr>
	<tr><td>Ranks 6-7</td></tr>
	<tr><td>White Marauders must come into play in this region. Black Warriors initially guard every single square of it.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhitePromotionZone.png" alt="White Promotion Zone"></td><td class="region_name">White Promotion Zone</td></tr>
	<tr><td>Ranks 8-10</td></tr>
	<tr><td>All promotable White pieces (except the Lion) can promote anywhere within this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteVillages.png" alt="White Villages"></td><td class="region_name">White Villages</td></tr>
	<tr><td>South-West Village: a1,b1,c1,a2,b2,c2,a3,b3,c3<br/>South-East Village: g1,h1,i1,g2,h2,i2,g3,h3,i3</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteVillageSquares.png" alt="White Village Squares"></td><td class="region_name">White Village Squares</td></tr>
	<tr><td>South-West Village Square: b2<br/>South-East Village Square: h2</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteLionsYard.png" alt="White Lion's Yard"></td><td class="region_name">White Lion's Yard</td></tr>
	<tr><td>Squares: d1,e1,f1,d2,e2,f2,d3,e3,f3</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteLionsDen.png" alt="White Lion's Den"></td><td class="region_name">White Lion's Den</td></tr>
	<tr><td>Square: e2</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteLionsIncursionSquares.png" alt="White Lion's Incursion Squares"></td><td class="region_name">White Lion's Incursion Squares</td></tr>
	<tr><td>Squares: d7,f7</td></tr>
	<tr><td>The White Lion must pass through one of these squares to promote.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteLionsPromotionSquare.png" alt="White Lion's Promotion Square"></td><td class="region_name">White Lion's Promotion Square</td></tr>
	<tr><td>Square: e9</td></tr>
	<tr><td>The White Lion promotes upon reaching this square, and is then able to freely roam the entire board.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteLionsMovementZone.png" alt="White Lion's Movement Zone"></td><td class="region_name">White Lion's Movement Zone</td></tr>
	<tr><td>Zones: White Territory, White Lion's Incursion Zones, White Lion's Promotion Square</td></tr>
	<tr><td></td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackTerritory.png" alt="Black Territory"></td><td class="region_name">Black Territory</td></tr>
	<tr><td>Ranks 6-10</td></tr>
	<tr><td>All Black pieces start the game within this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackVillageZone.png" alt="Black Village Zone"></td><td class="region_name">Black Village Zone</td></tr>
	<tr><td>Ranks 8-10</td></tr>
	<tr><td>The majority of Black pieces start the game in this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackIncursionZone.png" alt="Black Incursion Zone"></td><td class="region_name">Black Incursion Zone</td></tr>
	<tr><td>Ranks 4-5</td></tr>
	<tr><td>Black Marauders must come into play in this region. White Warriors initially guard every single square of it.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackPromotionZone.png" alt="Black Promotion Zone"></td><td class="region_name">Black Promotion Zone</td></tr>
	<tr><td>Ranks 1-3</td></tr>
	<tr><td>All promotable Black pieces (except the Lion) can promote anywhere within this region.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/BlackVillages.png" alt="Black Villages"></td><td class="region_name">Black Villages</td></tr>
	<tr><td>Noth-West Village: a8,b8,c8,a9,b9,c9,a10,b10,c10<br/>Noth-East Village: g8,h8,i8,g9,h9,i9,g10,h10,i10</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/BlackVillageSquares.png" alt="Black Village Squares"></td><td class="region_name">Black Village Squares</td></tr>
	<tr><td>Noth-West Village Square: b9<br/>Noth-East Village Square: h9</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/BlackLionsYard.png" alt="Black Lion's Yard"></td><td class="region_name">Black Lion's Yard</td></tr>
	<tr><td>Squares: d8,e8,f8,d9,e9,f9,d10,e10,f10</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="2"><img src="../static/images/BorderlandsGuide/BlackLionsDen.png" alt="Black Lion's Den"></td><td class="region_name">Black Lion's Den</td></tr>
	<tr><td>Square: e9</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackLionsIncursionSquares.png" alt="Black Lion's Incursion Squares"></td><td class="region_name">Black Lion's Incursion Squares</td></tr>
	<tr"><td>Squares: d4,f4</td></tr>
	<tr><td>The Black Lion must pass through one of these squares to promote.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackLionsPromotionSquare.png" alt="Black Lion's Promotion Square"></td><td class="region_name">Black Lion's Promotion Square</td></tr>
	<tr><td>Square: e2</td></tr>
	<tr><td>The Black Lion promotes upon reaching this square, and is then able to freely roam the entire board.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/BlackLionsMovementZone.png" alt="Black Lion's Movement Zone"></td><td class="region_name">Black Lion's Movement Zone</td></tr>
	<tr><td>Zones: Black Territory, Black Lion's Incursion Zones, Black Lion's Promotion Square</td></tr>
	<tr><td></td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/Roads.png" alt="Roads"></td><td class="region_name">Roads</td></tr>
	<tr><td>East Road Squares: a4,a5,a6,a7<br/>Middle Road Squares: e4,e5,e6,e7<br/>West Road Squares: i4,i5,i6,i7<br/></td></tr>
	<tr><td>Roads connect the two Village Zones.</td></tr>
	<tr class="line_t"><td class="zone_highlight" rowspan="3"><img src="../static/images/BorderlandsGuide/ChiefMovementZone.png" alt="Chief Movement Zone"></td><td class="region_name">Chief Movement Zone</td></tr>
	<tr><td>Zones: White Village Zone, Black Village Zone, Roads</td></tr>
	<tr class="line_b"><td>Chiefs are restricted to the two Village Zones and Roads.</td></tr>
</tbody>
</table>

## The Pieces
### Names, Movement, Notations, Icons, & Promotions
The movement diagrams below follow these conventions:
<table style="border-collapse: collapse;">
<tbody>
	<tr><td width="15%"><img src="../static/images/BorderlandsGuide/RedCircle.png" alt="Red Circle"></td><td class="piece_movement" style="text-align: left;">Red Circle: can make both capturing and non-capturing moves to this square unimpeded.</td></tr>
	<tr><td width="15%"><img src="../static/images/BorderlandsGuide/GreenCircle.png" alt="Green Circle"></td><td class="piece_movement" style="text-align: left;">Green Circle: can make a non-capturing move to this square unimpeded.</td></tr>
	<tr><td width="15%"><img src="../static/images/BorderlandsGuide/BlueCircle.png" alt="Blue Circle"></td><td class="piece_movement" style="text-align: left;">Blue Circle: can make a capturing move to this square unimpeded.</td></tr>
	<tr><td width="15%"><img src="../static/images/BorderlandsGuide/GreenLine.png" alt="Green Line"></td><td class="piece_movement" style="text-align: left;">Green Line: can make a non-capturing slide up to three squares.</td></tr>
	<tr><td width="15%"><img src="../static/images/BorderlandsGuide/TealLine.png" alt="Teal Line"></td><td class="piece_movement" style="text-align: left;">Teal Line: can make both a capturing and non-capturing sliding move, or jump a piece and capture in a manner similar to a Cannon.</td></tr>
</tbody>
</table>

<table style="border-collapse: collapse;">
<tbody>
	<tr><td width="25%"></td><td class="piece_title" width="50%" style="background-color:#d4c7e3;color:#000000">Chief (C)</td><td width="25%"></td></tr>
	<tr><td width="25%"></td><td><img src="../static/images/BorderlandsGuide/Chief.png" alt="Chief"><br/>Betza: KmNmAmD</td><td width="25%"></td></tr>
	<tr><td colspan="3">Chiefs are the most valuable pieces on the board. Capture both of the enemy Chiefs and your enemy immediately surrenders.<p/>Chiefs are restricted to the Village Zones and the Roads connecting them.<p/></td><td></td><td></td></tr>
	<tr><td width="25%"></td><td class="piece_title" style="background-color:#e6e6e6;color:#000000">Guard (G)</td><td width="25%"></td></tr>
	<tr><td width="25%"></td><td><img src="../static/images/BorderlandsGuide/Guard.png" alt="Guard"><br/>Betza: KmNmAmD</td><td width="25%"></td></tr>
	<tr><td colspan="3">Guards are the only pieces that don't promote and are free to roam the entire board from the start of the game. Their role is to protect the allied Chiefs through any means necessary.<p/></td><td></td><td></td></tr>
</tbody>
</table>
<table style="border-collapse: collapse;">
<tbody>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Marauder (M)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Marauder (+M)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Marauder.png" alt="Marauder"><br/>Betza: FmN</td><td><img src="../static/images/BorderlandsGuide/MarauderPromoted.png" alt="Marauder Promoted"><br/>Betza: KmN</td></tr>
	<tr><td colspan="2">The Marauder's role is to disrupt the enemy through any means necessary. They can very quickly slip behind enemy lines if there are small holes in the enemy's defenses.
<p/>
Marauders start the game in hand, and must come into play by being dropped into their Incursion Zone, and can often promote on their next move.<p/>
They can move like a Ferz (F), and make a non-capturing jump like a Knight (mN). Upon promotion, Marauders gain the ability to make one step orthogonally (W).</td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Falcon (F)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Falcon (+F)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Falcon.png" alt="Falcon"><br/>Betza: WmAmD</td><td><img src="../static/images/BorderlandsGuide/FalconPromoted.png" alt="Falcon Promoted"><br/>Betza: KmAmD</td></tr>
	<tr><td colspan="2">They can move like a Wazir (W), and make a non-capturing jump like a Alfil or Dabbaba (mAmD). Upon promotion, Falcons gain the ability to make one step diagonally (F).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Elephant (E)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Elephant (+E)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Elephant.png" alt="Elephant"><br/>Betza: ADmR3</td><td><img src="../static/images/BorderlandsGuide/ElephantPromoted.png" alt="Elephant Promoted"><br/>Betza: ADmR3WmF</td></tr>
	<tr><td colspan="2">Elephants are jumping pieces. They can move like a Alfil or Dabbaba (AD), and make a non-capturing slide like a Rook up to three squares (mR3). Upon promotion, Elephants gain the ability to make one step orthogonally (W), and one non-capturing step diagonally (mF).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Horse (H)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Horse (+H)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Horse.png" alt="Horse"><br/>Betza: NmB3</td><td><img src="../static/images/BorderlandsGuide/HorsePromoted.png" alt="Horse Promoted"><br/>Betza: NmB3FmW</td></tr>
	<tr><td colspan="2">Horses are jumping pieces. They can move like a Knight (N), and make a non-capturing slide like a Bishop up to three squares (mB3). Upon promotion, Horses gain the ability to make one step diagonally (F), and one non-capturing step orthogonally (mW).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Slinger (S)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Slinger (+S)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Slinger.png" alt="Slinger"><br/>Betza: BcpBmW</td><td><img src="../static/images/BorderlandsGuide/SlingerPromoted.png" alt="Slinger Promoted"><br/>Betza: BcpBW</td></tr>
	<tr><td colspan="2">Slingers are long range pieces able to attack from afar along diagonal lines. They can move like a Bishop (B), capture like a Vao (cpB), and also make one non-capturing step orthogonally (mW). Upon promotion, Slingers gain the ability to make one capturing step orthogonally (W).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Archer (A)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Archer (+A)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Archer.png" alt="Archer"><br/>Betza: RcpRmF</td><td><img src="../static/images/BorderlandsGuide/ArcherPromoted.png" alt="Archer Promoted"><br/>Betza: RcpRF</td></tr>
	<tr><td colspan="2">Archers are long range pieces able to attack from afar along orthogonal lines. They can move like a Rook (R), capture like a Pao (cpR), and also make one non-capturing step diagonally (mF). Upon promotion, Archers gain the ability to make one capturing step diagonally (F).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Warrior (W)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Warrior (+W)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Warrior.png" alt="Warrior"><br/>Betza: fWfceFifmnD</td><td><img src="../static/images/BorderlandsGuide/WarriorPromoted.png" alt="Warrior Promoted"><br/>Betza: NADmQ3</td></tr>
	<tr><td colspan="2">Warriors can move like both a Chess Pawn (fmWfceFifmnD) and a Shogi Pawn (fW). Warriors starting on the 3rd rank may make a double step on their first move, and may be captured en passant by an enemy Warrior on the enemy's next move. Upon promotion, the Warrior's movement changes.<p/>A Promoted Warrior can move like a Knight, Alfil, or Dabbaba, and can make a non-capturing slide like a Queen up to three squares (mQ3).<p/></td><td></td></tr>
	<tr><td class="piece_title" style="background-color:#e6e6e6;color:#000000"><span class="piece_title_nowrap">Lion (L)</span></td><td class="piece_title" style="background-color:#f7e6ae;color:#000000">Promoted <span class="piece_title_nowrap">Lion (+L)</span></td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/Lion.png" alt="Lion"><br/>Betza: KNAD</td><td><img src="../static/images/BorderlandsGuide/LionPromoted.png" alt="Lion Promoted"><br/>Betza: KNAD</td></tr>
	<tr><td colspan="2">Lions start the game as a defensive piece restricted to their side's Territory, and have a very limited path to promotion (via the Lion's Incursion Squares) that is easily defended against. Upon promotion, Lions gain the ability to roam the entire board.<p/></td><td></td></tr>
</tbody>
</table>
### Piece Values
<table  style="border-collapse: collapse; border: 1px solid;">
<tbody>
	<tr><td class="piece_values"><b>Piece</b></td><td class="piece_values"><b>Notation</b></td><td class="piece_values"><b>Value</b></td><td class="piece_values"><b>Piece</b></td><td class="piece_values"><b>Notation</b></td><td class="piece_values"><b>Value</b></td></tr>
	<tr><td class="piece_values">Promoted Lion</td><td class="piece_values">+L</td><td class="piece_values">9.45</td><td class="piece_values">Chief</td><td class="piece_values">C</td><td class="piece_values">3.11</td></tr>
	<tr><td class="piece_values">Promoted Archer</td><td class="piece_values">+A</td><td class="piece_values">8.82</td><td class="piece_values">Promoted Falcon</td><td class="piece_values">+F</td><td class="piece_values">2.51</td></tr>
	<tr><td class="piece_values">Promoted Warrior</td><td class="piece_values">+W</td><td class="piece_values">6.75</td><td class="piece_values">Guard</td><td class="piece_values">G</td><td class="piece_values">2.17</td></tr>
	<tr><td class="piece_values">Archer</td><td class="piece_values">A</td><td class="piece_values">5.77</td><td class="piece_values">Horse</td><td class="piece_values">H</td><td class="piece_values">2.16</td></tr>
	<tr><td class="piece_values">Promoted Slinger</td><td class="piece_values">+S</td><td class="piece_values">4.88</td><td class="piece_values">Elephant</td><td class="piece_values">E</td><td class="piece_values">2.12</td></tr>
	<tr><td class="piece_values">Lion</td><td class="piece_values">L</td><td class="piece_values">4.14</td><td class="piece_values">Promoted Marauder</td><td class="piece_values">+M</td><td class="piece_values">1.51</td></tr>
	<tr><td class="piece_values">Promoted Horse</td><td class="piece_values">+H</td><td class="piece_values">3.94</td><td class="piece_values">Warrior</td><td class="piece_values">W</td><td class="piece_values">1.00</td></tr>
	<tr><td class="piece_values">Slinger</td><td class="piece_values">S</td><td class="piece_values">3.81</td><td class="piece_values">Falcon</td><td class="piece_values">F</td><td class="piece_values">0.90</td></tr>
	<tr><td class="piece_values">Promoted Elephant</td><td class="piece_values">+E</td><td class="piece_values">3.61</td><td class="piece_values">Marauder</td><td class="piece_values">M</td><td class="piece_values">0.65</td></tr>
</tbody>
</table>
<img src="../static/images/BorderlandsGuide/PieceValues.png" alt="Piece Values">

## Strategy
TODO.

How to Play Borderlands video:
TODO

Gameplay Example 1:
<iframe width="560" height="315" src="https://www.youtube.com/embed/NsAGUMWxyCo" frameborder="0" allowfullscreen></iframe>
Gameplay Example 2:
<iframe width="560" height="315" src="https://www.youtube.com/embed/y88_OAx8bRk" frameborder="0" allowfullscreen></iframe>
