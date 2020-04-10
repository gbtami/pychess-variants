import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

function getCounting(fen) {
    const parts = fen.split(" ");
    var countingLimit = parseInt(parts[3]);
    if (isNaN(countingLimit)) countingLimit = 0;
    var countingPly = parseInt(parts[4]);
    if (isNaN(countingPly)) countingPly = 0;
    return [countingPly, countingLimit];
}

function getJanggiPoints(board) {
    var choPoint = 0;
    var hanPoint = 1.5;
    for (const c of board) {
        switch (c) {
            case 'P': choPoint += 2; break;
            case 'A':
            case 'B': choPoint += 3; break;
            case 'N': choPoint += 5; break;
            case 'C': choPoint += 7; break;
            case 'R': choPoint += 13; break;
            case 'p': hanPoint += 2; break;
            case 'a':
            case 'b': hanPoint += 3; break;
            case 'n': hanPoint += 5; break;
            case 'c': hanPoint += 7; break;
            case 'r': hanPoint += 13; break;
        }
    }
    return [choPoint, hanPoint];
}

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
