import { h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { VARIANTS } from './chess';
import { patch } from './document';
import { gameType } from './profile';
import { copyTextToClipboard } from './clipboard';
import { timeControlStr } from './view';
import { PyChessModel } from './main';
import { colorNames } from './profile';

export function inviteView(model: PyChessModel): VNode[] {
    const gameId = model["gameId"];
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const gameURL = '/' + gameId;
    const gameURLPlayer1 = gameURL + '/player1';
    const gameURLPlayer2 = gameURL + '/player2';
    const seekEmpty = model["seekEmpty"];

    const evtSource = new EventSource("/api/invites");
    evtSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.gameId === gameId) {
            window.location.assign(gameURL);
        }
    }

    let title, formAction, buttonClass, buttonText;
    let player: string = window.location.pathname.split("/").pop()!;
    if (!player?.match(/player[1-2]/)) player = "";

    switch (model["inviter"]) {
        case "": 
            title = seekEmpty ? _('Host a game for others') : _('Challenge to a game');
            formAction = '/invite/cancel/' + gameId;
            buttonClass = {red: true};
            buttonText = _('CANCEL');
            break;
        case "wait":
            title = _('Waiting for the other player');
            formAction = '/invite/cancel/' + gameId;
            buttonClass = {red: true};
            buttonText = _('CANCEL');
            break;
        case "occupied":
            title = _('Sorry, this seat is already occupied');
            formAction = '/invite/cancel/' + gameId;
            buttonClass = {red: true};
            buttonText = _('CANCEL');
            break;
        case "yourself":
            title = _('Sorry, you cannot play with yourself');
            formAction = '/invite/cancel/' + gameId;
            buttonClass = {red: true};
            buttonText = _('CANCEL');
            break;
        default:
            title = model["inviter"];
            formAction = '/invite/accept/' + gameId + (!!player ? "/" + player : "");
            buttonClass = {join: true};
            buttonText = _('JOIN THE GAME');
    }

    return [
        h('div.invite', [
            h('h1', { attrs: { align: 'center' } }, title),
            h('div.invitegame', [
                h('div.info0.games.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [
                    h('div.info2', [
                        h('div', variant.displayName(chess960)),
                        h('div.tc', timeControlStr(model["base"], model["inc"], model["byo"])),
                        h('div', h('i', { class: {
                            // TODO Correct icon colour for different variants
                            "icon": !!player,
                            "icon-white": player === "player1",
                            "icon-black": player === "player2"
                        } })),
                    ]),
                    h('div.rated', gameType(model["rated"])),
                ]),
            ]),
            (model["inviter"] === "") ?
                ( (seekEmpty) ?
                    h('div.inviteinfo', [
                        h('div', _('To invite someone to play, give them this URL:')),
                        h('div', [
                            h('label', {attrs: {for: "invite-url-player1"}}, colorNames(variant.firstColor)),
                            h('input#invite-url-player1', {attrs: {readonly: true, spellcheck: false, value: model["home"] + gameURLPlayer1}}),
                            h('button#paste-url-player1', { class: { "paste-url": true }, on: { click: () => {
                                copyTextToClipboard(model["home"] + gameURLPlayer1);
                                patch(document.getElementById('paste-icon-player1') as HTMLElement,
                                    h('i#paste-icon-player1', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                            } } }, [
                                h('i#paste-icon-player1', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })])
                        ]),
                        h('div', [
                            h('label', {attrs: {for: "invite-url-player2"}}, colorNames(variant.secondColor)),
                            h('input#invite-url-player2', {attrs: {readonly: true, spellcheck: false, value: model["home"] + gameURLPlayer2}}),
                            h('button#paste-url-player2', { class: { "paste-url": true }, on: { click: () => {
                                copyTextToClipboard(model["home"] + gameURLPlayer2);
                                patch(document.getElementById('paste-icon-player2') as HTMLElement,
                                    h('i#paste-icon-player2', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                            } } }, [
                                h('i#paste-icon-player2', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })])
                        ]),
                        h('div', _('The first two people to come to this URL will play with each other.')),
                    ]) :
                    h('div.inviteinfo', [
                        h('div', _('To invite someone to play, give them this URL:')),
                        h('input#invite-url', {attrs: {readonly: true, spellcheck: false, value: model["home"] + gameURL}}),
                        h('button#paste-url', { class: { "paste-url": true }, on: { click: () => {
                            copyTextToClipboard(model["home"] + gameURL);
                            patch(document.getElementById('paste-icon') as HTMLElement,
                                h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-check": true} }));
                        } } }, [
                            h('i#paste-icon', {props: {title: _('Copy URL')}, class: {"icon": true, "icon-clipboard": true} })]),
                        h('div', _('The first person to come to this URL will play with you.')),
                    ]) ) :
                h('div'),
            // TODO Wait actually should have cancel button but the server doesn't support it at the moment
            model["inviter"] !== "wait" && model["inviter"] !== "occupied" && model["inviter"] !== "yourself" ?
                h('form', {props: {method: "post", action: formAction}, class: {invite: true}}, [
                    h('button', {class: buttonClass}, buttonText),
                ]) :
                h('div'),
        ]),
    ];
}
