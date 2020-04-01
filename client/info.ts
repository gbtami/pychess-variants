import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

function countString(fen) {
    const parts = fen.split(" ");
    const countingLimit = parseInt(parts[3]);
    if (isNaN(countingLimit) || countingLimit == 0) return "";
    const countingMove = parseInt(parts[4]);
    return `${Math.floor((countingMove+1)/2)}/${countingLimit/2}`;
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
    var container = document.getElementById('count') as HTMLElement;
    const count = countString(fen);
    if (count !== "") {
        patch(container, h('div#count', `Counting: ${count}`));
    } else {
        patch(container, h('div#count', ''));
    }
}

// Point count for janggi
export function updatePoint(fen) {
    var choContainer = document.getElementById('janggi-point-cho') as HTMLElement;
    var hanContainer = document.getElementById('janggi-point-han') as HTMLElement;
    const board = fen.split(" ")[0];
    const [choPoint, hanPoint] = getJanggiPoints(board)
    patch(choContainer, h('div#janggi-point-cho', choPoint));
    patch(hanContainer, h('div#janggi-point-han', hanPoint));
}
