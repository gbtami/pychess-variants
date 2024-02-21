import * as cg from 'chessgroundx/types';

import { ChessgroundController } from './cgCtrl';


function wrapRow(ctrl: ChessgroundController, color: cg.Color, pocket: HTMLElement) {
    if (ctrl.variant.pocket) {
        const width = ctrl.variant.board.dimensions.width;
        const roles: (cg.Role | '')[] = [...ctrl.variant.pocket.roles[color]];
        const shrink = roles.length > 8 ? 2 : 0;

        pocket.style.setProperty('--piecerows', String(Math.ceil(roles.length / width)));
        pocket.style.setProperty('--pocketLength', String(Math.min(roles.length, width - shrink)));
    }
}

export function initPocketRow(ctrl: ChessgroundController, pocket0: HTMLElement, pocket1: HTMLElement): void {
    wrapRow(ctrl, ctrl.flipped() ? ctrl.mycolor : ctrl.oppcolor, pocket0);
    wrapRow(ctrl, ctrl.flipped() ? ctrl.oppcolor : ctrl.mycolor, pocket1);
}
