import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';
import { readPockets } from 'chessgroundx/pocket';

import { ChessgroundController } from './cgCtrl';
import { Variant } from './chess';

export type MaterialImbalance = {[index: string]:number};

export function mapPiece(piece: string, variant: string): string {
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

export function calculateImbalance(ctrl: ChessgroundController): MaterialImbalance {
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
