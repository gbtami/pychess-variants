import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { VARIANTS } from './chess';
import { gameType } from './profile';
import { copyTextToClipboard } from './clipboard';

export function inviteView(model): VNode[] {
    const gameId = model["gameId"];
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const gameURL = model["home"] + '/' + gameId;

    const evtSource = new EventSource("/api/invites");
    evtSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.gameId === gameId) {
            window.location.assign(gameURL);
        }
    }

    return [
        h('div.invite', [
            h('h1', { attrs: { align: 'center' } }, _('Challenge to a game')),
            h('div.invitegame', [
                h('div.info0.games.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [
                    h('div.info2', [
                        h('div', variant.displayName(chess960)),
                        h('div.tc', model["base"] + "+" + (model["byo"] > 1 ? model["byo"] + "x" : "") + model["inc"] + (model["byo"] > 0 ? "(b)" : "")),
                    ]),
                    h('div.rated', gameType(model["rated"])),
                ]),
            ]),
            h('div.inviteinfo', [
                h('div', _('To invite someone to play, give this URL:')),
                h('input#invite-url', {attrs: {readonly: true, spellcheck: false, value: gameURL}}),
                h('button#paste-url', { on: { click: () => {
                    copyTextToClipboard(gameURL);
                    patch(document.getElementById('paste-icon') as HTMLElement,
                        h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                    } } }, [
                    h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })]),
                h('div', _('The first person to come to this URL will play with you.')),

            ]),
        ]),
    ];
}
