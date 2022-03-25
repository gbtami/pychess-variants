<h1 align="center">What's up on liantichess</h1>

<div class="meta-headline">
    <div class= "meta">
        <span class="text">2022.03.25</span>
        <span class="text"><a href="/@/SriMethan">@SriMethan</a></span>
        <span class="text">Announcements</span>
    </div>
    <div class= "headline">Exciting stuff is going on. Let's keep you in the loop.</div>
</div>
</br>

# Client-side analysis on Liantichess

![image](https://imgur.com/ctLlb2a.png)


Oh yeah. Client-side analysis has been long requested. [YohaanSethNathan](https://liantichess.herokuapp.com/@/YohaanSethNathan) spent up his time and got it done!

Fairy Stockfish 11 WASM (multi-threaded) with liantichess variants support!

Before liantichess supported analysis for only antichess and losers chess. After this change it supports all Liantichess variants other than antiempire, antichak and all atomic related variants. This is because the version of fairy stockfish used does not support custom pieces, which is needed for antiempire and antichak, and does not support atomic (`blastOnCapture`), which is needed for atomic related variants, unlike the master version which supports these.

Support for all variants has been done without `variants.ini` configuration because [fairy-stockfish.wasm](https://github.com/ianfab/stockfish.wasm) does not support configuring variants through the variants.ini file (yet). The fork of [fairy-stockfish.wasm](https://github.com/ianfab/stockfish.wasm) used to get this done can be found [here](https://github.com/TheYoBots/stockfish.wasm).

So for the time being, client-side analysis on Liantichess will keep using Fairy Stockfish 11 Until the merge up stream for Fairy Stockfish 14 is added.

In the future we may consider more advanced options for client-side analysis

# Server-side analysis on Liantichess updated with support for new variants

![image](https://imgur.com/uCz7nhh.png)

clients providing server-side analysis for Liantichess have already been updated with support for new variants. If you are volunteering computing power using [fairyfishnet](https://github.com/TheYoBots/fairyfishnet), please update to latest [fairyfishnet](https://github.com/TheYoBots/fairyfishnet), so that everyone can enjoy Fairy Stockfish 14.1+ analysis for [all variants supported on Liantichess](https://liantichess.herokuapp.com/variants).

# Relevant links

[Stockfish.wasm](https://github.com/TheYoBots/stockfish.wasm)

[Fairyfishnet](https://github.com/TheYoBots/fairyfishnet)

[Discord](https://discord.gg/5qvjPQstKS)

[LichessTeam](https://lichess.org/team/liantichessherokuappcom)