import { h, VNode } from 'snabbdom';

import * as cg from 'chessgroundx/types';

import { patch } from '../../document';
import AnalysisController from './analysisCtrl';
import { GameControllerBughouse } from '../common/gameCtrl';
import { clockTimeAt } from '../common/players';
import { Clocks } from '../../messages';
import { BugBoardName } from '../../types';
import { BLACK, WHITE } from '../../chess';

// The four analysis clocks are keyed by physical screen position (not color),
// since which physical element shows "white" vs "black" depends on current
// board orientation and flips on flip/switch. Built ctrl-free so analysis.ts
// can embed the placeholders directly; render() patches the one matching
// slot in place.
export type ClockSlot = 'top' | 'bottom' | 'top.bug' | 'bottom.bug';

const SLOT_SELECTOR: Record<ClockSlot, string> = {
    top: 'div#anal-clock-top.anal-clock.top',
    bottom: 'div#anal-clock-bottom.anal-clock.bottom',
    'top.bug': 'div#anal-clock-top-bug.anal-clock.top.bug',
    'bottom.bug': 'div#anal-clock-bottom-bug.anal-clock.bottom.bug',
};

export class AnalysisClockView {
    private slots: Record<ClockSlot, VNode | HTMLElement>;

    constructor() {
        this.slots = {
            top: h(SLOT_SELECTOR.top),
            bottom: h(SLOT_SELECTOR.bottom),
            'top.bug': h(SLOT_SELECTOR['top.bug']),
            'bottom.bug': h(SLOT_SELECTOR['bottom.bug']),
        };
    }

    topPlaceholder(): VNode {
        return this.slots.top as VNode;
    }

    bottomPlaceholder(): VNode {
        return this.slots.bottom as VNode;
    }

    bugTopPlaceholder(): VNode {
        return this.slots['top.bug'] as VNode;
    }

    bugBottomPlaceholder(): VNode {
        return this.slots['bottom.bug'] as VNode;
    }

    render(slot: ClockSlot, vnode: VNode): void {
        this.slots[slot] = patch(this.slots[slot], vnode);
    }
}

export function renderClocks(ctrl: AnalysisController) {
    const lastStep = ctrl.tree.hasAnalysisTree() ? ctrl.tree.getTreeCurrentNode()?.step : ctrl.steps[ctrl.ply];
    if (!lastStep) return;
    const seatTime = (board: BugBoardName, color: cg.Color) =>
        clockTimeAt(lastStep, ctrl.seats.byBoardAndColor(board, color));
    if (lastStep.clocks) {
        renderClocksCC(ctrl.clockView, [seatTime('a', 'white')!, seatTime('a', 'black')!], ctrl.boardA, '');
    }
    if (lastStep.clocksB) {
        renderClocksCC(ctrl.clockView, [seatTime('b', 'white')!, seatTime('b', 'black')!], ctrl.boardB, '.bug');
    }
}

export function renderClocksCC(
    clockView: AnalysisClockView,
    clocks: Clocks,
    ctrl: GameControllerBughouse,
    suffix: string,
) {
    const isWhiteTurn = ctrl.turnColor === 'white';
    const whitePov = !ctrl.flipped();

    const wclass = whitePov ? 'bottom' : 'top';
    const wtime = clocks[WHITE];
    const wSlot = (wclass + suffix) as ClockSlot;
    clockView.render(wSlot, renderClock(wtime!, isWhiteTurn, wSlot));

    const bclass = whitePov ? 'top' : 'bottom';
    const btime = clocks[BLACK];
    const bSlot = (bclass + suffix) as ClockSlot;
    clockView.render(bSlot, renderClock(btime!, !isWhiteTurn, bSlot));
}

function renderClock(time: number, active: boolean, cls: string): VNode {
    return h(
        'div.anal-clock.' + cls,
        {
            class: { active },
        },
        clockContent(time),
    );
}

function clockContent(time: number): Array<string | VNode> {
    if (!time && time !== 0) return ['-'];
    const date = new Date(time),
        millis = date.getUTCMilliseconds(),
        sep = ':',
        baseStr = pad2(date.getUTCMinutes()) + sep + pad2(date.getUTCSeconds());
    if (time >= 3600000) return [Math.floor(time / 3600000) + sep + baseStr];
    return time >= 60000 ? [baseStr] : [baseStr, h('tenths', '.' + Math.floor(millis / 100).toString())];
}

function pad2(num: number): string {
    return (num < 10 ? '0' : '') + num;
}
