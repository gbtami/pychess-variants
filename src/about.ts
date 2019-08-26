import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';


export function aboutView(model): VNode[] {
    renderUsername(model["home"], model["username"]);

    console.log(model);
    return [h('aside.sidebar-first'),
            h('main.main', [
                h('div.about', [
                    h('h2', "About pychess-variants"),
                    h('p', "pychess-variants is a free, open-source chess server designed to play several chess variants."),
                    h('p', [
                        "Currently supported games are ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Makruk'}}, 'Makruk'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Sittuyin'}}, 'Sittuyin'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Shogi'}}, 'Shogi'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Xiangqi'}}, 'Xiangqi'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Capablanca'}}, 'Capablanca'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Seirawan'}}, 'Seirawan'),
                        ", ",
                        h('a', {attrs: {href: 'http://www.quantumgambitz.com/blog/chess/cga/bronstein-chess-pre-chess-shuffle-chess'}}, 'Placement'),
                        ", ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Crazyhouse'}}, 'Crazyhouse'),
                        ", ",
                        h('a', {attrs: {href: 'https://www.twitch.tv/videos/466253815'}}, 'Capahouse (Capablanca+Crazyhouse)'),
                        ", ",
                        h('a', {attrs: {href: 'https://www.twitch.tv/videos/469032892'}}, 'Shouse (Seirawan+Crazyhouse)'),
                        " and standard ",
                        h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Chess'}}, 'Chess.'),
                    ]),
                    h('p', ['Additionally you can check Chess960 option in for Standard, Crazyhouse, Capablanca and Capahouse to start games from random positions with ',
                            h('a', {attrs: {href: 'https://en.wikipedia.org/wiki/Chess960#Castling_rules'}}, 'Chess960 castling rules.')
                        ]),
                    h('p', [
                        'For move generation, validation and engine play it uses ',
                        h('a', {attrs: {href: 'https://github.com/gbtami/Fairy-Stockfish'}}, 'Fairy-Stockfish'),
                        ", ",
                        h('a', {attrs: {href: 'https://github.com/xqbase/eleeye'}}, 'ElephantEye'),
                        ", ",
                        h('a', {attrs: {href: 'https://github.com/walker8088/moonfish'}}, 'moonfish'),
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
                ]),
            h('aside.sidebar-second'),
            ]),
        ];
}
