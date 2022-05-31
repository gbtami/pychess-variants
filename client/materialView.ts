import { h, VNode } from 'snabbdom';

import { patch } from './document';
import { Variant } from './chess';
import { calculateGameImbalance } from './material';
import { RoundController } from './roundCtrl';

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

export function updateMaterial(ctrl: RoundController) {

    const topColor = ctrl.flipped() ? ctrl.mycolor : ctrl.oppcolor;
    const vmaterial0 = ctrl.vmaterial0;
    const vmaterial1 = ctrl.vmaterial1;
    const variant = ctrl.variant;
    const fen = ctrl.fullfen;

    if (!ctrl.materialDifference) {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(variant, 'top', [], true));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(variant, 'bottom', [], true));
        return;
    }

    const [whiteContent, blackContent] = generateContent(variant, fen);
    if (topColor === 'white') {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(variant, 'top', whiteContent));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(variant, 'bottom', blackContent));
    } else {
        ctrl.vmaterial0 = patch(vmaterial0, makeMaterialVNode(variant, 'top', blackContent));
        ctrl.vmaterial1 = patch(vmaterial1, makeMaterialVNode(variant, 'bottom', whiteContent));
    }
}
