import { init, h } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';


import { getCounting, getJanggiPoints } from './chess';

const patch = init([klass, attributes, properties, listeners]);

// Counting for makruk, cambodian, sittuyin
export function updateCount(fen: string, whiteContainer: VNode | Element, blackContainer: VNode | Element) {
    const [countingPly, countingLimit, countingSide, ] = getCounting(fen);
    whiteContainer = patch(whiteContainer, h('div#misc-infow', ''));
    blackContainer = patch(blackContainer, h('div#misc-infob', ''));

    if (countingLimit !== 0 && countingPly !== 0) {
        if (countingSide === 'w')
            whiteContainer = patch(whiteContainer, h('div#misc-infow', `${Math.floor((countingPly+1)/2)}/${countingLimit/2}`));
        else
            blackContainer = patch(blackContainer, h('div#misc-infob', `${Math.floor((countingPly+1)/2)}/${countingLimit/2}`));
    }

    return [whiteContainer, blackContainer];
}

// Point count for janggi
export function updatePoint(fen: string, choContainer: VNode | Element, hanContainer: VNode | Element) {
    const board = fen.split(" ")[0];
    const [choPoint, hanPoint] = getJanggiPoints(board);
    choContainer = patch(choContainer, h('div#misc-infow', { class: {'text-color-blue': true} }, choPoint));
    hanContainer = patch(hanContainer, h('div#misc-infob', { class: {'text-color-red': true} }, hanPoint));
    return [choContainer, hanContainer];
}
