import { h, VNode } from 'snabbdom';

import { patch } from '../document';
import AnalysisController from "./analysisCtrl.bug";
import {GameControllerBughouse} from "./gameCtrl.bug";
import {Clocks, Step} from "../messages";

export function renderClocks(ctrl: AnalysisController) {
    const lastStep = ctrl.steps[ctrl.ply];
    renderClocksCC({white: lastStep.clocks!['white'], black: lastStep.clocks!['black']}, ctrl.b1, "");
    renderClocksCC({white: lastStep.clocksB!['white'], black: lastStep.clocksB!['black']}, ctrl.b2, ".bug");
    // const lastStepA = ctrl.steps[ctrl.steps.findLastIndex((s: Step, i: number) => s.boardName === "a" && i <= ctrl.ply)];
    // const lastStepB = ctrl.steps[ctrl.steps.findLastIndex((s: Step, i: number) => s.boardName === "b" && i <= ctrl.ply)];
    //
    // if (lastStepA && lastStepA.clocks) {
    //     renderClocksCC({white: lastStepA.clocks['white'], black: lastStepA.clocks['black']}, ctrl.b1, "");
    // } else {
    //     renderClocksCC({white: ctrl.base * 60 * 1000, black: ctrl.base * 60 * 1000}, ctrl.b1, "");
    // }
    // if (lastStepB && lastStepB.clocks) {
    //     renderClocksCC({white:lastStepB.clocks['white'], black: lastStepB.clocks['black']}, ctrl.b2, ".bug");
    // } else {
    //     renderClocksCC({white: ctrl.base * 60 * 1000, black: ctrl.base * 60 * 1000}, ctrl.b2, ".bug");
    // }
}

export function renderClocksCC(clocks: Clocks, ctrl: GameControllerBughouse, suffix: string) {
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
