import * as cg from 'chessgroundx/types';

import { h, VNode } from 'snabbdom';

import { patch } from './document';
import { calculateImbalance, MaterialImbalance, mapPiece} from './material';
import { RoundController } from './roundCtrl';

function generateContent(ctrl: RoundController, imbalances: MaterialImbalance, color: cg.Color): VNode[] {
    let result : VNode[] = [];
    let order : string[] = ctrl.variant.pieceRoles(color === 'white' ? 'black' : 'white').concat(ctrl.variant.pieceRoles(color));
    if (ctrl.variant.promotion === 'shogi') {
        for (let piece of ctrl.variant.promoteablePieces) {
            order.push(mapPiece('p' + piece, ctrl.variant.name));
        }
    }
    for (let piece of order) {
        let mappedPiece = mapPiece(piece, ctrl.variant.name);
        let difference = imbalances[mappedPiece] * (color === 'white' ? 1 : -1);
        if (difference > 0) {
            imbalances[mappedPiece] = 0;
            let current_div : VNode[] = [];
            for (let i = 0; i < difference; ++i) {
                current_div.push(h('mpiece.' + mappedPiece))
            }
            result.push(h('div', current_div));
        }
    }
    return result;
}

function makeMaterialVNode(ctrl: RoundController, which: string, color: cg.Color, content: VNode[], disabled = false): VNode {
    return h('div.material.material-' + which + '.' + color + '.' + ctrl.variant.piece + (disabled ? '.disabled' : ''), content);
}

export function updateMaterial (ctrl: RoundController) {
    if (!ctrl.variant.materialDifference) return;
    let topMaterialColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottomMaterialColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(ctrl.vmaterial0!, makeMaterialVNode(ctrl, 'top', topMaterialColor, [], true));
        ctrl.vmaterial1 = patch(ctrl.vmaterial1!, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, [], true));
        return;
    }
    let imbalances = calculateImbalance(ctrl);
    let topMaterialContent = generateContent(ctrl, imbalances, topMaterialColor), bottomMaterialContent = generateContent(ctrl, imbalances, bottomMaterialColor);
    ctrl.vmaterial0 = patch(ctrl.vmaterial0!, makeMaterialVNode(ctrl, 'top', topMaterialColor, topMaterialContent));
    ctrl.vmaterial1 = patch(ctrl.vmaterial1!, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, bottomMaterialContent));
}
