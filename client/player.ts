import { h } from 'snabbdom';

import { aiLevel } from './result';

export function player(id: string, title: string, name: string, rating: string, level: number) {
    return h('round-' + id, [
        h('div.player-data', [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                name + aiLevel(title, level),
            ]),
        ]),
    ]);
}
