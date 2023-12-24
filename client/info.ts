import { h, VNode } from 'snabbdom';

import { getAtaxxPoints, getCounting, getJanggiPoints } from './chess';
import { patch } from './document';
import { Variant } from './variants';

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

// Material point for ataxx/janggi
export function updatePoint(variant: Variant, fen: string, wContainer: VNode | Element, bContainer: VNode | Element) {
    const board = fen.split(" ")[0];
    const [wPoint, bPoint] = variant.ui.materialPoint === 'janggi' ? getJanggiPoints(board) : getAtaxxPoints(board);
    const wcolor = variant.colors.first;
    const bcolor = variant.colors.second;
    wContainer = patch(wContainer, h('div#misc-infow', { class: {'text-color-red': wcolor === 'Red', 'text-color-blue': wcolor === 'Blue'} }, wPoint));
    bContainer = patch(bContainer, h('div#misc-infob', { class: {'text-color-red': bcolor === 'Red', 'text-color-blue': bcolor === 'Blue'} }, bPoint));
    return [wContainer, bContainer];
}
