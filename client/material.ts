import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';
import { readPockets } from 'chessgroundx/pocket';

import { h, VNode } from 'snabbdom';

import RoundController from './roundCtrl';
import { Variant } from './chess';
import { patch } from './document';

export type MaterialImbalance = {[index: string]:number};

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
    if (variant == 'chak') {
        if (piece === '+k' || piece === 'pk') return 'k';
        return piece;
    }
    return piece;
}

export function calculateInitialImbalance(variant: Variant): MaterialImbalance {
    let imbalances : MaterialImbalance = {};
    for (let piece of variant.pieceRoles('white')) imbalances[mapPiece(piece, variant.name)] = 0;
    for (let piece of variant.pieceRoles('black')) imbalances[mapPiece(piece, variant.name)] = 0;
    if (variant.promotion === 'shogi') {
        for (let piece of variant.promoteablePieces) {
            imbalances[mapPiece('p' + piece, variant.name)] = 0;
        }
    }
    for (let [_, piece] of read(variant.startFen)) {
        imbalances[mapPiece(piece.role, variant.name)] += (piece.color === 'white') ? -1 : 1;
    }
    if (variant.pocket) {
        let initialPockets = readPockets(variant.startFen, variant.pocketRoles.bind(variant));
        for (let [piece, count] of Object.entries(initialPockets.white!)) {
            imbalances[mapPiece(piece, variant.name)] -= count;
        }
        for (let [piece, count] of Object.entries(initialPockets.black!)) {
            imbalances[mapPiece(piece, variant.name)] += count;
        }
    }
    return imbalances;
}

function calculateImbalance(ctrl: RoundController): MaterialImbalance {
    let imbalances = Object.assign({}, ctrl.variant.initialMaterialImbalance);
    let topMaterialColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottomMaterialColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
    for (let piece of ctrl.chessground.state.pieces) {
        let pieceObject = piece[1];
        let mappedPiece = mapPiece(pieceObject!.role, ctrl.variant.name);
        if (pieceObject!.color == 'white') {
            imbalances[mappedPiece]++;
        }
        else {
            imbalances[mappedPiece]--;
        }
    }
    if (ctrl.chessground.state.pockets) {
        const pocketTop = ctrl.chessground.state.pockets[util.opposite(ctrl.chessground.state.orientation)];
        const pocketBottom = ctrl.chessground.state.pockets[ctrl.chessground.state.orientation];
        for (let piece in pocketTop) {
            imbalances[mapPiece(piece, ctrl.variant.name)] += (topMaterialColor === 'white' ? 1 : -1) * pocketTop[piece as cg.Role]!;
        }
        for (let piece in pocketBottom) {
            imbalances[mapPiece(piece, ctrl.variant.name)] += (bottomMaterialColor === 'white' ? 1 : -1) * pocketBottom[piece as cg.Role]!;
        }
    }
    return imbalances;
}

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

export function updateMaterial (ctrl: RoundController, vmaterial0?: VNode | HTMLElement, vmaterial1?: VNode | HTMLElement) {
    if (!ctrl.variant.materialDifference) return;
    let topMaterialColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor, bottomMaterialColor = ctrl.flip ? ctrl.oppcolor : ctrl.mycolor;
    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, makeMaterialVNode(ctrl, 'top', topMaterialColor, [], true));
        ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, [], true));
        return;
    }
    let imbalances = calculateImbalance(ctrl);
    let topMaterialContent = generateContent(ctrl, imbalances, topMaterialColor), bottomMaterialContent = generateContent(ctrl, imbalances, bottomMaterialColor);
    ctrl.vmaterial0 = patch(vmaterial0? vmaterial0 : ctrl.vmaterial0, makeMaterialVNode(ctrl, 'top', topMaterialColor, topMaterialContent));
    ctrl.vmaterial1 = patch(vmaterial1? vmaterial1 : ctrl.vmaterial1, makeMaterialVNode(ctrl, 'bottom', bottomMaterialColor, bottomMaterialContent));
}
