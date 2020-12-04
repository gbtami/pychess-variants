import h from 'snabbdom/h';

import { aiLevel } from './profile';

export function player(id, title, name, rating, level) {
    return h('round-player', [
        h('div.player-data', [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                h('a.user-link', { attrs: {href: '/@/' + name} }, [
                    h('player-title', " " + title + " "),
                    name + aiLevel(title, level),
                ]),
                h('rating', rating),
            ]),
        ]),
    ]);
}
