import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { model } from './main';


export function aboutView(): VNode[] {
    const untitled = [
        _("Many Thanks to gbtami and pychess developers to derive this project."),
    ]
    return [
        h('div.about', [
            h('img.center', { attrs: { src: `${model["asset-url"]}/favicon/favicon.png` } }),
            h('h1', { attrs: { align: 'center' } }, _('About Liantichess')),
            h('p', _('Liantichess is a free, open-source antichess server designed to play several antichess variants, derived from pychess.')),
            h('p', [
                // TODO Automate the generation of this list
                _("All supported games on Liantichess can be found "),
                h('a', { attrs: { href: 'https://liantichess.herokuapp.com/variants' } }, 'here'),
                "."
            ]),
            h('p', [
                _('Additionally, you can check the Chess960 option for few antichess variants to start games from random positions with '),
                h('a', { attrs: { href: 'https://en.wikipedia.org/wiki/Fischer_random_chess#Castling_rules' } }, _('Chess960 castling rules.'))
            ]),
            h('p', [
                _('For move generation, validation, analysis, and engine play, we use '),
                h('a', { attrs: { href: 'https://github.com/ianfab/Fairy-Stockfish' } }, 'Fairy-Stockfish'),
                ", ",
                h('a', { attrs: { href: 'https://github.com/ianfab/fairy-stockfish.wasm' } }, 'fairy-stockfish.wasm'),
                ", ",
                h('a', { attrs: { href: 'https://github.com/TheYoBots/fairyfishnet' } }, 'fairyfishnet'),
                ", and ",
                h('a', { attrs: { href: 'https://github.com/gbtami/lichess-bot-variants' } }, 'lichess-bot-variants.'),
            ]),
            h('p', [
                _('On client side, the user interface of the game board is based on '),
                h('a', { attrs: { href: 'https://github.com/gbtami/chessgroundx' } }, 'chessgroundx.'),
            ]),
            h('p', [
                _('The source code of the server is available on '),
                h('a', { attrs: { href: 'https://github.com/SriMethan/liantichess' } }, 'GitHub.'),
            ]),
            h('hr'),
            h('p', [
                _('To play on Liantichess, you need to have an open and unmarked account on Lichess. '),
                _('Regarding Privacy and Terms of Service, the rules of lichess.org are also applied here. '),
                h('a', { attrs: { href: 'https://lichess.org/privacy' } }, 'Privacy'),
                ", ",
                h('a', { attrs: { href: 'https://lichess.org/terms-of-service' } }, 'ToS'),
            ]),
            h('hr'),
            h('p', untitled.map(paragraph => h('p', paragraph))),
        ]),
    ];
}