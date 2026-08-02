import { h, VNode } from 'snabbdom';

// UI component rendered next to each of the 4 bughouse clocks, showing the
// time difference (in seconds) between this clock and the clock of the
// opponent's partner. A pure view function: the round seat view owns the
// retained vnode and patches it, the same way it does for its other leaves.
export function clockDifferenceView(id: string, value: number): VNode {
    return h('div#' + id, [
        h(
            'div.clock-difference',
            {
                class: {
                    negative: value < 0,
                    positive: value >= 0,
                },
            },
            // negatives carry their own sign; zero is shown bare, since it is neither ahead nor behind
            value > 0 ? `+${value}` : `${value}`,
        ),
    ]);
}
