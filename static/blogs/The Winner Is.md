ANNOUNCING THE RESULTS OF THE VARIANT DESIGN CONTEST
----------------------------------------------------

Thank you to everyone for participating in our first chess variant design contest! We had some great ideas come out, and it was interesting to see how the contestants were able to utilize Fairy Stockfish's engine and the contest theme to come up with original ideas! The judges mostly looked at the playability (rules including piece movement), fun-factor, uniqueness/originality, and obviously theming when deciding the winner. And with those in mind, the winner came was, by unanimous vote: @Eventlesstew's Xiangfu! (https://pychess-dev-023de207d200.herokuapp.com/variants/xiangfu) 
Some comments on the judges regarding Xiangfu:

> In Xiangfu I played a few games against Fairy-SF (and actually won one 😮), and it was quick to pick up. First I was a bit worried about conceptual similarities with chennis, but the mechanics and dynamics are actually quite unique. The config with respect to chasing/repetition is kind of wrong, but we can clean that up I guess.
> Xiangfu design is simple and the pieces and the rules are easy to understand. Its region usage is thought out well.

Overall, Xiangfu is the one that checks the most boxes. It has a very different setup, especially compared to the standard variants. Yet it's very easy to understand out of the box, the pieces are very transparent, and the gameplay is very swift. The theming is great with the central ring that kind of has WWF wrestling vibes (with other pieces throwing chairs and debris into the middle). The only concern I had is that it may be a bit too similar, but the two kings and lack of flipping does make it stand out. It can use a little bit of work on the elephant, but overall I think it has a pretty easy path to being implemented.
As for the other entrees, one judge sums it up best:

> Btw some words about the other contestants. First of all I immediately ruled out chess-vs-xiangqi because it brings nothing to the table regarding the theme.
>
> From theme point of view I find Sinting and Shocking interesting as well (next to Xiangfu and borderland)
>
> The idea of knight tour regions for different colored knights was heart warming for me, but unfortunately everything else is not.
> 
> The connect rule usage in Shocking is also very unique and interesting, but at the end of the day I felt it rather "negative" as a player.
> Regarding the remaining games not mentioned so far, they has similar issues. 
>
> 1. They use too many new pieces and/or complex rules.
> 2. I have the similar feeling what Magnus said in https://www.youtube.com/watch?v=7niNOtRVSj0
>    I mean a simple new idea can be very-very good from general game playing perspective (like in alice, zh, atomic, koth),  but if it just  slows down the game it is possible not not good when you play that game more and more.
 
And from another:
> Yeah, the temptation to put as many new pieces and rules as possible into a new variant generally seems to be big, even if they have no clear purpose. Structure, and a clear and simple theme and concept would suit them well.
> E.g., melon's variant I think had potential, but it feels like 2 or 3 variants put into 1, which ruins the fun.

Most notably, @Dean's Borderlands was the runner-up. Personally, at first I thought it was on the lower end when I started reading about it and playing about it because of how confused I was. But once I got used to it, it actually played very well -- and basically it reminded me of Chu Shogi. The theming was also outstanding. But like it was stated above, there are too many ideas. Any one of them on their own could've been very interesting. For example, the Chu-Shogi-lion-like piece that has a destination goal is a really, really cool idea. That alone could have carried it. 

So basically, Borderlands could still potentially be implemented, but unlike Xiangfu, it would need a lot of overhauling -- mainly the simplify the pieces. I've mentioned this in the chat earlier -- that while divergent pieces are cool, they're incredibly complex and should be avoided. The irony is that some of my most famous variants heavily use divergent pieces... BUT, because of the theme, the movement rules for all the divergent pieces are the same (i.e. in Orda-Khan's, most/all pieces move like knights but attack like their original chess contraparts). In other words, taking a complex rule but simplifying to be easily understood. 

In the case of borderlands, if divergent moving was really desired, then all pieces should have the same rule. Or if you really needed more options, then have two tiers of pieces. One that could only silently move like a king (low tier), and another that can move up to two spaces out (high tier) -- then these pieces can also be visually distinguished by size or something. 

I also didn't even mention promotions, and that was something I don't think I or the other judges would've been able to stomach, but again promotions should have some blanket rule to be easy to understand.

Also it should be mentioned that Dean did an incredible job with the graphics, which really helped with understanding the game. However, as stated we don't count graphics at all in the contest. 
As for general feedback for other contestants -- it's similar to borderlands but a lot of the piece movements were too chaotic. And on top of that, many variants also featured promotions that were not really uniform, making it even more confusing. Several entries also had a very slow pace by trying to keep pieces weak but having better promotions... kind of like Shogi, but Shogi also has strong pieces to balance that out. In combination with the stifling western chess pawns that Shogi doesn't have, they felt very slow and tended towards more 'closed' positions.
