import { h, VNode } from 'snabbdom';

import AnalysisController from './analysisCtrl';
import { patch } from './document';

export function renderClocks(ctrl: AnalysisController) {
    const isWhiteTurn = ctrl.turnColor === "white";
    const whitePov = !ctrl.flip;

    const wclass = whitePov ? 'bottom' : 'top';
    const wtime = ctrl.steps[ctrl.ply]?.clocks?.white;
    let wel: VNode | HTMLElement = document.querySelector(`div.anal-clock.${wclass}`) as HTMLElement;
    if (wel) {
        wel = patch(wel, h(`div.anal-clock.${wclass}`, ''));
        patch(wel, renderClock(wtime!, isWhiteTurn, wclass));
    }
    const bclass = whitePov ? 'top' : 'bottom';
    const btime = ctrl.steps[ctrl.ply]?.clocks?.black;
    let bel: VNode | HTMLElement = document.querySelector(`div.anal-clock.${bclass}`) as HTMLElement;
    if (bel) {
        bel = patch(bel, h(`div.anal-clock.${bclass}`, ''));
        patch(bel, renderClock(btime!, !isWhiteTurn, bclass));
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
  if (time >= 360000) return [Math.floor(time / 360000) + sep + baseStr];
  return time >= 6000 ? [baseStr] : [baseStr, h('tenths', '.' + Math.floor(millis / 100).toString())];
}

function pad2(num: number): string {
  return (num < 10 ? '0' : '') + num;
}
