import * as cg from 'chessgroundx/types';

import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import RoundController from "./roundCtrl";

function mapPiece(piece: string, variant: string): string {
    piece = piece.split('-')[0];
    if (variant === 'makruk' || variant === 'makpong' || variant === 'cambodian') {
        if (piece === '~m') return 'm';
        return piece;
    }
    if (variant === 'shinobi') {
        if (piece === '+l' || piece === 'pl') return 'r';
        if (piece === '+h' || piece === 'ph') return 'n';
        if (piece === '+m' || piece === 'pm') return 'b';
        if (piece === '+p' || piece === 'pp') return 'c';
        return piece;
    }
    return piece;
}

function calculateImbalance(ctrl: RoundController): {[index: string]:number} {
    var imbalances : {[index: string]:number} = {};
    var topMaterialColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottomMaterialColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
    for (var piece of ctrl.variant.pieceRoles('white')) imbalances[mapPiece(piece, ctrl.variant.name)] = 0;
    for (var piece of ctrl.variant.pieceRoles('black')) imbalances[mapPiece(piece, ctrl.variant.name)] = 0;
    for (var coord of Object.keys(ctrl.chessground.state.pieces)) {
        var pieceObject = ctrl.chessground.state.pieces[coord];
        var mappedPiece = mapPiece(pieceObject!.role, ctrl.variant.name);
        if (pieceObject!.color == 'white') {
            imbalances[mappedPiece]++;
        }
        else {
            imbalances[mappedPiece]--;
        }
    }
    if (ctrl.hasPockets) {
        for (var piece in ctrl.pockets[0]) {
            imbalances[mapPiece(piece, ctrl.variant.name)] += (topMaterialColor === 'white' ? 1 : -1) * ctrl.pockets[0][piece as cg.Role]!;
        }
        for (var piece in ctrl.pockets[1]) {
            imbalances[mapPiece(piece, ctrl.variant.name)] += (bottomMaterialColor === 'white' ? 1 : -1) * ctrl.pockets[1][piece as cg.Role]!;
        }
    }
    return imbalances;
}

function generateContent(ctrl: RoundController, imbalances: {[index: string]:number}, color: cg.Color): VNode[] {
    var result : VNode[] = [];
    for (var piece of ctrl.variant.pieceRoles(color)) {
        var mappedPiece = mapPiece(piece, ctrl.variant.name);
        var difference = imbalances[mappedPiece] * (color === 'white' ? 1 : -1);
        if (difference > 0) {
            imbalances[mappedPiece] = 0;
            var current_div : VNode[] = [];
            for (var i = 0; i < difference; ++i) {
                current_div.push(h('mpiece.' + mappedPiece))
            }
            result.push(h('div', current_div));
        }
    }
    return result;
}

function makeMaterialVNode(ctrl: RoundController, which: string, color: cg.Color, content: VNode[]): VNode {
    return h('div.material.material-' + which + '.' + color + '.' + ctrl.variant.piece, content);
}

export function updateMaterial (ctrl: RoundController, vmaterial0?: VNode | HTMLElement, vmaterial1?: VNode | HTMLElement) {
    if (ctrl.variant.drop) return;
    var topMaterialColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottomMaterialColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, makeMaterialVNode(ctrl, 'top', topMaterialColor, []));
        ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, []));
        return;
    }
    var imbalances = calculateImbalance(ctrl);
    var topMaterialContent = generateContent(ctrl, imbalances, topMaterialColor), bottomMaterialContent = generateContent(ctrl, imbalances, bottomMaterialColor);
    ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, makeMaterialVNode(ctrl, 'top', topMaterialColor, topMaterialContent));
    ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, bottomMaterialContent));
}
