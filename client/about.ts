import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';


const untitled = [
"\"To me, how we've got here today is owing to Stockfish in a BIG way. They rallied global volunteers to come together in the open-source spirit and create such a powerful engine for FREE. That's a lot of great minds and computing power they've managed to harness.",
"Then we've got Lichess to thank. Lichess was also born out of the same open-source spirit, and it too drew in great people as well. Once Lichess incorporated Stockfish as its brains, the rest is history.",
"Lichess enables the online, real-time, and competitive aspects of game-play. They also bring the enormous power of Stockfish to the masses, who can now benefit from it without configuring a local GUI. I believe this development turns out to be of great consequence and significance.",
"Later on, developers close to the Lichess project eventually extended Stockfish into Multivariant-Stockfish, in order to support Crazyhouse et al. The father of Fairy-Stockfish, Fabian, is also one of those devs (still) working on that fork, and he later took several steps further in terms of variant support and extensibility. Thus Fairy-Stockfish was born, so powerful because it builds on the Stockfish project.",
"Then comes our beloved pychess-variants, which again very smartly harnesses the underlying superpowers of the big projects. Same online, real-time, and competitive aspects. Same clean and familiar Lichess look and feel. Plus the power of Stockfish!\"",
]

export function aboutView(model): VNode[] {
    renderUsername(model["home"], model["username"]);

    console.log(model);
    return [h('aside.sidebar-first'),
            h('main.main', [
                h('div.about', [
                    h('img.center', {attrs: {src: '/static/favicon/favicon-96x96.png'}}),
                    h('h1', {attrs: {align: 'center'}}, 'About pychess-variants'),
                    h('p', 'pychess-variants is a free, open-source chess server designed to play several chess variant.'),
                    h('p', [
                        "Currently supported games are ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Makruk'}}, 'Makruk'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Makruk#Cambodian_chess'}}, 'Ouk Chatrang'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Sittuyin'}}, 'Sittuyin'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Shogi'}}, 'Shogi'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Minishogi'}}, 'Minishogi'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Kyoto_shogi'}}, 'Kyoto shogi'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Xiangqi'}}, 'Xiangqi'),
                        ", ",
                        h('a', {attrs: {href: 'http://mlwi.magix.net/bg/minixiangqi.htm'}}, 'Minixiangqi'),
                        ", ",
                        h('a', {attrs: {href: 'http://www.quantumgambitz.com/blog/chess/cga/bronstein-chess-pre-chess-shuffle-chess'}}, 'Placement'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Crazyhouse'}}, 'Crazyhouse'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Seirawan_Chess'}}, 'S-chess'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Capablanca_Chess'}}, 'Capablanca'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Gothic_chess'}}, 'Gothic'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Grand_Chess'}}, 'Grand'),
                        ", ",
                        h('a', {attrs: {href: 'https://www.chessvariants.com/large.dir/shako.html'}}, 'Shako'),
                        ", ",
                        h('a', {attrs: {href: 'https://pychess-variants.herokuapp.com/guides/Variants'}}, 'Shogun'),
                        ", ",
                        h('a', {attrs: {href: 'https://pychess-variants.herokuapp.com/IRVxMG72'}}, 'S-house (S-chess+Crazyhouse)'),
                        ", ",
                        h('a', {attrs: {href: 'https://www.twitch.tv/videos/466253815'}}, 'Capahouse (Capablanca+Crazyhouse)'),
                        ", ",
                        h('a', {attrs: {href: 'https://pychess-variants.herokuapp.com/kGOcweH3'}}, 'Gothhouse (Gothic+Crazyhouse)'),
                        ", ",
                        h('a', {attrs: {href: 'https://youtu.be/In9NOBCpS_4'}}, 'Grandhouse (Grand+Crazyhouse)'),
                        " and standard ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Chess'}}, 'Chess.'),
                    ]),
                    h('p', ['Additionally you can check Chess960 option in for Standard, Crazyhouse, Capablanca and Capahouse to start games from random positions with ',
                            h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Chess960#Castling_rules'}}, 'Chess960 castling rules.')
                        ]),
                    h('p', [
                        'For move generation, validation, analysis and engine play it uses ',
                        h('a', {attrs: {href: 'https://github.com/gbtami/Fairy-Stockfish'}}, 'Fairy-Stockfish'),
                        ", ",
                        h('a', {attrs: {href: 'https://github.com/gbtami/fairyfishnet'}}, 'fairyfishnet'),
                        " and ",
                        h('a', {attrs: {href: 'https://github.com/gbtami/lichess-bot-variants'}}, 'lichess-bot-variants.'),
                    ]),
                    h('p', [
                        'On client side it is based on ',
                        h('a', {attrs: {href: 'https://github.com/gbtami/chessgroundx'}}, 'chessgroundx.'),
                    ]),
                    h('p', [
                        'Source code of server is available at ',
                        h('a', {attrs: {href: 'https://github.com/gbtami/pychess-variants'}}, 'GitHub.'),
                    ]),
                    h('hr'),
                    h('p', 'Regarding Privacy and Terms of Service, the rules of lichess.org are applied here.'),
                    h('hr'),
                    h('p', untitled.map((paragraph) => {return h('p', paragraph)})),
                    h('p', 'Untitled_Entity'),
                    
                ]),
            h('aside.sidebar-second'),
            ]),
        ];
}
