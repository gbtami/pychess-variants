import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { model } from './main';


export function aboutView(): VNode[] {
    const untitled = [
        _("\Many Thanks to gbtami and pychess developers to derive this project."),
    ]
    return [
        h('div.about', [
            h('img.center', { attrs: { src: `${model["asset-url"]}/favicon/favicon.png` } }),
            h('h1', { attrs: { align: 'center' } }, _('About Liantichess')),
            h('p', _('Liantichess is a free, open-source antichess server derived from pychess.')),
            h('p', [
                // TODO Automate the generation of this list
                _("All supported games on Liantichess can be seen "),
                h('a', { attrs: { href: 'https://liantichess.herokuapp.com/variants' } }, 'here'),
                ", ",

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