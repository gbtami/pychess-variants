# FAQ

## Pychess

*What is Pychess?* 

Pychess is a website dedicated to allowing people to play major and interesting chess variants (both regional and more modern chess variants). Please see [the about page](https://www.pychess.org/about).

*Why is it called Pychess?*

The code is based on Python.

*What is the difference between this and the software?*

Both are designed to play chess, and both share the same developer (gbtami). However, the differences end there. The full name for this site is Pychess Variants for distinction, but is often just called Pychess. The site for the desktop application is [here](https://pychess.github.io/).

*What is the relationship to [Lichess](https://lichess.org/)?*

Pychess design is heavily influenced by Lichess and is meant to be comfortable for Lichess players. Pychess has no offficial relationship to Lichess. However, it does use Lichess accounts to facilitate user management.

*What is Fairy Stockfish?*

Stockfish is one of the premier engines designed to play chess. Fairy Stockfish is a branch of that created by Ianfab to handle multiple chess variants.

*Is level 8 Stockfish the strongest available?*

It is the strongest available on this site, but does not represent Fairy Stockfish at full strength. Full strength requires more time to think and analyze; on Pychess, Stockfish is limited to less than a second for each move.

*I found a bug! Where do I report it?*

Ultimately it needs to be filed in Github. Ideally, try to find a way to reproduce this bug in your description (if necessary, include the browser and OS). If you're not on Github, you can also mention it on Discord, and someone can file it.

## Variants

*What games are available?*

Check out the [Learn page](https://www.pychess.org/variant).

*How do you play XXX?*

Check out the [Learn page](https://www.pychess.org/variant). Also, within a game, you click the variant name at the top left to be taken to that game's page.

*How do you choose which variants to add?*

Major regional variants have high precedence. For western chess variants, often the most popular or well-known variants are added. However, there are still some that can't be added. Pychess relies on Fairy Stockfish to support the variant, as our code also depends on Fairy Stockfish for move validation.

*Can you add Shatranj?*

Shatranj is a dead variant, and there are similar games (Makruk), so no. There are other sites where you can play Shatranj ([i.e. VChess](https://vchess.club/#/))

*Can you add XXX?*

It depends on how popular or how interesting the variant is. We can't even consider adding variants that are not supported by Fairy Stockfish. Otherwise, you can ask us on Discord or Github.

## Interface

*How do I change settings?*

Click the gear button at the top right of the screen.

*How do I change pieces and boards? Are there western or internationalized pieces?*

Same answer as above, and then click on "Board Settings." All Asian variants have internationalized pieces.

*How do I draw arrows and circles on the board?*

Use the right click. Clicking gives you a circle, and dragging gives you an arrow. These are green by default. You can make them red by holding shift or ctrl, and you can make them blue by holding alt.

*What does "5+3" mean for time?"

Those are the time controls for the game. By default we use an increment system. "5+3" means each player has 5 *minutes*, and after each move adds 3 *seconds* to the clock. You can set the time control to be whatever you want when creating the game. The 5+3 is just the default for random mover.

*Okay, what about the (b) in "5+3(b)?"

The b signifies byo-yomi time controls, which are different than increment, and is only used in certain variants (i.e. shogi and janggi). Each player has a fixed time bank (5 minutes, in this example), and then after that, they only have the byo-yomi period for the rest of their moves before losing. In this example, that means only 3 seconds per move. Typically, byo-yomi is played with more than just 3 seconds... usually anywhere from 10 seconds to 30 seconds.

*What is Random Mover?*

Random Mover is a bot that just chooses a random move from the list of available options. It serves as a great way to familiarize oneself with the piece movements and some rules. It is strongly recommended to train against Fairy Stockfish (even a lower level) once you know the rules though.

## Social/Accounts

*How do I login?*

You need to have a Lichess account. If you don't already, please go to [Lichess](https://lichess.org/) to make an account.

*What's the best way to communicate?*

You can try the lobby chat, although the developers might not be on to answer. More reliably, we use [Discord](https://discord.gg/aPs8RKr).

*How is the site supported?*

Purely through donations. Please [become a patron](https://www.pychess.org/patron) to help us make this site better!

*Can I contribute?*

You sure can! Pychess is open source. Please communicate suggestions by Github or Discord.



