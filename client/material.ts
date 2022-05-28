import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';
import { read } from 'chessgroundx/fen';
import { readPockets } from 'chessgroundx/pocket';

import { h, VNode } from 'snabbdom';

import RoundController from './roundCtrl';
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

function equivalentLetter(variant: Variant, letter: cg.PieceLetter): cg.PieceLetter {
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

function calculateGameImbalance(ctrl: RoundController): MaterialDiff {
    return diff(calculateMaterialDiff(ctrl.variant, ctrl.fullfen), ctrl.variant.initialMaterialImbalance);
}

function generateContent(ctrl: RoundController): [VNode[], VNode[]] {
    const imbalance = calculateGameImbalance(ctrl);
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

function makeMaterialVNode(ctrl: RoundController, position: 'top'|'bottom', content: VNode[], disabled = false): VNode {
    return h(`div.material.material-${position}.${ctrl.variant.piece}${disabled ? '.disabled' : ''}`, content);
}

export function updateMaterial(ctrl: RoundController, vmaterial0?: VNode | HTMLElement, vmaterial1?: VNode | HTMLElement) {
    if (!ctrl.variant.materialDiff) return;

    const topColor = ctrl.flip ? ctrl.mycolor : ctrl.oppcolor;

    if (!vmaterial0) vmaterial0 = ctrl.vmaterial0;
    if (!vmaterial1) vmaterial1 = ctrl.vmaterial1;

    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(ctrl, 'top', [], true));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(ctrl, 'bottom', [], true));
        return;
    }

    const [whiteContent, blackContent] = generateContent(ctrl);
    if (topColor === 'white') {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(ctrl, 'top', whiteContent));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(ctrl, 'bottom', blackContent));
    } else {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(ctrl, 'top', blackContent));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(ctrl, 'bottom', whiteContent));
    }
}
