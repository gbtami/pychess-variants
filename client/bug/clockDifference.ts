import { h, VNode } from 'snabbdom';

import { patch } from '../document';

// UI component rendered next to each of the 4 bughouse clocks, showing the
// time difference (in seconds) between this clock and the clock of the
// opponent's partner.
export class ClockDifference {
    el: HTMLElement | VNode;
    id: string;

    constructor(el: HTMLElement | VNode, id: string, value = 0) {
        this.el = el;
        this.id = id;
        this.renderDifference(value);
    }

    view(value: number): VNode {
        return h('div#' + this.id, [
            h('div.clock-difference', {
                class: {
                    negative: value < 0,
                    positive: value >= 0,
                },
            }, `${value}`),
        ]);
    }

    renderDifference(value: number) {
        this.el = patch(this.el, this.view(value));
    }
}
