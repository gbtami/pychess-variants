import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';
import { readPockets } from 'chessgroundx/pocket';

import { Variant } from './chess';
import { patch } from './document';

export type MaterialDiff = Map<cg.PieceLetter, number>;

export function diff(lhs: MaterialDiff, rhs: MaterialDiff): MaterialDiff {
    const keys = new Set([...lhs.keys(), ...rhs.keys()]);
    const res = new Map()
    for (const piece of keys)
        res.set(piece, (lhs.get(piece) ?? 0) - (rhs.get(piece) ?? 0));
    return res;
}

export function equivalentLetter(variant: Variant, letter: cg.PieceLetter): cg.PieceLetter {
    if (variant.drop) {
        if (letter.startsWith('+'))
            return letter.slice(1) as cg.PieceLetter;
        else
            return letter;
    } else {
        // This is the exception to the "no checking variant name directly" rule
        //         since these info is highly variant-specific
        switch (variant.name) {
            case 'makruk':
                case 'makpong':
                case 'cambodian':
                if (letter === ('m~' as cg.PieceLetter))
            return 'm';
            else
                return letter;

            case 'shinobi':
                switch (letter) {
                case '+l': return 'r';
                case '+h': return 'n';
                case '+m': return 'b';
                case '+p': return 'c';
                default  : return letter;
            }

            case 'chak':
                if (letter === '+k')
            return 'k';
            else
                return letter;

            default:
                return letter;
        }
    }
}

export function calculateMaterialDiff(variant: Variant, fen?: string): MaterialDiff {
    if (!fen) fen = variant.startFen;
    const materialDiff : MaterialDiff = new Map();

    for (const [_, piece] of read(fen)) {
        const letter = equivalentLetter(variant, util.letterOf(piece.role));
        const num = materialDiff.get(letter) ?? 0;
        materialDiff.set(letter, (piece.color === 'white') ? num - 1 : num + 1);
    }

    // TODO Make chessgroundx include pockets in fen read
    if (variant.pocket) {
        let initialPockets = readPockets(fen, variant.pocketRoles.bind(variant));
        for (const [role, count] of Object.entries(initialPockets.white ?? {})) {
            const letter = equivalentLetter(variant, util.letterOf(role as cg.Role));
            const num = materialDiff.get(letter) ?? 0;
            materialDiff.set(letter, num - count);
        }
        for (const [role, count] of Object.entries(initialPockets.black ?? {})) {
            const letter = equivalentLetter(variant, util.letterOf(role as cg.Role));
            const num = materialDiff.get(letter) ?? 0;
            materialDiff.set(letter, num + count);
        }
    }
    return materialDiff;
}

export function calculatePieceNumber(variant: Variant, fen?: string): MaterialDiff {
    if (!fen) fen = variant.startFen;
    // Calculate material difference as if all pieces were black
    return calculateMaterialDiff(variant, fen.toLowerCase());
}

export function calculateGameImbalance(variant: Variant, fen: string): MaterialDiff {
    return diff(calculateMaterialDiff(variant, fen), variant.initialMaterialImbalance);
}

function generateContent(variant: Variant, fen: string): [VNode[], VNode[]] {
    const imbalance = calculateGameImbalance(variant, fen);
    const whiteContent: VNode[] = [];
    const blackContent: VNode[] = [];

    for (const [letter, num] of imbalance) {
        if (num === 0) continue;
        const content = num > 0 ? blackContent : whiteContent;
        const pieceDiff = Math.abs(num);
        const currentDiv: VNode[] = [];
        for (let i = 0; i < pieceDiff; i++)
        currentDiv.push(h('mpiece.' + letter));
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
