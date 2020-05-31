import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import {getCounting, getJanggiPoints} from './chess';

const patch = init([klass, attributes, properties, listeners]);

// Counting for makruk, cambodian, sittuyin
export function updateCount(fen, whiteContainer, blackContainer) {
    const [countingPly, countingLimit, countingSide, ] = getCounting(fen);
    let pxc;
    if (countingLimit === 0 || countingPly === 0) {
        whiteContainer = patch(whiteContainer, h('div#count-white', ''));
        blackContainer = patch(blackContainer, h('div#count-black', ''));
        pxc = '0px';
    }
    else {
        if (countingSide === 'w') {
            whiteContainer = patch(whiteContainer, h('div#count-white', `${Math.floor((countingPly+1)/2)}/${countingLimit/2}`));
            blackContainer = patch(blackContainer, h('div#count-black', ''));
        }
        else {
            whiteContainer = patch(whiteContainer, h('div#count-white', ''));
            blackContainer = patch(blackContainer, h('div#count-black', `${Math.floor((countingPly+1)/2)}/${countingLimit/2}`));
        }
        pxc = '48px';
    }
    const curStyle = document.body.getAttribute('style') as String;
    const startIdx = curStyle.indexOf('countingHeight') + 15;
    const endIdx = startIdx + curStyle.substring(startIdx).indexOf(';');
    document.body.setAttribute('style', curStyle.substring(0, startIdx) + pxc + curStyle.substring(endIdx));
    return [whiteContainer, blackContainer];
}

// Point count for janggi
export function updatePoint(fen, choContainer, hanContainer) {
    const board = fen.split(" ")[0];
    const [choPoint, hanPoint] = getJanggiPoints(board)
    choContainer = patch(choContainer, h('div#janggi-point-cho', choPoint));
    hanContainer = patch(hanContainer, h('div#janggi-point-han', hanPoint));
    return [choContainer, hanContainer];
}
