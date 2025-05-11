# 🌄 Borderlands

![Borderlands](../static/images/BorderlandsGuide/BorderlandsPoster.png)

Borderlands is a chess variant created by dpldgr in 2025 for PyChess' Variant Design Contest.

## General Rules
1.	White has the first move.
2.	All pieces are capturable and are permanently removed from play upon capture.
3.	As Chiefs are capturable, checkmate and stalemate don't exist in Borderlands.
4.	Pieces promote immediately upon reaching their Promotion Zone/Square.
5.	Warriors starting on the 3rd rank may make a double step on their first move, and may be captured en passant on the enemy's next move.

## Win Conditions
1.	Win by Surrender: Capture both enemy Chiefs and the enemy immediately surrenders.
2.	Win by Conquest: Occupy all four Village Squares for two consecutive moves (one move by each player).

## Draw Conditions
1.	No Progress: 150 moves (75 by each player) without a capture or promotion.
2.	Impasse: the game is unable to progress due to neither side having a realistic chance of occupying all four Village Squares or capturing both enemy Chiefs.

## Lose Conditions
1.	No Legal Moves: if a player cannot make a legal move they lose the game.
2.	Perpetual Check: (TODO: confirm this works for Chiefs).
3.	Move Repetiion: repeating a position for the 5th time.

## The Board
The empty board and initial position for Borderlands are as follows:

![Borderlands Board](../static/images/BorderlandsGuide/board.png)

### Regions and Squares
There are a number of important regions and squares in Borderlands:
<style>
td { vertical-align: top; }
.tab_inline { display: inline; width: 50%; border: 1px solid; }
.region_name { vertical-align: bottom; font-weight: bold; }
.region_area { vertical-align: top; }
.piece_movement { vertical-align: middle; }
</style>

<table style="border: 1px solid;border-collapse: collapse;">
<thead>
	<tr style="border-bottom: 1px solid;">
		<th width="75%"><b>Region</b></th>
		<th width="25%"><b>Board</b></th>
	</tr>
</thead>
<tbody>
	<tr><td class="region_name">White Territory</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteTerritory.png" alt="White Territory"></td></tr>
	<tr><td class="region_area">Ranks 1-5</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>All White pieces start the game within this region.</td><td></td></tr>
	<tr><td class="region_name">White Village Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteVillageZone.png" alt="White Village Zone"></td></tr>
	<tr><td>Ranks 1-3</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The majority of White pieces start the game in this region.</td><td></td></tr>
	<tr><td class="region_name">White Incursion Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteIncursionZone.png" alt="White Incursion Zone"></td></tr>
	<tr><td>Ranks 6-7</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>White Marauders must come into play in this region. Black Warriors initially guard every single square of it.</td><td></td></tr>
	<tr><td class="region_name">White Promotion Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhitePromotionZone.png" alt="White Promotion Zone"></td></tr>
	<tr><td>Ranks 8-10</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>All promotable White pieces (except the Lion) can promote anywhere within this region.</td><td></td></tr>
	<tr><td class="region_name">White Villages</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteVillages.png" alt="White Villages"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>South-West Village: a1,b1,c1,a2,b2,c2,a3,b3,c3<br/>South-East Village: g1,h1,i1,g2,h2,i2,g3,h3,i3</td><td></td></tr>
	<tr><td class="region_name">White Village Squares</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteVillageSquares.png" alt="White Village Squares"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>South-West Village Square: b2<br/>South-East Village Square: h2</td><td></td></tr>
	<tr><td class="region_name">White Lion's Yard</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteLionsYard.png" alt="White Lion's Yard"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Squares: d1,e1,f1,d2,e2,f2,d3,e3,f3</td><td></td></tr>
	<tr><td class="region_name">White Lion's Den</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/WhiteLionsDen.png" alt="White Lion's Den"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Square: e2</td><td></td></tr>
	<tr><td class="region_name">White Lion's Incursion Squares</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteLionsIncursionSquares.png" alt="White Lion's Incursion Squares"></td></tr>
	<tr><td>Squares: d7,f7</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The White Lion must pass through one of these squares to promote.</td><td></td></tr>
	<tr><td class="region_name">White Lion's Promotion Square</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/WhiteLionsPromotionSquare.png" alt="White Lion's Promotion Square"></td></tr>
	<tr><td>Square: e9</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The White Lion promotes upon reaching this square, and is then able to freely roam the entire board.</td><td></td></tr>
	<tr><td class="region_name">Black Territory</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackTerritory.png" alt="Black Territory"></td></tr>
	<tr><td>Ranks 6-10</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>All Black pieces start the game within this region.</td><td></td></tr>
	<tr><td class="region_name">Black Village Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackVillageZone.png" alt="Black Village Zone"></td></tr>
	<tr><td>Ranks 8-10</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The majority of Black pieces start the game in this region.</td><td></td></tr>
	<tr><td class="region_name">Black Incursion Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackIncursionZone.png" alt="Black Incursion Zone"></td></tr>
	<tr><td>Ranks 4-5</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Black Marauders must come into play in this region. White Warriors initially guard every single square of it.</td><td></td></tr>
	<tr><td class="region_name">Black Promotion Zone</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackPromotionZone.png" alt="Black Promotion Zone"></td></tr>
	<tr><td>Ranks 1-3</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>All promotable Black pieces (except the Lion) can promote anywhere within this region.</td><td></td></tr>
	<tr><td class="region_name">Black Villages</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/BlackVillages.png" alt="Black Villages"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Noth-West Village: a8,b8,c8,a9,b9,c9,a10,b10,c10<br/>Noth-East Village: g8,h8,i8,g9,h9,i9,g10,h10,i10</td><td></td></tr>
	<tr><td class="region_name">Black Village Squares</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/BlackVillageSquares.png" alt="Black Village Squares"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Noth-West Village Square: b9<br/>Noth-East Village Square: h9</td><td></td></tr>
	<tr><td class="region_name">Black Lion's Yard</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/BlackLionsYard.png" alt="Black Lion's Yard"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Squares: d8,e8,f8,d9,e9,f9,d10,e10,f10</td><td></td></tr>
	<tr><td class="region_name">Black Lion's Den</td><td rowspan="2"><img src="../static/images/BorderlandsGuide/BlackLionsDen.png" alt="Black Lion's Den"></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Square: e9</td><td></td></tr>
	<tr><td class="region_name">Black Lion's Incursion Squares</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackLionsIncursionSquares.png" alt="Black Lion's Incursion Squares"></td></tr>
	<tr"><td>Squares: d4,f4</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The Black Lion must pass through one of these squares to promote.</td><td></td></tr>
	<tr><td class="region_name">Black Lion's Promotion Square</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/BlackLionsPromotionSquare.png" alt="Black Lion's Promotion Square"></td></tr>
	<tr><td>Square: e2</td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>The Black Lion promotes upon reaching this square, and is then able to freely roam the entire board.</td><td></td></tr>
	<tr><td class="region_name">Roads</td><td rowspan="3"><img src="../static/images/BorderlandsGuide/Roads.png" alt="Roads"></td></tr>
	<tr><td>East Road Squares: a4,a5,a6,a7<br/>Middle Road Squares: e4,e5,e6,e7<br/>West Road Squares: i4,i5,i6,i7<br/></td><td></td></tr>
	<tr style="border-bottom: 1px solid;"><td>Roads connect the two Village Zones.</td><td></td></tr>
</tbody>
</table>

## The Pieces
### Names, Movement, Notations, Icons, & Promotions
The movement diagrams below follow these conventions:
<table style="border-collapse: collapse;">
<tbody>
	<tr><td><img src="../static/images/BorderlandsGuide/RedCircle.png" alt="Red Circle"></td><td class="piece_movement" style="text-align: left;">Can make both capturing and non-capturing moves to this square unimpeded.</td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/GreenCircle.png" alt="Green Circle"></td><td class="piece_movement" style="text-align: left;">Can make a non-capturing move to this square unimpeded.</td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/BlueCircle.png" alt="Blue Circle"></td><td class="piece_movement" style="text-align: left;">Can make a capturing move to this square unimpeded.</td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/GreenLine.png" alt="Green Line"></td><td class="piece_movement" style="text-align: left;">Can make a non-capturing slide up to three squares.</td></tr>
	<tr><td><img src="../static/images/BorderlandsGuide/TealLine.png" alt="Teal Line"></td><td class="piece_movement" style="text-align: left;">Can make both a capturing and non-capturing sliding move, or jump a piece and capture in a manner similar to a Cannon.</td></tr>
</tbody>
</table>

<table style="border: 1px solid;border-collapse: collapse;">
<thead>
	<tr style="border-bottom: 1px solid;"><th><b>Unpromoted Version</b></th><th><b>Promoted Version</b></th></tr>
</thead>
<tbody>
	<tr><td width="50%" style="background-color:#d4c7e3;color:#000000">Chief (C)</td><td width="50%" rowspan="2">The Chief does not promote.</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Chief.png" alt="Chief"><br/>Betza: KmNmAmD<p/>
Chiefs are the most valuable pieces on the board. Capture both of the enemy Chiefs and your enemy immediately surrenders.
<p/>
Chiefs are restricted to the Village Zones and the Roads connecting them:<p/>
<img src="../static/images/BorderlandsGuide/ChiefZone.png" alt="Chief Movement Zone">
</td><td></td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Guard (G)</td><td rowspan="2">The Guard does not promote.</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Guard.png" alt="Guard"><br/>Betza: KmNmAmD<p/>Guards are the only pieces that don't promote and are free to roam the entire board from the start of the game. Their role is to protect the allied Chiefs through any means necessary.</td><td></td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Marauder (M)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Marauder (+M)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Marauder.png" alt="Marauder"><br/>Betza: FmN<p/>
The Marauder's role is to disrupt the enemy through any means necessary. They can very quickly slip behind enemy lines if there are small holes in the enemy's defenses.
<p/>
Marauders start the game in hand, and must come into play by being dropped into the Incursion Zone, and can often promote on their next move:
<img src="../static/images/BorderlandsGuide/IncursionZone.png" alt="Incursion Zone">
</td><td><img src="../static/images/BorderlandsGuide/MarauderPromoted.png" alt="Marauder Promoted"><br/>Betza: KmN<p/>Promoted Marauders move the same as Marauders, and gain the ability to make one step orthogonally (W).</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Falcon (F)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Falcon (+F)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Falcon.png" alt="Falcon"><br/>Betza: WmAmD</td><td><img src="../static/images/BorderlandsGuide/FalconPromoted.png" alt="Falcon Promoted"><br/>Betza: KmAmD</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Warrior (W)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Warrior (+W)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Warrior.png" alt="Warrior"><br/>Betza: fWfceFifmnD</td><td><img src="../static/images/BorderlandsGuide/WarriorPromoted.png" alt="Warrior Promoted"><br/>Betza: NADmQ3</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Elephant (E)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Elephant (+E)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Elephant.png" alt="Elephant"><br/>Betza: ADmR3</td><td><img src="../static/images/BorderlandsGuide/ElephantPromoted.png" alt="Elephant Promoted"><br/>Betza: ADmR3WmF<p/>Promoted Elephants move the same as Elephants, and gain the ability to make one step orthogonally (W), and one non-capturing step diagonally (mF).</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Horse (H)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Horse (+H)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Horse.png" alt="Horse"><br/>Betza: NmB3</td><td><img src="../static/images/BorderlandsGuide/HorsePromoted.png" alt="Horse Promoted"><br/>Betza: NmB3FmW<p/>Promoted Horses move the same as Horses, and gain the ability to make one step diagonally (F), and one non-capturing step orthogonally (mW).</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Slinger (S)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Slinger (+S)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Slinger.png" alt="Slinger"><br/>Betza: BcpBmW<p/>Slingers are long range pieces able to attack from afar along diagonal lines. They can move like a Bishop (B), capture like a Vao (cpB), and also make one non-capturing step orthogonally (mW).</td><td><img src="../static/images/BorderlandsGuide/SlingerPromoted.png" alt="Slinger Promoted"><br/>Betza: BcpBW<p/>Promoted Slingers move the same as Slingers, and gain the ability to make one capturing step orthogonally (W).</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Archer (A)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Archer (+A)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Archer.png" alt="Archer"><br/>Betza: RcpRmF<p/>Archers are long range pieces able to attack from afar along orthogonal lines. They can move like a Rook (R), capture like a Pao (cpR), and also make one non-capturing step diagonally (mF).</td><td><img src="../static/images/BorderlandsGuide/ArcherPromoted.png" alt="Archer Promoted"><br/>Betza: RcpRF<p/>Promoted Archers move the same as Archers, and gain the ability to make one capturing step diagonally (F).</td></tr>
	<tr><td style="background-color:#e6e6e6;color:#000000">Lion (L)</td><td style="background-color:#f7e6ae;color:#000000">Promoted Lion (+L)</td></tr>
	<tr style="border-bottom: 1px solid;"><td><img src="../static/images/BorderlandsGuide/Lion.png" alt="Lion"><br/>Betza: KNAD<p />Lions start the game as a defensive piece restricted to their side's Territory, and have a very limited path to promotion (via the Lion's Incursion Squares) that is easily defended against. Upon reaching the Lion's Promotion Square, a Lion gains the ability to roam the entire board.<p />
<img src="../static/images/BorderlandsGuide/LionZone.png" alt="Lion Movement Zone">
</td><td><img src="../static/images/BorderlandsGuide/LionPromoted.png" alt="Lion Promoted"><br/>Betza: KNAD</td></tr>
</tbody>
</table>
<p/>
### Piece Values
<table border="1">
<thead>
	<tr><th><b>Piece</b></th><th><b>Notation</b></th><th><b>Value</b></th></tr>
</thead>
<tbody>
	<tr><td>Promoted Lion</td><td>+L</td><td>9.45</td></tr>
	<tr><td>Promoted Archer</td><td>+A</td><td>8.82</td></tr>
	<tr><td>Promoted Warrior</td><td>+W</td><td>6.75</td></tr>
	<tr><td>Archer</td><td>A</td><td>5.77</td></tr>
	<tr><td>Promoted Slinger</td><td>+S</td><td>4.88</td></tr>
	<tr><td>Lion</td><td>L</td><td>4.14</td></tr>
	<tr><td>Promoted Horse</td><td>+H</td><td>3.94</td></tr>
	<tr><td>Slinger</td><td>S</td><td>3.81</td></tr>
	<tr><td>Promoted Elephant</td><td>+E</td><td>3.61</td></tr>
	<tr><td>Chief</td><td>C</td><td>3.11</td></tr>
	<tr><td>Promoted Falcon</td><td>+F</td><td>2.51</td></tr>
	<tr><td>Guard</td><td>G</td><td>2.17</td></tr>
	<tr><td>Horse</td><td>H</td><td>2.16</td></tr>
	<tr><td>Elephant</td><td>E</td><td>2.12</td></tr>
	<tr><td>Promoted Marauder</td><td>+M</td><td>1.51</td></tr>
	<tr><td>Warrior</td><td>W</td><td>1.00</td></tr>
	<tr><td>Falcon</td><td>F</td><td>0.90</td></tr>
	<tr><td>Marauder</td><td>M</td><td>0.65</td></tr>
</tbody>
</table>

## Strategy
TODO.

How to Play Borderlands video:
TODO

Gameplay Example 1:
<iframe width="560" height="315" src="https://www.youtube.com/embed/NsAGUMWxyCo" frameborder="0" allowfullscreen></iframe>
Gameplay Example 2:
<iframe width="560" height="315" src="https://www.youtube.com/embed/y88_OAx8bRk" frameborder="0" allowfullscreen></iframe>
