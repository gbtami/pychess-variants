<h1 align="center">How to play the variants on liantichess?</h1>

<div class="meta-headline">
    <div class= "meta">
        <span class="text">2022.03.13</span>
        <span class="text"><a href="/@/cFlour">@cFlour</a></span>
        <span class="text">Announcements</span>
    </div>
    <div class= "headline">antichess opening strategies does not work in the antichess variants</div>
</div>
</br>

![cFlour](https://imgur.com/6sDRr8n.png)


This happened to me a lot. I tried to use antichess opening strategies in the antichess variants on [liantichess](https://liantichess.herokuapp.com) but soon realised they don't work. So in this blog, I'll go over the openings and strategy of some of those variants.

# [Anti-Atomic](https://liantichess.herokuapp.com/variants/antiatomic)

One thing to note about anti-atomic is that, don't open your queen too early. So, 1.d4 is a complete blunder

![1.d4 anti-atomic](https://i.imgur.com/ZQMv9oq.png)

as after e5 dxe5 Ne7 Qxd7,

![d4 e5 dxe7 Ne7 Qxd7](https://i.imgur.com/mGmqWwH.png)

White has 14 pieces left while black has 10. As in anti-atomic, a piece that is capturing also gets captured, this position is an easy win for black.

# Anti-Atomic Strategy

I and @vlad\_00 played a series of games of this, after which we both realised, that the best strategy here, is to either force your opponent to trade one piece for 3 or 4 or get rid of all your pawns. The "atomic problem" of pawns is what makes them easy targets for your opponent in endgames.

Take [this game](https://liantichess.herokuapp.com/c65C4SKp) for example.

After 3.d6, I chose to not give the queen away but a pawn instead as it had cost me lots of endgames in the games before. So after 6.c5, I was safe to give away my queen on the 8th move. Kd7 by black there was to prevent the queen from taking lots of pieces of mine.

![anti-atomic kd7](https://i.imgur.com/kL4zydy.png)

10.Nc3 to get rid of the knights as they also cause problems sometimes. Although I never understood why Vlad played Ne4, I suppose it was to get rid of my main pieces as I had more pawns left than him.

![anti-atomic Ne4](https://i.imgur.com/rIoaIQ5.png)

But I soon equalised after 17.h4. I think Bh6 was the point where it was clear 1-0, as it was a relatively simple KP v K endgame after that.

# [Anti-Antichess](https://liantichess.herokuapp.com/variants/anti_antichess)

Although I don't know much about this, I realised that this is basically chess with forced captures without a royal king. But @tolius has [made a BOT on lichess](https://lichess.org/@/anti-anti) against which you can practice anti-antichess, so I guess he is the expert here.

For strategy, I recommend his study on lichess:
https://lichess.org/study/dICuQJO3

## [Antihouse](https://liantichess.herokuapp.com/variants/antihouse)

Here, its important to remember, Nc3 isn't a forced loss as its solution in antichess relies mostly on [zugzwangs](https://lichess.org/@/cFlour/blog/antichess-the-zugzwangs-and-intermediates/5XNYCdMf). I learnt this the hard way after losing a lot to @Nc3Nc6 in this. For openings, go with openings that don't open up lots of pieces, like Nc3, f3, f4, a3, h3, b3, g3, g4, b4. e3, c4, c3, a4, h4 are not theoretically lost, but they require lots of perfect play to not make the game completely lost, while d3, d4 and e4 are 0-1 like antichess.

#### Strategy

The thing that defines who wins in this is the question: `Whose move is it when there are no pieces threatening to capture?` If its yours when you have 4-5 pieces or more in the pocket, you might win. But same goes for your opponent.

In [this game](https://liantichess.herokuapp.com/f9DhppiG), I went for a line in which it forces my opponent to give up lots of his/her pieces without giving away too much of mine. Although I guess after Bb2,
![Bb2](https://i.imgur.com/B8JA6ex.png)
it was 0-1 already.

## [Coffeehill](https://liantichess.herokuapp.com/variants/coffeehill)

The coffee variants on liantichess are all about calculating [zwischenzugs/intermediate moves](https://lichess.org/@/cFlour/blog/antichess-the-zugzwangs-and-intermediates/5XNYCdMf). The best openings would be f4 or e4, as f4 protects the centre without giving up your queen early and e4 gives away the queen but gets your king in position to go to the hill.

#### Strategy

I would say, try to get your king to the 3rd/6th file within the first 7 moves. I think this game is heavily influenced by white, so I wanted to show you an [interesting zwischenzug which I found as black](https://liantichess.herokuapp.com/5R222sGj).
It should probably go into the strategy guide that Nc3 d5 Nxd5 Qxd5 d4 is 0-1 in coffeehill with that zwischenzug. The idea is to give the white bishop as many captures as possible so the black king can advance freely.

![Coffeehill](https://i.imgur.com/ysoUymt.png)

So, the only thing to be done is to set up 2 free capturable pieces and your king can advance into the centre. Although to **force** those moves, the order of moves is important.
Obviously, we don't want our bishop to capture back on b7, so we go for b5, where we can set up two captures after playing Na6 later. After the bishop takes the rook, you can either play Bb7 or e5 first, provided that it comes before Na6. Now we can freely advance our king towards the centre

![Kingwalk coffeehill](https://i.imgur.com/ZDUlGBr.png)

Now as it is white's move, the only 4 moves that can delay Kxe5# are Nf3, f4, Bf4 and Qd4, but they can all be stopped easily. Here is how:

| For | Response | Image |
| --- | -------- | ----- |
| Qd4 | Bb4+ | ![Qd4](https://i.imgur.com/NoK1Tga.png) |
| f4 | g5 | ![f4](https://i.imgur.com/7TpPHzG.png) |
| Bf4 | g5 | ![Bf4](https://i.imgur.com/HkKbiVO.png) |
| Nf3 | g5 | ![Nf3](https://i.imgur.com/hbrahDD.png) |

## [Coffeerace](https://liantichess.herokuapp.com/variants/coffeerace)

This is my favourite one in the coffee series. Here, as it is with forced captures, white is always forced to play Nxf2. So if you want to keep the game balanced, the first two moves by both sides are usually Nxf2 Nxc2 Rxc2 Rxf2. So going by theory, this position is ideal for both sides in coffeerace:
![coffeerace to rb6](https://i.imgur.com/Dze8WDQ.png)
New people might fall for the Rf6 trap, but for white to stay in the game, white should probably play Kh5 Nxf1 Rgxf1 Rxe2 Rxe2. From then, literally anything can be played, so it is out of the opening now.

Another interesting opening (which is a complete draw with perfect play) is [this one](https://liantichess.herokuapp.com/z019Ubcc). In usual cases, king and rook against king and queen would be won for the king and queen, but here as the queen was a white piece and both kings were on the same rank, it was forced into a draw.

#### Strategy

Two things to note:

* The game is won/lost/drawn mostly by your choice of opening here.
* Always keep at least one piece except your king to get your opponent's rook/queen off the 8th rank.

## [Coffeehouse](https://liantichess.herokuapp.com/variants/coffeehouse)

I haven't studied this yet, but here is what @Kex09 says about this:
Many crazyhouse tactics apply, like having weak f2/f7 or c2/c7 can be fatal. Also if you don't have a safe king, I mean carefully safe, it can be attacked with knights or bishops with queen delivery while you will be forced to take piece after intermediate setup. So king safety is important as you can get into a point, where you won't be able to defend against attacks and lose.

Material - it is better to get as much as possible, also pawn value increased, as pawns can lure the king exactly where you want him to go by setting up a path of multiple pawns with the king forced to take them. Openings I really don't know, there are like no good openings or at least almost all can be somehow refuted. Knights - very important pieces in pockets. With knights, you can mate easier as they have a low range so after a drop with a check there are only a few squares where they capture. N + Q combo for checkmate is very strong, that's why you need to have a safe king and prevent these things.

## Credits

* tolius for that amazing anti-antichess study.
* vlad\_00 for teaching me anti-atomic strategy.
* Nc3Nc6 for showing Antihouse dominance.
* TheUsualDumbKid for showing me how coffeerace can be forced into drawn games.
* Kex09 for the coffeehouse section of the blog.
* Crusader\_007 for the blog cover logo.