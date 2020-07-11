import h from 'snabbdom/h';

import { _ } from './i18n';

export function player(id, title, name, rating, level) {
    return h('round-player', [
        h('div.player-data', [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                h('a.user-link', { attrs: {href: '/@/' + name} }, [
                    h('player-title', " " + title + " "),
                    name + ((title === "BOT" && level >= 0) ? _(' level ') + level: ''),
                ]),
                h('rating', rating),
            ]),
        ]),
    ]);
}
