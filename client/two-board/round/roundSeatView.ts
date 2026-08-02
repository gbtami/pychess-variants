import { h, VNode } from 'snabbdom';

import { patch } from '../../document';
import { Clock, Minutes, Seconds } from '../../clock';
import { clockDifferenceView } from './clockDifference';
import { player as playerBar } from '../../player';
import { BugBoardName } from '../../types';
import { TwoBoardPlayer } from '../common/seat';

// Everything the round page renders for one of its four seats: the clock, the
// clock-difference indicator, the player bar with its presence icon, and the
// inert berserk/misc-info slots around them.
//
// Keyed by screen slot — position 0 is the top of that board before any flip —
// and by nothing else, because that is all its markup depends on: which seat
// occupies a slot is a controller-level question, and flip/switch only move
// elements around, so a slot's identity never changes. That lets round.ts build
// all four views before a model, a viewer or a controller exists, the same way
// the analysis clocks are keyed by physical position rather than by color.
//
// The composed block vnode is built once in the constructor and returned by
// view(); round.ts embeds that very object, so the page's own top-level patch
// populates every leaf's .elm and no id lookup is ever needed. After that the
// block itself is never patched again — only leaves are — which is what keeps
// the inline style.gridArea values that flipBoards()/switchBoards() write on
// .info-wrap* from being wiped by a later render.
export class RoundSeatView {
    private readonly clockId: string;
    private readonly differenceId: string;
    private readonly presenceId: string;
    private readonly playerBarSel: string;

    private readonly block: VNode;
    private clockVnode: VNode;
    private differenceVnode: VNode | HTMLElement;
    private playerBarVnode: VNode | HTMLElement;

    // player bar state, retained so a presence change can re-render the bar
    // without the caller having to hand the player over again
    private player: TwoBoardPlayer | undefined;
    private level = 0;
    private online = false;

    constructor(position: 0 | 1, board: BugBoardName) {
        const slot = `${position}${board}`;
        const bug = board === 'b' ? '.bug' : '';

        this.clockId = `clock${slot}`;
        this.differenceId = `difference${slot}`;
        this.presenceId = `player${slot}`;
        // classes must follow the id in a snabbdom selector, or they end up part of the tag name
        this.playerBarSel = `round-player${position}#rplayer${slot}${bug}`;

        this.clockVnode = h(`div#${this.clockId}`);
        // the zero state the difference indicator starts in, rendered by the page's
        // own patch rather than by a follow-up render once the controller exists
        this.differenceVnode = clockDifferenceView(this.differenceId, 0);
        this.playerBarVnode = h(this.playerBarSel);

        this.block = h(`div.info-wrap${position}${bug}`, [
            h(`div.clock-wrap${bug}`, [
                h('div.clock-holder', [this.clockVnode, this.differenceVnode as VNode]),
                h(`div#berserk${slot}`),
            ]),
            this.playerBarVnode as VNode,
            h(`div#misc-info${slot}`),
        ]);
    }

    view(): VNode {
        return this.block;
    }

    // The ticking clock for whichever seat sits in this slot. Built here rather than
    // by the caller because the element it renders into is this view's; the caller
    // supplies the time control. Must be called after the page's initial patch —
    // Clock renders its starting time as it is constructed.
    createClock(base: Minutes, inc: Seconds): Clock {
        return new Clock(base, inc, 0, this.clockVnode, this.clockId, false);
    }

    renderDifference(value: number): void {
        this.differenceVnode = patch(this.differenceVnode, clockDifferenceView(this.differenceId, value));
    }

    renderPlayerBar(player: TwoBoardPlayer, level: number): void {
        this.player = player;
        this.level = level;
        this.renderPlayer();
    }

    setPresence(online: boolean): void {
        this.online = online;
        if (this.player !== undefined) this.renderPlayer();
    }

    // re-renders the bar under the retained root, whose selector never changes — so
    // the root element (and the layout classes on it) survives every render, and the
    // presence icon is diffed in place rather than replaced
    private renderPlayer(): void {
        const player = this.player!;
        this.playerBarVnode = patch(
            this.playerBarVnode,
            playerBar(
                this.presenceId,
                player.title,
                player.username,
                player.rating,
                this.level,
                this.online,
                this.playerBarSel,
            ),
        );
    }
}

// The round page's four seat views, indexed by board and then by screen position
// (0 = top of that board before any flip). Both the page view and the controller
// address a view by that pair, so the pair is the structure rather than something
// searched for.
export type RoundSeatViews = Record<BugBoardName, [RoundSeatView, RoundSeatView]>;
