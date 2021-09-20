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
import { timeControlStr } from './view';
import { PyChessModel } from "./main";

export function hostView(model: PyChessModel): VNode[] {
    const gameId = model["gameId"];
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const gameURL = model["home"] + '/' + gameId;
    const gameURLPlayer1 = gameURL + '/player1';
    const gameURLPlayer2 = gameURL + '/player2';

    let title, formAction, buttonClass, buttonText;

    if (model["inviter"] === "") {
        title = _('Hosting a game for others');
        formAction = model["home"] + '/invite/cancel/' + gameId;
        buttonClass = { red: true };
        buttonText = _('CANCEL');
    } else {
        const playerNum = window.location.href.slice(window.location.href.lastIndexOf('/') + 1);
        title = model["inviter"];
        formAction = model["home"] + '/invite/accept/' + gameId + '/' + playerNum;
        buttonClass = { join: true };
        buttonText = _('JOIN THE GAME');
    }

    const evtSource = new EventSource("/api/invites");
    evtSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.gameId === gameId) {
            window.location.assign(gameURL);
        }
    }

    return [
        h('div.invite', [
            h('h1', { attrs: { align: 'center' } }, title),
            h('div.invitegame', [
                h('div.info0.games.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [
                    h('div.info2', [
                        h('div', variant.displayName(chess960)),
                        h('div.tc', timeControlStr(model["base"], model["inc"], model["byo"])),
                    ]),
                    h('div.rated', gameType(model["rated"])),
                ]),
            ]),
            (model["inviter"] === "") ?
            h('div.inviteinfo', [
                h('div', _('To invite others to play, give them these URLs:')),

                h('div', variant.firstColor + ":"),
                h('input#invite-url', { attrs: { readonly: true, spellcheck: false, value: gameURLPlayer1 } }),
                h('button#paste-url', { on: { click: () => {
                    copyTextToClipboard(gameURLPlayer1);
                    patch(document.getElementById('paste-icon') as HTMLElement,
                        h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                    } } }, [
                    h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })]),

                h('div', variant.secondColor + ":"),
                h('input#invite-url', { attrs: { readonly: true, spellcheck: false, value: gameURLPlayer2 } }),
                h('button#paste-url', { on: { click: () => {
                    copyTextToClipboard(gameURLPlayer2);
                    patch(document.getElementById('paste-icon') as HTMLElement,
                        h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                    } } }, [
                    h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })]),

                h('div', _('The first two people to come to these respective URLs will play each other.')),

            ]) : h('div'),
            h('form', {props: {method: "post", action: formAction}, class: {invite: true}}, [
                h('button', {class: buttonClass}, buttonText),
            ]),
        ]),
    ];
}
