import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import { read } from 'chessgroundx/fen';
import { readPockets } from 'chessgroundx/pocket';

import { Variant } from './chess';
import { patch } from './document';

export type MaterialDiff = Map<cg.Role, number>;

export function diff(lhs: MaterialDiff, rhs: MaterialDiff): MaterialDiff {
    const keys = new Set([...lhs.keys(), ...rhs.keys()]);
    const res = new Map()
    for (const role of keys)
        res.set(role, (lhs.get(role) ?? 0) - (rhs.get(role) ?? 0));
    return res;
}

export function equivalentRole(variant: Variant, role: cg.Role): cg.Role {
    if (variant.drop) {
        if (role.indexOf('-') > 1)
            return role.slice(1) as cg.Role;
        else
            return role;
    } else {
        // This is the exception to the "no checking variant name directly" rule
        //         since these info is highly variant-specific
        switch (variant.name) {
            case 'shinobi':
                switch (role) {
                    case 'pl-piece': return 'r-piece';
                    case 'ph-piece': return 'n-piece';
                    case 'pm-piece': return 'b-piece';
                    case 'pp-piece': return 'c-piece';
                    default  : return role;
                }

            case 'chak':
                if (role === 'pk-piece')
                    return 'k-piece';
                else
                    return role;

            default:
                return role;
        }
    }
}

export function calculateMaterialDiff(variant: Variant, fen?: string): MaterialDiff {
    if (!fen) fen = variant.startFen;
    const materialDiff : MaterialDiff = new Map();

    for (const [_, piece] of read(fen)) {
        const letter = equivalentRole(variant, piece.role);
        const num = materialDiff.get(letter) ?? 0;
        materialDiff.set(letter, (piece.color === 'white') ? num - 1 : num + 1);
    }

    // TODO Make chessgroundx include pockets in fen read
    if (variant.pocket) {
        const initialPockets = readPockets(fen, variant.pocketRoles.bind(variant));
        for (const [role, count] of Object.entries(initialPockets.white ?? {})) {
            const letter = equivalentRole(variant, role as cg.Role);
            const num = materialDiff.get(letter) ?? 0;
            materialDiff.set(letter, num - count);
        }
        for (const [role, count] of Object.entries(initialPockets.black ?? {})) {
            const letter = equivalentRole(variant, role as cg.Role);
            const num = materialDiff.get(letter) ?? 0;
            materialDiff.set(letter, num + count);
        }
    }
    return materialDiff;
}

export function calculatePieceNumber(variant: Variant, fen?: string): MaterialDiff {
    if (!fen) fen = variant.startFen;
    // Calculate material difference as if all pieces were black
    // This results in counting the number of pieces on the board
    return calculateMaterialDiff(variant, fen.toLowerCase());
}

export function calculateGameImbalance(variant: Variant, fen: string): MaterialDiff {
    return diff(calculateMaterialDiff(variant, fen), variant.initialMaterialImbalance);
}

function generateContent(variant: Variant, fen: string): [VNode[], VNode[]] {
    const imbalance = calculateGameImbalance(variant, fen);
    const whiteContent: VNode[] = [];
    const blackContent: VNode[] = [];

    for (const [role, num] of imbalance) {
        if (num === 0) continue;
        const content = num > 0 ? blackContent : whiteContent;
        const pieceDiff = Math.abs(num);
        const currentDiv: VNode[] = [];
        for (let i = 0; i < pieceDiff; i++)
        currentDiv.push(h('mpiece.' + role));
        content.push(h('div', currentDiv));
    }
    return [whiteContent, blackContent];
}

function makeMaterialVNode(variant: Variant, position: 'top'|'bottom', content: VNode[], disabled = false): VNode {
    return h(`div.material.material-${position}.${variant.piece}${disabled ? '.disabled' : ''}`, content);
}

export function updateMaterial(variant: Variant, fen: string, vmaterialTop: VNode | HTMLElement, vmaterialBottom: VNode | HTMLElement, flip: boolean): [VNode, VNode] {
    const [whiteContent, blackContent] = generateContent(variant, fen);
    return [
        patch(vmaterialTop, makeMaterialVNode(variant, 'top', flip ? whiteContent : blackContent)),
        patch(vmaterialBottom, makeMaterialVNode(variant, 'bottom', flip ? blackContent : whiteContent)),
    ];
}

export function emptyMaterial(variant: Variant): [VNode, VNode] {
    return [
        makeMaterialVNode(variant, 'top', [], true),
        makeMaterialVNode(variant, 'bottom', [], true),
    ];
}
