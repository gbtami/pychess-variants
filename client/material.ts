import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { read as fenRead } from 'chessgroundx/fen';

import { patch } from './document';
import { Variant } from './variants';

export type MaterialDiff = Map<cg.Role, number>;
export type Equivalence = Partial<Record<cg.Role, cg.Role>>;

export function diff(lhs: MaterialDiff, rhs: MaterialDiff): MaterialDiff {
    const keys = new Set([...lhs.keys(), ...rhs.keys()]);
    const res = new Map()
    for (const role of keys)
        res.set(role, (lhs.get(role) ?? 0) - (rhs.get(role) ?? 0));
    return res;
}

export function equivalentRole(role: cg.Role, equivalences: Equivalence, captureToHand: boolean): cg.Role {
    if (captureToHand) {
        if (role.indexOf('-') > 1)
            return role.slice(1) as cg.Role;
        else
            return role;
    } else {
        if (role in equivalences)
            return equivalences[role]!;
        else
            return role;
    }
}

export function calculateDiff(fen: string, dimensions: cg.BoardDimensions, equivalences: Equivalence, captureToHand: boolean): MaterialDiff {
    const materialDiff : MaterialDiff = new Map();
    const boardState = fenRead(fen, dimensions);

    for (const [_, piece] of boardState.pieces) {
        const role = equivalentRole(piece.role, equivalences, captureToHand);
        const num = materialDiff.get(role) ?? 0;
        if (piece.role !== '_-piece') //Exclude duck/any other type of brick
            materialDiff.set(role, (piece.color === 'white') ? num - 1 : num + 1);
    }

    if (boardState.pockets) {
        for (const [r, c] of boardState.pockets.white.entries()) {
            const role = equivalentRole(r, equivalences, captureToHand);
            const num = materialDiff.get(role) ?? 0;
            materialDiff.set(role, num - c);
        }
        for (const [r, c] of boardState.pockets.black.entries()) {
            const role = equivalentRole(r, equivalences, captureToHand);
            const num = materialDiff.get(role) ?? 0;
            materialDiff.set(role, num + c);
        }
    }
    return materialDiff;
}

export function calculateMaterialDiff(variant: Variant, fen?: string): MaterialDiff {
    return calculateDiff(fen ?? variant.startFen, variant.board.dimensions, variant.material.equivalences, !!variant.pocket?.captureToHand);
}

export function calculatePieceNumber(variant: Variant, fen?: string): MaterialDiff {
    if (!fen) fen = variant.startFen;
    // Calculate material difference as if all pieces were black
    // This results in counting the number of pieces on the board
    return calculateMaterialDiff(variant, fen.toLowerCase());
}

export function calculateGameDiff(variant: Variant, fen: string): MaterialDiff {
    return diff(calculateMaterialDiff(variant, fen), variant.material.initialDiff);
}

function mergeOrders(order1: cg.Role[], order2: cg.Role[]): cg.Role[] {
    let result: cg.Role[] = [];
    let seen = new Set<cg.Role>();
    for (const piece of order1) {
        if (!seen.has(piece)) {
            result.push(piece);
            seen.add(piece);
        }
    }
    for (const piece of order2) {
        if (!seen.has(piece)) {
            result.push(piece);
            seen.add(piece);
        }
    }
    return result;
}

function generateContent(variant: Variant, fen: string): [VNode[], VNode[]] {
    const imbalance = calculateGameDiff(variant, fen);
    const whiteContent: VNode[] = [];
    const blackContent: VNode[] = [];
    const whiteCapturedOrder: cg.Role[] = mergeOrders(variant.pieceRow['black'], variant.pieceRow['white']);
    const blackCapturedOrder: cg.Role[] = mergeOrders(variant.pieceRow['white'], variant.pieceRow['black']);
    
    for (const role of whiteCapturedOrder) {
        const num = imbalance.get(role);
        if (num === undefined) continue;
        if (num < 0) {
            const pieceDiff = Math.abs(num);
            const currentDiv: VNode[] = [];
            for (let i = 0; i < pieceDiff; i++)
            currentDiv.push(h('mpiece.' + role));
            whiteContent.push(h('div', currentDiv));
        }
    }
    for (const role of blackCapturedOrder) {
        const num = imbalance.get(role);
        if (num === undefined) continue;
        if (num > 0) {
            const pieceDiff = Math.abs(num);
            const currentDiv: VNode[] = [];
            for (let i = 0; i < pieceDiff; i++)
            currentDiv.push(h('mpiece.' + role));
            blackContent.push(h('div', currentDiv));
        }
    }
    return [whiteContent, blackContent];
}

function makeMaterialVNode(variant: Variant, position: 'top'|'bottom', content: VNode[], disabled = false): VNode {
    return h(`div.material.material-${position}.${variant.pieceFamily}${disabled ? '.disabled' : ''}`, content);
}

export function updateMaterial(variant: Variant, fen: string, vmaterialTop: VNode | HTMLElement, vmaterialBottom: VNode | HTMLElement, flip: boolean, color: string): [VNode, VNode] {
    const [whiteContent, blackContent] = generateContent(variant, fen);
    const topContent = (color === 'white') ? blackContent : whiteContent;
    const botomContent = (color === 'white') ? whiteContent : blackContent;
    return [
        patch(vmaterialTop, makeMaterialVNode(variant, 'top', flip ? botomContent : topContent)),
        patch(vmaterialBottom, makeMaterialVNode(variant, 'bottom', flip ? topContent : botomContent)),
    ];
}

export function emptyMaterial(variant: Variant, vmaterialTop: VNode | HTMLElement, vmaterialBottom: VNode | HTMLElement): [VNode, VNode] {
    return [
        patch(vmaterialTop, makeMaterialVNode(variant, 'top', [], true)),
        patch(vmaterialBottom, makeMaterialVNode(variant, 'bottom', [], true)),
    ];
}
