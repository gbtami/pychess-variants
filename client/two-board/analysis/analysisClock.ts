import { h, VNode } from 'snabbdom';

import { patch } from '../../document';
import AnalysisController from './analysisCtrl';
import { GameControllerBughouse } from '../common/gameCtrl';
import { Clocks, Step } from '../../messages';
import { BLACK, WHITE } from '../../chess';
import { BugBoardName } from '../../types';

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

/* Every recorded ply carries four clock values but only ONE of them is trustworthy: the mover's.
 * See `reconstructMainlineClocks()` for what the other three actually contain and why they are
 * being deprecated rather than repaired.
 *
 * Reconstruction covers the recorded mainline only. Inside an analysis variation there are no
 * recorded clocks at all, so those steps keep the current behaviour: whatever the step carries. */
export function renderClocks(ctrl: AnalysisController) {
    const lastStep = ctrl.tree.hasAnalysisTree() ? ctrl.tree.getTreeCurrentNode()?.step : ctrl.steps[ctrl.ply];
    if (!lastStep) return;

    // Identity lookup rather than a ply number: inside a variation the node's step is not one of
    // `ctrl.steps` at all, and `indexOf` says so without needing to know how the tree numbers plies.
    const mainlinePly = ctrl.steps.indexOf(lastStep);
    const reconstructed = mainlinePly < 0 ? undefined : reconstructMainlineClocks(ctrl, mainlinePly);

    const clocksA = reconstructed?.a ?? lastStep.clocks;
    const clocksB = reconstructed?.b ?? lastStep.clocksB;

    if (clocksA) {
        renderClocksCC(ctrl.clockView, clocksA, ctrl.boardA, '');
    }
    if (clocksB) {
        renderClocksCC(ctrl.clockView, clocksB, ctrl.boardB, '.bug');
    }
}

/* What all four clocks read at the moment a ply was made, derived from authoritative values alone.
 *
 * THE PROBLEM. A move message carries all four clocks, but the mover's client only knows its own:
 * the three it does not own are read from `Clock.duration`, which for a RUNNING clock holds the
 * value at its last start, not the value on screen. So the seat thinking on the other board is
 * recorded as it was when its turn BEGAN. Measured on `sLF5O6kj` ply 2: 59:59.958 recorded for a
 * seat that had been thinking 447 seconds and really had ~52:33. Those three values are unreliable
 * by construction and worse after a disconnect; they are deprecated (see the comments in
 * `roundCtrl.sendMove`, `game_bug_clocks.update_clocks` and `bug/utils_bug.load_game`) and must not
 * be read. Only the mover's own value is real.
 *
 * THE DERIVATION, from mover values only — no timestamps needed. Bughouse has no increment, so on
 * each board exactly one clock runs at any instant and a board's TOTAL remaining falls 1:1 with
 * wall time. Both boards start at the same total and share the same wall clock, so their totals are
 * equal at every instant — the same invariant the round page's difference badges rest on. Hence at
 * ply `i`, played on board X:
 *
 *   1. X's mover      = this ply's authoritative value.
 *   2. X's other seat = its own last authoritative value; it has been paused since it moved.
 *   3. Y's total      = X's total, by the invariant above.
 *   4. Y's paused seat = its own last authoritative value (same reasoning as 2).
 *   5. Y's thinking seat = Y's total - Y's paused seat.
 *
 * Cross-checked against the independent `ts` route (start-of-turn value minus elapsed wall time)
 * on 52 plies across three recorded games: the two agree within ~50ms, and both differ from the
 * stored value by up to 447s where a seat was mid-think.
 *
 * Returns undefined when the derivation does not hold — an increment, or a ply whose mover value
 * is missing — and the caller then falls back to the stored values. */
function reconstructMainlineClocks(
    ctrl: AnalysisController,
    ply: number,
): { a: Clocks; b: Clocks } | undefined {
    if (ctrl.inc !== 0) return undefined;

    const base = ctrl.base * 1000 * 60;
    // Last authoritative value per seat: what it read when it last moved, base before its first.
    const own: Record<BugBoardName, Clocks> = { a: [base, base], b: [base, base] };
    // Whose turn it is on each board; both boards start with White to move.
    const toMove: Record<BugBoardName, number> = { a: WHITE, b: WHITE };

    for (let i = 1; i <= ply; i++) {
        const step: Step = ctrl.steps[i];
        const board = step.boardName as BugBoardName | undefined;
        if (board === undefined) return undefined;

        const recorded = board === 'a' ? step.clocks : step.clocksB;
        const mover = step.turnColor === 'white' ? BLACK : WHITE;
        const moverTime = recorded?.[mover];
        if (moverTime === undefined || moverTime === null) return undefined;

        own[board][mover] = moverTime;
        toMove[board] = mover === WHITE ? BLACK : WHITE;
    }

    if (ply === 0) return { a: [base, base], b: [base, base] };

    const moved = ctrl.steps[ply].boardName as BugBoardName;
    const other: BugBoardName = moved === 'a' ? 'b' : 'a';

    const total = own[moved][WHITE] + own[moved][BLACK];
    const thinking = toMove[other];
    const paused = thinking === WHITE ? BLACK : WHITE;

    const result: Record<BugBoardName, Clocks> = { a: [0, 0], b: [0, 0] };
    result[moved] = [own[moved][WHITE], own[moved][BLACK]];
    result[other][paused] = own[other][paused];
    // Clamped because a record damaged by a resync (see `stress-tests.md` S10) can make this negative.
    result[other][thinking] = Math.max(0, total - own[other][paused]);

    return { a: result.a, b: result.b };
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
