import h from 'snabbdom/h';

import { aiLevel } from './profile';

export function player(id: string, title: string, name: string, rating: string, level: number) {
    return h('round-' + id, [
        h('div.player-data', [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                h('a.user-link', { attrs: {href: '/@/' + name} }, [
                    h('player-title', " " + title + " "),
                    name + aiLevel(title, level),
                ]),
                h('rating', title !== 'BOT' ? rating : ''),
            ]),
        ]),
    ]);
}
