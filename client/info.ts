import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import {getCounting, getJanggiPoints} from './chess';

const patch = init([klass, attributes, properties, listeners]);

// Counting for makruk, cambodian, sittuyin
export function updateCount(fen) {
    const [countingPly, countingLimit] = getCounting(fen);
    var container = document.getElementById('count') as HTMLElement;
    if (countingLimit > 0) {
        patch(container, h('div#count', `Counting: ${Math.floor((countingPly+1)/2)}/${countingLimit/2}`));
    } else {
        patch(container, h('div#count', ''));
    }
}

// Point count for janggi
export function updatePoint(fen, choContainer, hanContainer) {
    const board = fen.split(" ")[0];
    const [choPoint, hanPoint] = getJanggiPoints(board)
    console.log([choPoint, hanPoint]);
    choContainer = patch(choContainer, h('div#janggi-point-cho', choPoint));
    hanContainer = patch(hanContainer, h('div#janggi-point-han', hanPoint));
    return [choContainer, hanContainer];
}
