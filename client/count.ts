//import { h } from "snabbdom"
import { h, init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

function countString(fen) {
    const parts = fen.split(" ");
    if (parts[3] === "-") return "";
    const countingLimit = parseInt(parts[3]);
    const countingMove = parseInt(parts[4]);
    return `${Math.floor((countingMove+1)/2)}/${countingLimit/2}`;
}

export function updateCount(fen) {
    var container = document.getElementById('count') as HTMLElement;
    console.log(container);
    var count = countString(fen);
    if (count !== "") {
        patch(container, h('div#count', `Counting: ${count}`));
    } else {
        patch(container, h('div#count', ''));
    }
}
