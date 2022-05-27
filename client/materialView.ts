import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { h, VNode } from 'snabbdom';

import { patch } from './document';
import { calculateGameImbalance, equivalentLetter, MaterialDiff } from './material';
import { RoundController } from './roundCtrl';

function generateContent(ctrl: RoundController, imbalance: MaterialDiff, color: cg.Color): VNode[] {
    const result : VNode[] = [];

    const keys = [...ctrl.variant.pieceRoles(util.opposite(color))]
    for (const piece of ctrl.variant.pieceRoles(color)) {
        const p = equivalentLetter(ctrl.variant, piece);
        if (!keys.includes(p))
            keys.push(p);
    }
    if (ctrl.variant.promotion === 'shogi') {
        for (const piece of ctrl.variant.promoteablePieces) {
            const p = equivalentLetter(ctrl.variant, piece);
            if (!keys.includes(p))
                keys.push(p);
        }
    }

    for (const letter of keys) {
        const p = equivalentLetter(ctrl.variant, letter);
        const pieceDiff = (imbalance.get(p) ?? 0) * (color === 'white' ? -1 : 1);
        if (pieceDiff > 0) {
            const current_div : VNode[] = [];
            for (let i = 0; i < pieceDiff; i++)
                current_div.push(h('mpiece.' + p))
            result.push(h('div', current_div));
        }
    }
    return result;
}

function makeMaterialVNode(ctrl: RoundController, position: 'top'|'bottom', color: cg.Color, content: VNode[], disabled = false): VNode {
    return h(`div.material.material-${position}.${color}.${ctrl.variant.piece}${disabled ? '.disabled' : ''}`, content);
}

export function updateMaterial(ctrl: RoundController, vmaterial0?: VNode | HTMLElement, vmaterial1?: VNode | HTMLElement) {
    if (!ctrl.variant.materialDiff) return;

    const topColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor;
    const bottomColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;

    if (!vmaterial0) vmaterial0 = ctrl.vmaterial0;
    if (!vmaterial1) vmaterial1 = ctrl.vmaterial1;

    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(ctrl, 'top', topColor, [], true));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomColor, [], true));
        return;
    }
    const imbalance = calculateGameImbalance(ctrl);
    const topContent = generateContent(ctrl, imbalance, topColor);
    const bottomContent = generateContent(ctrl, imbalance, bottomColor);
    ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(ctrl, 'top', topColor, topContent));
    ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomColor, bottomContent));
}
