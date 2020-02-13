import h from 'snabbdom/h';

export function player(id, title, name, rating, level) {
    return h('round-player', [
        h('div.player-data', [
            h('i-side.online#' + id, {class: {"icon": true, "icon-online": false, "icon-offline": true}}),
            h('player', [
                h('a.user-link', {attrs: {href: '/@/' + name}}, [
                    h('player-title', " " + title + " "),
                    name + ((title === "BOT" && level >= 0) ? ' level ' + level: ''),
                ]),
                h('rating', rating),
            ]),
        ]),
    ]);
}
