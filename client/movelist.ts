import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Color } from 'chessgroundx/types';

import { gearButton, toggleOrientation } from './settings';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';


interface Eval {
  cp?: number;
  mate?: number;
}

function toPov(color: Color, diff: number): number {
  return color === 'white' ? diff : -diff;
}

function rawWinningChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.004 * cp)) - 1;
}

function cpWinningChances(cp: number): number {
  return rawWinningChances(Math.min(Math.max(-1000, cp), 1000));
}

function mateWinningChances(mate: number): number {
  var cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  var signed = cp * (mate > 0 ? 1 : -1);
  return rawWinningChances(signed);
}

function evalWinningChances(ev: Eval): number {
  return typeof ev.mate !== 'undefined' ? mateWinningChances(ev.mate) : cpWinningChances(ev.cp!);
}

// winning chances for a color
// 1  infinitely winning
// -1 infinitely losing
export function povChances(color: Color, ev: Eval) {
  return toPov(color, evalWinningChances(ev));
}

export function selectMove (ctrl, ply) {
    const active = document.querySelector('li.move.active');
    if (active) active.classList.remove('active');

    const elPly = document.querySelector(`li.move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');

    const gaugeEl = document.getElementById('gauge') as HTMLElement;
    if (gaugeEl) {
        const blackEl = gaugeEl.querySelector('div.black') as HTMLElement | undefined;
        if (blackEl && ctrl.steps[ply]['ceval'] !== undefined) {
            var score = ctrl.steps[ply]['ceval']['s'];
            if (score !== undefined) {
                const ev = povChances(ctrl.steps[ply]['turnColor'], score);
                blackEl.style.height = String(100 - (ev + 1) * 50) + '%';
            } else {
                blackEl.style.height = '50%';
            }
        }
    }
    ctrl.goPly(ply)
    scrollToPly(ctrl);

    if (ctrl instanceof AnalysisController) {
        const hc = ctrl.analysisChart;
        if (hc !== undefined) {
            const hcPt = hc.series[0].data[ply];
            if (hcPt !== undefined) hcPt.select();
        }
    }
}

function scrollToPly (ctrl) {
    if (ctrl.steps.length < 9) return;
    const movesEl = document.getElementById('moves') as HTMLElement;
    const plyEl = movesEl.querySelector('li.move.active') as HTMLElement | undefined;

    const movelistblockEl = document.getElementById('movelist-block') as HTMLElement;
    let st: number | undefined = undefined;

    if (ctrl.ply == 0) st = 0;
    else if (ctrl.ply == ctrl.steps.length - 1) st = 99999;
    else if (plyEl) st = plyEl.offsetTop - movelistblockEl.offsetHeight + plyEl.offsetHeight;

    if (typeof st == 'number') {
        if (plyEl && ctrl instanceof RoundController) {
            var isSmoothScrollSupported = 'scrollBehavior' in document.documentElement.style;
            if(isSmoothScrollSupported) {
                plyEl.scrollIntoView({behavior: "smooth", block: "center"});
            } else {
                plyEl.scrollIntoView(false);
            }
        } else {
            movelistblockEl.scrollTop = st;
        }
    }
}

export function movelistView (ctrl) {
    ctrl.vgear = gearButton(ctrl);
    var container = document.getElementById('move-controls') as HTMLElement;
    ctrl.moveControls = patch(container, h('div.btn-controls', [
            h('button#flip', { on: { click: () => toggleOrientation(ctrl) } }, [h('i', {props: {title: 'Flip board'}, class: {"icon": true, "icon-refresh": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, 0) } }, [h('i', {class: {"icon": true, "icon-fast-backward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, Math.max(ctrl.ply - 1, 0)) } }, [h('i', {class: {"icon": true, "icon-step-backward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, Math.min(ctrl.ply + 1, ctrl.steps.length - 1)) } }, [h('i', {class: {"icon": true, "icon-step-forward": true} } ), ]),
            h('button', { on: { click: () => selectMove(ctrl, ctrl.steps.length - 1) } }, [h('i', {class: {"icon": true, "icon-fast-forward": true} } ), ]),
            ctrl.vgear,
        ])
    );
    if (ctrl instanceof RoundController) {
        return h('div#moves', [h('ol.movelist#movelist')]);
    } else {
        return h('div.anal#moves', [h('ol.movelist#movelist')]);
    }
}

export function updateMovelist (ctrl, plyFrom, plyTo, activate: boolean = true) {
    var container = document.getElementById('movelist') as HTMLElement;
    const active = document.querySelector('li.move.active');
    if (active && activate) active.classList.remove('active');

    var moves: VNode[] = [];
    var ply, move, moveEl, el;
    for (ply = plyFrom; ply < plyTo; ply++) {

        move = ctrl.steps[ply]['san'];
        if (move === null) continue;

        moveEl = [h('san', move)];
        const scoreStr = (ctrl.steps[ply]['scoreStr'] === null) ? '' : ctrl.steps[ply]['scoreStr'];
        moveEl.push(h('eval#ply' + String(ply), scoreStr));
        const p = ply;
        el = h('li.move', {class: {active: ((ply === plyTo - 1) && activate)}, attrs: {ply: ply}, on: { click: () => selectMove(ctrl, p) }}, moveEl);
        if (ply % 2 !== 0) {
            moves.push(h('li.move.counter', (ply + 1) / 2));
        }
        moves.push(el);
    }
    patch(container, h('ol.movelist#movelist', moves));
    if (activate) scrollToPly(ctrl);
}