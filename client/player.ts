import { h } from 'snabbdom';

import { aiLevel } from './result';
import { displayUsername, userLink } from './user';

export function player(id: string, title: string, name: string, rating: string, level: number) {
    const displayName = displayUsername(name);
    return h('round-' + id, [
        h('div.player-data', [
            h('i-side#' + id + '.online.icon', { class: { "icon-online": false, "icon-offline": true } }),
            h('player', [
                userLink(name, [
                    (title !== '') ? h('player-title', title + ' ') : '',
                    displayName + aiLevel(title, level),
                ]),
                h('rating', title !== 'BOT' ? rating : ''),
            ]),
        ]),
    ]);
}
