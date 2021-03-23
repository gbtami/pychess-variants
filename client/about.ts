import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { model } from './main';


export function aboutView(): VNode[] {
    const untitled = [
        _("\"To me, how we've got here today is owing to Stockfish in a BIG way. They rallied global volunteers to come together in the open-source spirit and create such a powerful engine for FREE. That's a lot of great minds and computing power they've managed to harness."),
        _("Then we've got Lichess to thank. Lichess was also born out of the same open-source spirit, and it too drew in great people as well. Once Lichess incorporated Stockfish as its brains, the rest is history."),
        _("Lichess enables the online, real-time, and competitive aspects of game-play. They also bring the enormous power of Stockfish to the masses, who can now benefit from it without configuring a local GUI. I believe this development turns out to be of great consequence and significance."),
        _("Later on, developers close to the Lichess project eventually extended Stockfish into Multivariant-Stockfish, in order to support Crazyhouse et al. The father of Fairy-Stockfish, Fabian, is also one of those devs (still) working on that fork, and he later took several steps further in terms of variant support and extensibility. Thus Fairy-Stockfish was born, so powerful because it builds on the Stockfish project."),
        _("Then comes our beloved pychess-variants, which again very smartly harnesses the underlying superpowers of the big projects. Same online, real-time, and competitive aspects. Same clean and familiar Lichess look and feel. Plus the power of Stockfish!\""),
    ]
    return [
        h('div.about', [
            h('img.center', { attrs: { src: `${model["asset-url"]}/favicon/favicon-96x96.png` } }),
            h('h1', { attrs: { align: 'center' } }, _('About pychess')),
            h('p', _('Pychess is a free, open-source chess server designed to play several chess variants.')),
            h('p', [
                // TODO Automate the generation of this list
                _("Currently supported games are "),
                h('a', { attrs: { href: 'https://www.pychess.org/variant/makruk' } }, 'Makruk'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/makpong' } }, 'Makpong'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/cambodian' } }, 'Ouk Chatrang'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/sittuyin' } }, 'Sittuyin'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/shogi' } }, 'Shogi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/minishogi' } }, 'Minishogi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/kyotoshogi' } }, 'Kyoto shogi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/dobutsu' } }, 'Dobutsu shogi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/gorogoro' } }, 'Gorogoro shogi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/xiangqi' } }, 'Xiangqi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/manchu' } }, 'Manchu'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/janggi' } }, 'Janggi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/minixiangqi' } }, 'Minixiangqi'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/placement' } }, 'Placement'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/crazyhouse' } }, 'Crazyhouse'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/atomic' } }, 'Atomic'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/seirawan' } }, 'S-chess'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/capablanca' } }, 'Capablanca'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/gothic' } }, 'Gothic'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/grand' } }, 'Grand'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/shako' } }, 'Shako'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/shogun' } }, 'Shogun'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/orda' } }, 'Orda'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/synochess' } }, 'Synochess'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/hoppelpoppel' } }, 'Hoppel-Poppel'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/shouse' } }, 'S-house (S-chess+Crazyhouse)'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/capahouse' } }, 'Capahouse (Capablanca+Crazyhouse)'),
                ", ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/grandhouse' } }, 'Grandhouse (Grand+Crazyhouse)'),
                ", and ",
                h('a', { attrs: { href: 'https://www.pychess.org/variant/chess' } }, 'Chess.'),
            ]),
            h('p', [
                _('Additionally, you can check the Chess960 option for Chess, Crazyhouse, Atomic, S-chess, Capablanca, and Capahouse to start games from random positions with '),
                h('a', { attrs: { href: 'https://en.wikipedia.org/wiki/Chess960#Castling_rules' } }, _('Chess960 castling rules.'))
            ]),
            h('p', [
                _('For move generation, validation, analysis, and engine play, we use '),
                h('a', { attrs: { href: 'https://github.com/gbtami/Fairy-Stockfish' } }, 'Fairy-Stockfish'),
                ", ",
                h('a', { attrs: { href: 'https://github.com/gbtami/fairyfishnet' } }, 'fairyfishnet'),
                ", and ",
                h('a', { attrs: { href: 'https://github.com/gbtami/lichess-bot-variants' } }, 'lichess-bot-variants.'),
            ]),
            h('p', [
                _('On client side, the user interface of the game board is based on '),
                h('a', { attrs: { href: 'https://github.com/gbtami/chessgroundx' } }, 'chessgroundx.'),
            ]),
            h('p', [
                _('The source code of the server is available on '),
                h('a', { attrs: { href: 'https://github.com/gbtami/pychess-variants' } }, 'GitHub.'),
            ]),
            h('hr'),
            h('p', [
                _('Regarding Privacy and Terms of Service, the rules of lichess.org are also applied here. '),
                h('a', { attrs: { href: 'https://lichess.org/privacy' } }, 'Privacy'),
                ", ",
                h('a', { attrs: { href: 'https://lichess.org/terms-of-service' } }, 'ToS'),
            ]),
            h('hr'),
            h('p', untitled.map(paragraph => h('p', paragraph))),
            h('p', 'Untitled_Entity'),
        ]),
    ];
}
