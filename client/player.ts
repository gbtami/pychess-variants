import { h } from 'snabbdom';

import { aiLevel } from './result';

export function player(elem: string, id: string, title: string, name: string, rating: string, level: number) {
    const elems = [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                h('a.user-link', { attrs: {href: '/@/' + name} }, [
                    h('player-title', " " + title + " "),
                    name + aiLevel(title, level),
                ]),
                h('rating', title !== 'BOT' ? rating : ''),
            ]),
        ];
    return h(elem, [
        h('div.player-data', elem.indexOf(".bug")>-1? elems.reverse(): elems),
    ]);
}
