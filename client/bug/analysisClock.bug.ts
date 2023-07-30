import { h, VNode } from 'snabbdom';

import { patch } from '../document';
import AnalysisController from "./analysisCtrl";
import {ChessgroundController} from "./ChessgroundCtrl";
import {Clocks, Step} from "../messages";

export function renderClocks(ctrl: AnalysisController) {
    //todo:niki:should record on each move both clocks so we know what the time on the other board was when the move was made maybe. or could i reconstruct it actually. hmm... (see same comment in roundctrl.bug.ts)

    const lastStepA = ctrl.steps[ctrl.steps.findLastIndex((s, i) => s.boardName === "a" && i <= ctrl.ply)];
    const lastStepB = ctrl.steps[ctrl.steps.findLastIndex((s, i) => s.boardName === "b" && i <= ctrl.ply)];

    if (lastStepA) {
        renderClocksCC({white: lastStepA.clocks['white'], black: lastStepA.clocks['black']}, ctrl.b1, "");
    } else {
        renderClocksCC({white: ctrl.base * 60 * 1000, black: ctrl.base * 60 * 1000}, ctrl.b1, "");
    }
    if (lastStepB) {
        renderClocksCC({white:lastStepB.clocks['white'], black: lastStepB.clocks['black']}, ctrl.b2, ".bug");
    } else {
        renderClocksCC({white: ctrl.base * 60 * 1000, black: ctrl.base * 60 * 1000}, ctrl.b2, ".bug");
    }

    // const step = ctrl.steps[ctrl.ply];
    // if (step && step.boardName == 'a') {
    //     renderClocksCC(step, ctrl.b1, "");
    // } else {
    //     renderClocksCC(step, ctrl.b2, ".bug");
    // }
}

export function renderClocksCC(clocks: Clocks, ctrl: ChessgroundController, suffix: string) {
    const isWhiteTurn = ctrl.turnColor === "white";
    const whitePov = !ctrl.flipped();

    const wclass = whitePov ? 'bottom' : 'top';

    const wtime = clocks.white;
    let wel: VNode | HTMLElement = document.querySelector(`div.anal-clock.${wclass}${suffix}`) as HTMLElement;
    if (wel) {
        wel = patch(wel, h(`div.anal-clock.${wclass}${suffix}`, ''));
        patch(wel, renderClock(wtime!, isWhiteTurn, wclass+suffix));
    }
    const bclass = whitePov ? 'top' : 'bottom';
    const btime = clocks.black;
    let bel: VNode | HTMLElement = document.querySelector(`div.anal-clock.${bclass}${suffix}`) as HTMLElement;
    if (bel) {
        bel = patch(bel, h(`div.anal-clock.${bclass}${suffix}`, ''));
        patch(bel, renderClock(btime!, !isWhiteTurn, bclass+suffix));
    }
}


function renderClock(time: number, active: boolean, cls: string): VNode {
  return h(
    'div.anal-clock.' + cls,
    {
      class: { active },
    },
    clockContent(time)
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
