import { h, VNode } from 'snabbdom';

import { getCounting, getJanggiPoints } from './chess';
import { patch } from './document';

// Counting for makruk, cambodian, sittuyin
export function updateCount(fen: string, whiteContainer: VNode | Element, blackContainer: VNode | Element) {
    const [countingPly, countingLimit, countingSide, ] = getCounting(fen);
    whiteContainer = patch(whiteContainer, h('div#misc-infow', ''));
    blackContainer = patch(blackContainer, h('div#misc-infob', ''));

    const countingStr = `${Math.floor((countingPly + 1)/2)}/${countingLimit/2 + (countingLimit/2)%2}`;

    if (countingLimit !== 0 && countingPly !== 0) {
        if (countingSide === 'w')
            whiteContainer = patch(whiteContainer, h('div#misc-infow', countingStr));
        else
            blackContainer = patch(blackContainer, h('div#misc-infob', countingStr));
    }

    return [whiteContainer, blackContainer];
}

// Material point for janggi
export function updatePoint(fen: string, choContainer: VNode | Element, hanContainer: VNode | Element) {
    const board = fen.split(" ")[0];
    const [choPoint, hanPoint] = getJanggiPoints(board);
    choContainer = patch(choContainer, h('div#misc-infow', { class: {'text-color-blue': true} }, choPoint));
    hanContainer = patch(hanContainer, h('div#misc-infob', { class: {'text-color-red': true} }, hanPoint));
    return [choContainer, hanContainer];
}
