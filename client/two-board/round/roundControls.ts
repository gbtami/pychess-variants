import { h, VNode } from 'snabbdom';

import { _ } from '../../i18n';
import { patch } from '../../document';
import { ChatController, chatView } from '../../chat';

// Owns the round page's dialog (#offer-dialog) and game-controls (#game-controls)
// retained vnodes, plus the other ad-hoc DOM rendering `roundCtrl.ts` previously
// did inline. RoundControllerBughouse holds one instance instead of raw VNode
// fields, and calls its methods instead of document.*/patch()/h() directly.
export class RoundControlsView {
    private vdialog: VNode | HTMLElement;
    private gameControls: VNode | HTMLElement;

    constructor() {
        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ''));
        this.gameControls = document.getElementById('game-controls') as HTMLElement;
    }

    renderInitialGameControls(spectator: boolean, onDraw: () => void, onResign: () => void): void {
        const container = document.getElementById('game-controls') as HTMLElement;
        if (!spectator) {
            const buttons = [
                h('button#count', _('Count')),
                h('button#draw', { on: { click: onDraw }, props: { title: _('Draw') } }, [h('i', '½')]),
                h('button#resign', { on: { click: onResign }, props: { title: _('Resign') } }, [
                    h('i', { class: { icon: true, 'icon-flag-o': true } }),
                ]),
            ];
            this.gameControls = patch(container, h('div.btn-controls', buttons));
            patch(document.getElementById('count') as HTMLElement, h('div'));
        } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        }
    }

    renderGameOverControls(
        spectator: boolean,
        onRematch: () => void,
        onNewOpponent: () => void,
        onAnalysis: () => void,
    ): void {
        this.gameControls = patch(this.gameControls, h('div'));
        const buttons: VNode[] = [];
        if (!spectator) {
            buttons.push(h('button.rematch', { on: { click: onRematch } }, _('REMATCH')));
            buttons.push(h('button.newopp', { on: { click: onNewOpponent } }, _('NEW OPPONENT')));
        }
        buttons.push(h('button.analysis', { on: { click: onAnalysis } }, _('ANALYSIS BOARD')));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    }

    renderDrawOffer(onReject: () => void, onAccept: () => void): void {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h('div', { class: { reject: true }, on: { click: onReject } }, h('i.icon.icon-abort.reject')),
                    h('div.text', _('Your opponent offers a draw')),
                    h('div', { class: { accept: true }, on: { click: onAccept } }, h('i.icon.icon-check')),
                ]),
            ]),
        );
    }

    renderRematchOffer(onReject: () => void, onAccept: () => void): void {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h('div', { class: { reject: true }, on: { click: onReject } }, h('i.icon.icon-abort.reject')),
                    h('div.text', _('Your opponent offers a rematch')),
                    h('div', { class: { accept: true }, on: { click: onAccept } }, h('i.icon.icon-check')),
                ]),
            ]),
        );
    }

    setDialogMessage(message: string): void {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h('div', { class: { reject: false } }),
                    h('div.text', message),
                    h('div', { class: { accept: false } }),
                ]),
            ]),
        );
    }

    clearDialog(): void {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
    }
}

export function renderRoundChat(ctrl: ChatController): void {
    patch(document.getElementById('bugroundchat') as HTMLElement, chatView(ctrl, 'bugroundchat'));
}

export function resetMovelistDom(): void {
    const container = document.getElementById('movelist') as HTMLElement;
    patch(container, h('div#movelist'));
}

// clears the gating/promotion widget left over the ground when the game ends by timeout
export function clearExtensionChoice(): void {
    const container = document.getElementById('extension_choice') as HTMLElement;
    if (container instanceof Element) patch(container, h('extension'));
}

export function clearAbortIndicator(): void {
    const container = document.getElementById('abort') as HTMLElement;
    if (container) patch(container, h('div'));
}

export function insertRematchButton(onViewRematch: () => void): void {
    const btnsAfter = document.querySelector('.btn-controls.after') as HTMLElement;
    const rematchButton = h('button.newopp', { on: { click: onViewRematch } }, _('VIEW REMATCH'));
    const rematchButtonLocation = btnsAfter!.insertBefore(document.createElement('div'), btnsAfter!.firstChild);
    patch(rematchButtonLocation, rematchButton);
}

export function showOnlineIcon(): void {
    patch(
        document.getElementById('player1a') as HTMLElement,
        h('i-side.online#player1a', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
    );
}

// player-bar/info-wrap grid-area swaps for flipBoards()/switchBoards() — the round
// page's clock/player bars sit in separate DOM regions from the boards themselves,
// so the base class's board-level flip/switch is complemented by this layout swap
export function swapClockGridAreasForFlip(): void {
    const infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
    const infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
    const infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
    const infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

    let a = infoWrap0!.style.gridArea || 'clock-top';
    infoWrap0!.style.gridArea = infoWrap1!.style.gridArea || 'clock-bot';
    infoWrap1!.style.gridArea = a;
    a = infoWrap0bug!.style.gridArea || 'clockB-top';
    infoWrap0bug!.style.gridArea = infoWrap1bug!.style.gridArea || 'clockB-bot';
    infoWrap1bug!.style.gridArea = a;
}

export function swapClockGridAreasForSwitch(): void {
    const infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
    const infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
    const infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
    const infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

    let a = infoWrap0!.style.gridArea || 'clock-top';
    infoWrap0!.style.gridArea = infoWrap0bug!.style.gridArea || 'clockB-top';
    infoWrap0bug!.style.gridArea = a;
    a = infoWrap1!.style.gridArea || 'clock-bot';
    infoWrap1!.style.gridArea = infoWrap1bug!.style.gridArea || 'clockB-bot';
    infoWrap1bug!.style.gridArea = a;
}
